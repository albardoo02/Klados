package handler

import (
	"context"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"github.com/minio/minio-go/v7"
	"gorm.io/gorm"
)

type MediaHandler struct {
	DB          *gorm.DB
	Minio       *minio.Client
	Bucket      string
	Endpoint    string
}

var allowedMimeTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
	"image/svg+xml": true,
	"application/pdf": true,
}

func (h *MediaHandler) Upload(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	siteID := c.PostForm("site_id")

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no file provided"})
		return
	}
	defer file.Close()

	mimeType := header.Header.Get("Content-Type")
	if !allowedMimeTypes[mimeType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported file type"})
		return
	}

	if header.Size > 10*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large (max 10MB)"})
		return
	}

	ext := filepath.Ext(header.Filename)
	filename := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	storageKey := fmt.Sprintf("sites/%s/media/%s", siteID, filename)

	_, err = h.Minio.PutObject(
		context.Background(),
		h.Bucket,
		storageKey,
		file,
		header.Size,
		minio.PutObjectOptions{ContentType: mimeType},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upload file"})
		return
	}

	scheme := "http"
	if !strings.Contains(h.Endpoint, "localhost") {
		scheme = "https"
	}
	cdnURL := fmt.Sprintf("%s://%s/%s/%s", scheme, h.Endpoint, h.Bucket, storageKey)

	sUID, _ := uuid.Parse(siteID)
	uUID, _ := uuid.Parse(userIDStr)

	media := &model.MediaFile{
		SiteID:       sUID,
		UserID:       uUID,
		Filename:     filename,
		OriginalName: header.Filename,
		MimeType:     mimeType,
		Size:         header.Size,
		StorageKey:   storageKey,
		CDNURL:       cdnURL,
		CreatedAt:    time.Now(),
	}

	if err := h.DB.Create(media).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save media record"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": media})
}

func (h *MediaHandler) List(c *gin.Context) {
	siteID := c.Query("site_id")
	var files []model.MediaFile
	h.DB.Where("site_id = ?", siteID).Order("created_at desc").Find(&files)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": files})
}

func (h *MediaHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	var media model.MediaFile
	if err := h.DB.Where("id = ?", id).First(&media).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "media not found"})
		return
	}

	h.Minio.RemoveObject(context.Background(), h.Bucket, media.StorageKey, minio.RemoveObjectOptions{})
	h.DB.Delete(&media)

	c.JSON(http.StatusOK, gin.H{"success": true})
}