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
	DB       *gorm.DB
	Minio    *minio.Client
	Bucket   string
	Endpoint string
}

var allowedMimeTypes = map[string]bool{
	"image/jpeg":      true,
	"image/png":       true,
	"image/gif":       true,
	"image/webp":      true,
	"image/svg+xml":   true,
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

func (h *MediaHandler) UploadAvatar(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	uUID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		file, header, err = c.Request.FormFile("avatar")
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "画像ファイルを指定してください"})
		return
	}
	defer file.Close()

	mimeType := header.Header.Get("Content-Type")
	if !strings.HasPrefix(mimeType, "image/") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "画像ファイル (JPEG, PNG, WebP, GIF) を指定してください"})
		return
	}

	if header.Size > 5*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ファイルサイズは最大5MBまでです"})
		return
	}

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".png"
	}
	filename := fmt.Sprintf("%s%s", uuid.New().String()[:8], ext)
	storageKey := fmt.Sprintf("avatars/%s-%s", userIDStr, filename)

	_, err = h.Minio.PutObject(
		context.Background(),
		h.Bucket,
		storageKey,
		file,
		header.Size,
		minio.PutObjectOptions{ContentType: mimeType},
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "アバターのアップロードに失敗しました"})
		return
	}

	scheme := "http"
	if !strings.Contains(h.Endpoint, "localhost") {
		scheme = "https"
	}
	avatarURL := fmt.Sprintf("%s://%s/%s/%s", scheme, h.Endpoint, h.Bucket, storageKey)

	var user model.User
	if err := h.DB.Where("id = ?", uUID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ユーザーが見つかりません"})
		return
	}

	user.AvatarURL = avatarURL
	if err := h.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ユーザー情報の更新に失敗しました"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"avatar_url": avatarURL,
			"user":       user,
		},
	})
}

func (h *MediaHandler) ServeFile(c *gin.Context) {
	key := c.Param("key")
	key = strings.TrimPrefix(key, "/")

	obj, err := h.Minio.GetObject(c.Request.Context(), h.Bucket, key, minio.GetObjectOptions{})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}
	defer obj.Close()

	stat, err := obj.Stat()
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}

	c.Header("Cache-Control", "public, max-age=86400")
	c.Header("Content-Disposition", "inline")
	c.DataFromReader(http.StatusOK, stat.Size, stat.ContentType, obj, nil)
}

func (h *MediaHandler) ServeByID(c *gin.Context) {
	idStr := c.Param("id")
	idStr = strings.TrimPrefix(idStr, "/")
	cleanID := strings.TrimSuffix(idStr, filepath.Ext(idStr))

	uUID, err := uuid.Parse(cleanID)
	if err != nil {
		uUID, err = uuid.Parse(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid media id"})
			return
		}
	}

	var media model.MediaFile
	if err := h.DB.Where("id = ?", uUID).Limit(1).Find(&media).Error; err != nil || media.ID == uuid.Nil {
		// Fallback: search by storage_key or file_name containing the cleanID
		if err2 := h.DB.Where("storage_key LIKE ? OR file_name LIKE ?", "%"+cleanID+"%", "%"+cleanID+"%").Limit(1).Find(&media).Error; err2 != nil || media.ID == uuid.Nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "media not found"})
			return
		}
	}

	if c.Query("format") == "json" {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": media})
		return
	}

	// Try serving from MinIO directly
	if h.Minio != nil && h.Bucket != "" && media.StorageKey != "" {
		obj, err := h.Minio.GetObject(c.Request.Context(), h.Bucket, media.StorageKey, minio.GetObjectOptions{})
		if err == nil {
			defer obj.Close()
			stat, err := obj.Stat()
			if err == nil {
				contentType := media.MimeType
				if contentType == "" {
					contentType = stat.ContentType
				}
				c.Header("Cache-Control", "public, max-age=86400")
				c.Header("Content-Disposition", "inline")
				c.DataFromReader(http.StatusOK, stat.Size, contentType, obj, nil)
				return
			}
		}
	}

	// Fallback to CDNURL redirect if MinIO direct stream fails
	if media.CDNURL != "" {
		c.Redirect(http.StatusFound, media.CDNURL)
		return
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "media content not found"})
}
