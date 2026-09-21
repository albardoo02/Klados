package handler

import (
	"context"
	"fmt"
	"log"
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
		log.Printf("[MediaHandler.Upload] FormFile error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("no file provided: %v", err)})
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

	sUID, err := uuid.Parse(siteID)
	if err != nil || sUID == uuid.Nil {
		var s model.Site
		if err2 := h.DB.Where("slug = ? OR custom_domain = ?", siteID, siteID).First(&s).Error; err2 == nil {
			sUID = s.ID
		} else {
			log.Printf("[MediaHandler.Upload] invalid site_id: %s", siteID)
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid site_id"})
			return
		}
	}

	mediaID := uuid.New()
	ext := filepath.Ext(header.Filename)
	filename := fmt.Sprintf("%s%s", mediaID.String(), ext)
	storageKey := fmt.Sprintf("sites/%s/media/%s", sUID.String(), filename)

	if h.Minio != nil && h.Bucket != "" {
		exists, bErr := h.Minio.BucketExists(c.Request.Context(), h.Bucket)
		if bErr != nil || !exists {
			if mErr := h.Minio.MakeBucket(c.Request.Context(), h.Bucket, minio.MakeBucketOptions{}); mErr == nil {
				policy := fmt.Sprintf(`{
					"Version": "2012-10-17",
					"Statement": [
						{
							"Effect": "Allow",
							"Principal": {"AWS": ["*"]},
							"Action": ["s3:GetObject"],
							"Resource": ["arn:aws:s3:::%s/*"]
						}
					]
				}`, h.Bucket)
				_ = h.Minio.SetBucketPolicy(c.Request.Context(), h.Bucket, policy)
			}
		}

		_, err = h.Minio.PutObject(
			context.Background(),
			h.Bucket,
			storageKey,
			file,
			header.Size,
			minio.PutObjectOptions{ContentType: mimeType},
		)
		if err != nil {
			log.Printf("[MediaHandler.Upload] PutObject error: %v (bucket: %s, key: %s)", err, h.Bucket, storageKey)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to upload file to storage: %v", err)})
			return
		}
	}

	uUID, _ := uuid.Parse(userIDStr)
	cdnURL := fmt.Sprintf("/v1/public/media/%s", mediaID.String())

	media := &model.MediaFile{
		ID:           mediaID,
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
		log.Printf("[MediaHandler.Upload] DB Create error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to save media record: %v", err)})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": media})
}

func (h *MediaHandler) List(c *gin.Context) {
	siteID := c.Query("site_id")
	var files []model.MediaFile
	h.DB.Where("site_id = ?", siteID).Order("created_at desc").Find(&files)

	for i := range files {
		// 内部MinIOホスト名や旧URLを救済し、常に外部から到達可能な /v1/public/media/:id を返却
		files[i].CDNURL = fmt.Sprintf("/v1/public/media/%s", files[i].ID.String())
	}

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

	avatarURL := fmt.Sprintf("/v1/public/media/file/%s", storageKey)

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
	idStr := strings.TrimPrefix(c.Param("id"), "/")
	cleanID := strings.TrimSuffix(idStr, filepath.Ext(idStr))

	var media model.MediaFile
	var found bool

	// 1. UUID での主キー検索（cleanID または idStr）
	if uUID, err := uuid.Parse(cleanID); err == nil && uUID != uuid.Nil {
		if err := h.DB.Where("id = ?", uUID).First(&media).Error; err == nil && media.ID != uuid.Nil {
			found = true
		}
	}
	if !found {
		if uUID, err := uuid.Parse(idStr); err == nil && uUID != uuid.Nil {
			if err := h.DB.Where("id = ?", uUID).First(&media).Error; err == nil && media.ID != uuid.Nil {
				found = true
			}
		}
	}

	// 2. filename, original_name, storage_key での検索（旧データや拡張子付き、元ファイル名でのアクセス対応）
	if !found {
		if err := h.DB.Where(
			"filename = ? OR filename = ? OR original_name = ? OR original_name = ? OR storage_key LIKE ? OR storage_key LIKE ?",
			idStr, cleanID, idStr, cleanID, "%/"+idStr, "%/"+cleanID+"%",
		).First(&media).Error; err == nil && media.ID != uuid.Nil {
			found = true
		}
	}

	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "media not found"})
		return
	}

	if c.Query("format") == "json" {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": media})
		return
	}

	// 3. MinIO から直接ストリーミング配信
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
				if contentType == "" {
					contentType = "application/octet-stream"
				}
				c.Header("Cache-Control", "public, max-age=86400")
				c.Header("Content-Disposition", "inline")
				c.DataFromReader(http.StatusOK, stat.Size, contentType, obj, nil)
				return
			} else {
				log.Printf("[MediaHandler.ServeByID] MinIO Stat error for key '%s' in bucket '%s': %v", media.StorageKey, h.Bucket, err)
			}
		} else {
			log.Printf("[MediaHandler.ServeByID] MinIO GetObject error for key '%s' in bucket '%s': %v", media.StorageKey, h.Bucket, err)
		}
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "media content not found in storage"})
}
