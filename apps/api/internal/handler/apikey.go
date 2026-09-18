package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"gorm.io/gorm"
)

type APIKeyHandler struct {
	DB *gorm.DB
}

type createAPIKeyRequest struct {
	Name string `json:"name" binding:"required"`
}

// GenerateAPIKey creates a cryptographically secure API key and its hash
func GenerateAPIKey() (token string, prefix string, hash string, err error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", "", "", err
	}
	randomPart := hex.EncodeToString(b)
	token = "klados_live_" + randomPart
	prefix = token[:16] + "..."
	h := sha256.Sum256([]byte(token))
	hash = hex.EncodeToString(h[:])
	return token, prefix, hash, nil
}

// HashAPIKey computes the SHA-256 hex string of a token
func HashAPIKey(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// List user's API keys
func (h *APIKeyHandler) List(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var keys []model.APIKey
	if err := h.DB.Where("user_id = ?", userID).Order("created_at desc").Find(&keys).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": keys})
}

// Create new API key and return token once
func (h *APIKeyHandler) Create(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req createAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	token, prefix, hash, err := GenerateAPIKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate api key"})
		return
	}

	apiKey := &model.APIKey{
		UserID:    userID,
		Name:      strings.TrimSpace(req.Name),
		KeyHash:   hash,
		KeyPrefix: prefix,
	}

	if err := h.DB.Create(apiKey).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data": gin.H{
			"id":         apiKey.ID,
			"name":       apiKey.Name,
			"key_prefix": apiKey.KeyPrefix,
			"token":      token,
			"created_at": apiKey.CreatedAt,
		},
	})
}

// Delete (revoke) an API key
func (h *APIKeyHandler) Delete(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	id := c.Param("id")
	result := h.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.APIKey{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "api key not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
