package handler

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"github.com/klados/api/internal/storage"
	"github.com/minio/minio-go/v7"
	"gorm.io/gorm"
)

type MediaHandler struct {
	DB       *gorm.DB
	Storage  storage.Storage
	Minio    *minio.Client
	Bucket   string
	Endpoint string
}

func isDangerousSVG(r io.Reader) bool {
	buf := make([]byte, 512*1024) // inspect up to 512KB
	n, _ := r.Read(buf)
	content := strings.ToLower(string(buf[:n]))

	dangerousPatterns := []string{
		"<script",
		"javascript:",
		"vbscript:",
		"onload=",
		"onerror=",
		"onclick=",
		"onmouseover=",
		"onunload=",
		"<iframe",
		"<object",
		"<embed",
		"<foreignobject",
	}

	for _, pattern := range dangerousPatterns {
		if strings.Contains(content, pattern) {
			return true
		}
	}
	return false
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

	// SVG XSS 対策: スクリプトや埋め込みオブジェクトを含む危険なSVGを拒否
	if mimeType == "image/svg+xml" || strings.EqualFold(filepath.Ext(header.Filename), ".svg") {
		if isDangerousSVG(file) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "セキュリティエラー: 危険なスクリプトまたはタグが含まれているためアップロードできません"})
			return
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ファイルの読み取り位置のリセットに失敗しました"})
			return
		}
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

	var uploaded bool
	if h.Storage != nil {
		if err := h.Storage.Save(c.Request.Context(), storageKey, file, header.Size, mimeType); err != nil {
			log.Printf("[MediaHandler.Upload] Storage.Save error: %v (key: %s)", err, storageKey)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to upload file to storage: %v", err)})
			return
		}
		uploaded = true
	} else if h.Minio != nil && h.Bucket != "" {
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
		uploaded = true
	}

	if !uploaded {
		log.Printf("[MediaHandler.Upload] No storage driver configured for key: %s", storageKey)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no storage driver configured"})
		return
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

	if h.Storage != nil {
		_ = h.Storage.Delete(context.Background(), media.StorageKey)
	} else if h.Minio != nil && h.Bucket != "" {
		h.Minio.RemoveObject(context.Background(), h.Bucket, media.StorageKey, minio.RemoveObjectOptions{})
	}
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
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !strings.HasPrefix(mimeType, "image/") || mimeType == "image/svg+xml" || ext == ".svg" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "画像ファイル (JPEG, PNG, WebP, GIF) を指定してください"})
		return
	}

	if header.Size > 5*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ファイルサイズは最大5MBまでです"})
		return
	}

	if ext == "" {
		ext = ".png"
	}
	filename := fmt.Sprintf("%s%s", uuid.New().String()[:8], ext)
	storageKey := fmt.Sprintf("avatars/%s-%s", userIDStr, filename)

	var uploaded bool
	if h.Storage != nil {
		if err := h.Storage.Save(context.Background(), storageKey, file, header.Size, mimeType); err == nil {
			uploaded = true
		} else {
			log.Printf("[MediaHandler.UploadAvatar] Storage.Save error: %v", err)
		}
	} else if h.Minio != nil && h.Bucket != "" {
		_, err = h.Minio.PutObject(
			context.Background(),
			h.Bucket,
			storageKey,
			file,
			header.Size,
			minio.PutObjectOptions{ContentType: mimeType},
		)
		if err == nil {
			uploaded = true
		} else {
			log.Printf("[MediaHandler.UploadAvatar] MinIO PutObject error: %v", err)
		}
	}

	if !uploaded {
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

	if h.Storage != nil {
		rc, size, cType, err := h.Storage.Get(c.Request.Context(), key)
		if err == nil {
			defer rc.Close()
			c.Header("Cache-Control", "public, max-age=86400")
			c.Header("Content-Disposition", "inline")
			if strings.Contains(strings.ToLower(cType), "svg") {
				c.Header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
			}
			c.DataFromReader(http.StatusOK, size, cType, rc, nil)
			return
		}
	}

	if h.Minio != nil && h.Bucket != "" {
		obj, err := h.Minio.GetObject(c.Request.Context(), h.Bucket, key, minio.GetObjectOptions{})
		if err == nil {
			defer obj.Close()
			stat, sErr := obj.Stat()
			if sErr == nil {
				c.Header("Cache-Control", "public, max-age=86400")
				c.Header("Content-Disposition", "inline")
				if strings.Contains(strings.ToLower(stat.ContentType), "svg") {
					c.Header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
				}
				c.DataFromReader(http.StatusOK, stat.Size, stat.ContentType, obj, nil)
				return
			}
		}
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
}

func (h *MediaHandler) ServeByID(c *gin.Context) {
	idStr := strings.TrimPrefix(c.Param("id"), "/")
	idStr = strings.TrimPrefix(strings.TrimPrefix(idStr, "media:"), "klados-media:")
	cleanID := strings.TrimSuffix(idStr, filepath.Ext(idStr))
	cleanID = strings.TrimPrefix(strings.TrimPrefix(cleanID, "media:"), "klados-media:")

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
		log.Printf("[MediaHandler.ServeByID] Media record not found in DB for id: '%s' (cleanID: '%s', idStr: '%s')", c.Param("id"), cleanID, idStr)
		c.JSON(http.StatusNotFound, gin.H{"error": "media not found"})
		return
	}

	if c.Query("format") == "json" {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": media})
		return
	}

	// 3. ストレージから直接ストリーミング配信
	cleanKey := strings.TrimPrefix(media.StorageKey, "/")
	keysToTry := []string{
		media.StorageKey,
		cleanKey,
		strings.TrimPrefix(cleanKey, h.Bucket+"/"),
	}
	if idx := strings.Index(cleanKey, "/media/"); idx != -1 {
		keysToTry = append(keysToTry, cleanKey[idx+1:], cleanKey[idx+7:])
	}
	if media.Filename != "" && media.Filename != media.StorageKey {
		keysToTry = append(keysToTry, media.Filename)
	}

	// 3.1. h.Storage (Local or configured S3) からの取得
	if h.Storage != nil {
		for _, key := range keysToTry {
			if key == "" {
				continue
			}
			rc, size, cType, err := h.Storage.Get(c.Request.Context(), key)
			if err == nil {
				defer rc.Close()
				contentType := media.MimeType
				if contentType == "" {
					contentType = cType
				}
				if contentType == "" {
					contentType = "application/octet-stream"
				}

				c.Header("Cache-Control", "public, max-age=86400")
				c.Header("Content-Disposition", "inline")
				if strings.Contains(strings.ToLower(contentType), "svg") {
					c.Header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
				}
				c.DataFromReader(http.StatusOK, size, contentType, rc, nil)
				return
			}
		}
	}

	// 3.2. MinIO から直接ストリーミング配信 (レガシーフォールバック)
	if h.Minio != nil && h.Bucket != "" && media.StorageKey != "" {
		cleanKey := strings.TrimPrefix(media.StorageKey, "/")
		keysToTry := []string{
			media.StorageKey,
			cleanKey,
			strings.TrimPrefix(cleanKey, h.Bucket+"/"),
		}
		if idx := strings.Index(cleanKey, "/media/"); idx != -1 {
			keysToTry = append(keysToTry, cleanKey[idx+1:], cleanKey[idx+7:])
		}
		if media.Filename != "" && media.Filename != media.StorageKey {
			keysToTry = append(keysToTry, media.Filename)
		}

		var foundObj *minio.Object
		var stat minio.ObjectInfo
		for _, key := range keysToTry {
			if key == "" {
				continue
			}
			obj, err := h.Minio.GetObject(c.Request.Context(), h.Bucket, key, minio.GetObjectOptions{})
			if err == nil {
				st, sErr := obj.Stat()
				if sErr == nil {
					foundObj = obj
					stat = st
					break
				}
				obj.Close()
			}
		}

		if foundObj != nil {
			defer foundObj.Close()
			contentType := media.MimeType
			if contentType == "" {
				contentType = stat.ContentType
			}
			if contentType == "" {
				contentType = "application/octet-stream"
			}
			c.Header("Cache-Control", "public, max-age=86400")
			c.Header("Content-Disposition", "inline")
			if strings.Contains(strings.ToLower(contentType), "svg") {
				c.Header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
			}
			c.DataFromReader(http.StatusOK, stat.Size, contentType, foundObj, nil)
			return
		} else {
			log.Printf("[MediaHandler.ServeByID] MinIO object not found for media ID %s across keys %v in bucket '%s'", media.ID, keysToTry, h.Bucket)
		}
	}

	log.Printf("[MediaHandler.ServeByID] Media content not found in storage for media ID: %s", media.ID)
	c.JSON(http.StatusNotFound, gin.H{"error": "media content not found in storage"})
}

// getMediaReader attempts to open a stream for the given media file across storage drivers and fallback paths
func (h *MediaHandler) getMediaReader(ctx context.Context, media model.MediaFile) (io.ReadCloser, int64, string, error) {
	cleanKey := strings.TrimPrefix(media.StorageKey, "/")
	keysToTry := []string{
		media.StorageKey,
		cleanKey,
		media.Filename,
		fmt.Sprintf("sites/%s/media/%s", media.SiteID.String(), media.Filename),
		media.ID.String(),
	}
	if h.Bucket != "" {
		keysToTry = append(keysToTry, strings.TrimPrefix(cleanKey, h.Bucket+"/"))
	}
	if idx := strings.Index(cleanKey, "/media/"); idx != -1 {
		keysToTry = append(keysToTry, cleanKey[idx+1:], cleanKey[idx+7:])
	}
	if media.Filename != "" && media.Filename != media.StorageKey {
		keysToTry = append(keysToTry, media.Filename)
	}
	if media.OriginalName != "" {
		keysToTry = append(keysToTry,
			media.OriginalName,
			fmt.Sprintf("sites/%s/media/%s", media.SiteID.String(), media.OriginalName),
			fmt.Sprintf("media/%s", media.OriginalName),
			fmt.Sprintf("%s/%s", media.SiteID.String(), media.OriginalName),
		)
	}
	if media.ID != uuid.Nil {
		ext := filepath.Ext(media.Filename)
		if ext == "" {
			ext = filepath.Ext(media.OriginalName)
		}
		keysToTry = append(keysToTry,
			media.ID.String(),
			media.ID.String()+ext,
			fmt.Sprintf("sites/%s/media/%s%s", media.SiteID.String(), media.ID.String(), ext),
			fmt.Sprintf("media/%s%s", media.ID.String(), ext),
		)
	}

	if h.Storage != nil {
		for _, key := range keysToTry {
			if key == "" {
				continue
			}
			rc, size, cType, err := h.Storage.Get(ctx, key)
			if err == nil {
				contentType := media.MimeType
				if contentType == "" {
					contentType = cType
				}
				if contentType == "" {
					contentType = "application/octet-stream"
				}
				return rc, size, contentType, nil
			}
		}
	}

	if h.Minio != nil && h.Bucket != "" {
		for _, key := range keysToTry {
			if key == "" {
				continue
			}
			obj, err := h.Minio.GetObject(ctx, h.Bucket, key, minio.GetObjectOptions{})
			if err == nil {
				stat, sErr := obj.Stat()
				if sErr == nil {
					contentType := media.MimeType
					if contentType == "" {
						contentType = stat.ContentType
					}
					if contentType == "" {
						contentType = "application/octet-stream"
					}
					return obj, stat.Size, contentType, nil
				}
				obj.Close()
			}
		}
	}

	return nil, 0, "", fmt.Errorf("media file not found: %s", media.ID)
}

// MediaManifestItem represents metadata exported in manifest.json
type MediaManifestItem struct {
	ID           uuid.UUID `json:"id"`
	SiteID       uuid.UUID `json:"site_id"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"original_name"`
	MimeType     string    `json:"mime_type"`
	Size         int64     `json:"size"`
	StorageKey   string    `json:"storage_key"`
	Width        int       `json:"width,omitempty"`
	Height       int       `json:"height,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// Export packages all media files for a site (or all media) into a ZIP archive with manifest.json
func (h *MediaHandler) Export(c *gin.Context) {
	siteID := c.Query("site_id")
	if siteID == "" {
		siteID = c.Param("id")
	}

	var sUID uuid.UUID
	var siteSlug string
	if siteID != "" {
		if parsed, err := uuid.Parse(siteID); err == nil {
			sUID = parsed
			var s model.Site
			if err2 := h.DB.Where("id = ?", sUID).First(&s).Error; err2 == nil {
				siteSlug = s.Slug
			}
		} else {
			var s model.Site
			if err2 := h.DB.Where("slug = ? OR custom_domain = ?", siteID, siteID).First(&s).Error; err2 == nil {
				sUID = s.ID
				siteSlug = s.Slug
			}
		}
	}

	var files []model.MediaFile
	query := h.DB.Model(&model.MediaFile{})
	if sUID != uuid.Nil {
		query = query.Where("site_id = ?", sUID)
	}

	if err := query.Order("created_at asc").Find(&files).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "メディア一覧の取得に失敗しました"})
		return
	}

	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	manifestList := make([]MediaManifestItem, 0, len(files))

	for _, file := range files {
		manifestList = append(manifestList, MediaManifestItem{
			ID:           file.ID,
			SiteID:       file.SiteID,
			Filename:     file.Filename,
			OriginalName: file.OriginalName,
			MimeType:     file.MimeType,
			Size:         file.Size,
			StorageKey:   file.StorageKey,
			Width:        file.Width,
			Height:       file.Height,
			CreatedAt:    file.CreatedAt,
		})

		rc, _, _, err := h.getMediaReader(c.Request.Context(), file)
		if err != nil {
			log.Printf("[MediaHandler.Export] Warning: skipped missing file for media %s: %v", file.ID, err)
			continue
		}

		entryName := file.Filename
		if entryName == "" {
			entryName = file.ID.String()
		}

		w, err := zw.Create(entryName)
		if err != nil {
			rc.Close()
			continue
		}
		_, _ = io.Copy(w, rc)
		rc.Close()
	}

	// Write manifest.json
	manifestBytes, err := json.MarshalIndent(manifestList, "", "  ")
	if err == nil {
		if mw, mErr := zw.Create("manifest.json"); mErr == nil {
			_, _ = mw.Write(manifestBytes)
		}
	}

	if err := zw.Close(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ZIPアーカイブの作成に失敗しました"})
		return
	}

	exportFilename := "media-export.zip"
	if siteSlug != "" {
		exportFilename = fmt.Sprintf("%s-media-export.zip", siteSlug)
	}

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", exportFilename))
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}

// Import unzips an archive containing media files and optional manifest.json, restoring them to storage and database
func (h *MediaHandler) Import(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	uUID, _ := uuid.Parse(userIDStr)

	siteID := c.PostForm("site_id")
	if siteID == "" {
		siteID = c.Param("id")
	}
	if siteID == "" {
		siteID = c.Query("site_id")
	}

	var sUID uuid.UUID
	if siteID != "" {
		if parsed, err := uuid.Parse(siteID); err == nil {
			sUID = parsed
		} else {
			var s model.Site
			if err2 := h.DB.Where("slug = ? OR custom_domain = ?", siteID, siteID).First(&s).Error; err2 == nil {
				sUID = s.ID
			}
		}
	}

	if sUID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "有効なサイト (site_id) を指定してください"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "インポートするZIPファイルを指定してください"})
		return
	}
	defer file.Close()

	zipReader, err := zip.NewReader(file, header.Size)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("無効なZIPファイルです: %v", err)})
		return
	}

	// 1. manifest.json があれば読み込み
	manifestMap := make(map[string]MediaManifestItem)
	for _, zf := range zipReader.File {
		if strings.EqualFold(filepath.Base(zf.Name), "manifest.json") {
			rc, oErr := zf.Open()
			if oErr == nil {
				var items []MediaManifestItem
				if decErr := json.NewDecoder(rc).Decode(&items); decErr == nil {
					for _, item := range items {
						if item.Filename != "" {
							manifestMap[item.Filename] = item
							manifestMap[strings.ToLower(item.Filename)] = item
						}
						if item.ID != uuid.Nil {
							manifestMap[item.ID.String()] = item
							manifestMap[strings.ToLower(item.ID.String())] = item
						}
					}
				}
				rc.Close()
			}
			break
		}
	}

	importedCount := 0
	skippedCount := 0

	for _, zf := range zipReader.File {
		if zf.FileInfo().IsDir() {
			continue
		}
		baseName := filepath.Base(zf.Name)
		if strings.HasPrefix(baseName, ".") || strings.EqualFold(baseName, "manifest.json") || strings.Contains(zf.Name, "__MACOSX") {
			continue
		}

		ext := strings.ToLower(filepath.Ext(baseName))
		mimeType := mime.TypeByExtension(ext)
		if mimeType == "" {
			switch ext {
			case ".png":
				mimeType = "image/png"
			case ".jpg", ".jpeg":
				mimeType = "image/jpeg"
			case ".webp":
				mimeType = "image/webp"
			case ".gif":
				mimeType = "image/gif"
			case ".svg":
				mimeType = "image/svg+xml"
			case ".pdf":
				mimeType = "application/pdf"
			default:
				mimeType = "application/octet-stream"
			}
		}

		if !allowedMimeTypes[mimeType] && !strings.HasPrefix(mimeType, "image/") {
			skippedCount++
			continue
		}

		var mediaID uuid.UUID
		var originalName string
		cleanBase := strings.TrimSuffix(baseName, ext)

		// manifest.json からメタデータを優先取得
		if mItem, ok := manifestMap[baseName]; ok && mItem.ID != uuid.Nil {
			mediaID = mItem.ID
			originalName = mItem.OriginalName
			if mItem.MimeType != "" {
				mimeType = mItem.MimeType
			}
		} else if mItem, ok := manifestMap[cleanBase]; ok && mItem.ID != uuid.Nil {
			mediaID = mItem.ID
			originalName = mItem.OriginalName
			if mItem.MimeType != "" {
				mimeType = mItem.MimeType
			}
		} else {
			// ファイル名がUUIDの場合はそのUUIDをそのまま保持
			if parsedUID, pErr := uuid.Parse(cleanBase); pErr == nil && parsedUID != uuid.Nil {
				mediaID = parsedUID
				originalName = baseName
			} else {
				mediaID = uuid.New()
				originalName = baseName
			}
		}

		if originalName == "" {
			originalName = baseName
		}

		filename := fmt.Sprintf("%s%s", mediaID.String(), ext)
		storageKey := fmt.Sprintf("sites/%s/media/%s", sUID.String(), filename)

		rc, oErr := zf.Open()
		if oErr != nil {
			skippedCount++
			continue
		}

		var saveErr error
		if h.Storage != nil {
			saveErr = h.Storage.Save(c.Request.Context(), storageKey, rc, int64(zf.UncompressedSize64), mimeType)
		} else if h.Minio != nil && h.Bucket != "" {
			_, saveErr = h.Minio.PutObject(c.Request.Context(), h.Bucket, storageKey, rc, int64(zf.UncompressedSize64), minio.PutObjectOptions{
				ContentType: mimeType,
			})
		}
		rc.Close()

		if saveErr != nil {
			log.Printf("[MediaHandler.Import] Save error for %s: %v", storageKey, saveErr)
			skippedCount++
			continue
		}

		cdnURL := fmt.Sprintf("/v1/public/media/%s", mediaID.String())
		var existing model.MediaFile
		if err := h.DB.Where("id = ?", mediaID).First(&existing).Error; err == nil {
			existing.SiteID = sUID
			existing.Filename = filename
			existing.OriginalName = originalName
			existing.MimeType = mimeType
			existing.Size = int64(zf.UncompressedSize64)
			existing.StorageKey = storageKey
			existing.CDNURL = cdnURL
			_ = h.DB.Save(&existing)
		} else {
			newMedia := model.MediaFile{
				ID:           mediaID,
				SiteID:       sUID,
				UserID:       uUID,
				Filename:     filename,
				OriginalName: originalName,
				MimeType:     mimeType,
				Size:         int64(zf.UncompressedSize64),
				StorageKey:   storageKey,
				CDNURL:       cdnURL,
				CreatedAt:    time.Now(),
			}
			if cErr := h.DB.Create(&newMedia).Error; cErr != nil {
				log.Printf("[MediaHandler.Import] DB Create error for %s: %v", mediaID, cErr)
			}
		}

		importedCount++
	}

	c.JSON(http.StatusOK, gin.H{
		"success":        true,
		"imported_count": importedCount,
		"skipped_count":  skippedCount,
		"message":        fmt.Sprintf("%d 件のメディアファイルをインポートしました（スキップ: %d 件）", importedCount, skippedCount),
	})
}
