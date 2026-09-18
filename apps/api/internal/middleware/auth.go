package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/klados/api/internal/model"
	"gorm.io/gorm"
)

func Auth(jwtSecret string, dbs ...*gorm.DB) gin.HandlerFunc {
	var db *gorm.DB
	if len(dbs) > 0 {
		db = dbs[0]
	}

	return func(c *gin.Context) {
		// 1. Check X-API-Key header
		if apiKey := c.GetHeader("X-API-Key"); apiKey != "" {
			if authenticateAPIKey(c, db, apiKey) {
				return
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid api key"})
			return
		}

		// 2. Extract Bearer token or Cookie
		token := extractToken(c)
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}

		// 3. If token has API key format (e.g. starts with klados_)
		if strings.HasPrefix(token, "klados_") {
			if authenticateAPIKey(c, db, token) {
				return
			}
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid api key"})
			return
		}

		// 4. Try parsing as JWT token
		claims := jwt.MapClaims{}
		t, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})
		if err == nil && t.Valid {
			c.Set("user_id", claims["sub"])
			c.Next()
			return
		}

		// 5. Fallback: try checking if the token is an API key in the database
		if authenticateAPIKey(c, db, token) {
			return
		}

		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
	}
}

func authenticateAPIKey(c *gin.Context, db *gorm.DB, token string) bool {
	if db == nil || strings.TrimSpace(token) == "" {
		return false
	}

	h := sha256.Sum256([]byte(token))
	hashStr := hex.EncodeToString(h[:])

	var apiKey model.APIKey
	if err := db.Where("key_hash = ?", hashStr).First(&apiKey).Error; err != nil {
		return false
	}

	now := time.Now()
	db.Model(&apiKey).Update("last_used_at", &now)

	c.Set("user_id", apiKey.UserID.String())
	c.Set("api_key_id", apiKey.ID.String())
	c.Next()
	return true
}

func extractToken(c *gin.Context) string {
	// Bearer header
	if h := c.GetHeader("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	// Cookie fallback
	if cookie, err := c.Cookie("access_token"); err == nil {
		return cookie
	}
	return ""
}