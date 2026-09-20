package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/klados/api/internal/model"
	"golang.org/x/crypto/bcrypt"
)

var defaultSiteSecret = "klados_site_access_secret_key"

type verifyPasswordRequest struct {
	Password string `json:"password" binding:"required"`
}

type setSitePasswordRequest struct {
	Password string `json:"password"`
}

// GenerateSiteAccessToken generates a signed token valid for 24 hours
func GenerateSiteAccessToken(siteID, slug string) string {
	exp := time.Now().Add(24 * time.Hour).Unix()
	payload := fmt.Sprintf("%s:%s:%d", siteID, slug, exp)
	mac := hmac.New(sha256.New, []byte(defaultSiteSecret))
	mac.Write([]byte(payload))
	signature := hex.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("%s:%s", payload, signature)
}

// ValidateSiteAccessToken checks whether a token is valid for a given site
func ValidateSiteAccessToken(token, siteID, slug string) bool {
	parts := strings.Split(token, ":")
	if len(parts) != 4 {
		return false
	}
	tokenSiteID := parts[0]
	tokenSlug := parts[1]
	expStr := parts[2]
	signature := parts[3]

	if tokenSiteID != siteID && tokenSlug != slug {
		return false
	}

	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return false
	}

	payload := fmt.Sprintf("%s:%s:%s", tokenSiteID, tokenSlug, expStr)
	mac := hmac.New(sha256.New, []byte(defaultSiteSecret))
	mac.Write([]byte(payload))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(signature), []byte(expectedSignature))
}

// CheckSiteAccess verifies if current request has access to a potentially password-protected site
func CheckSiteAccess(c *gin.Context, site *model.Site) bool {
	if site.PasswordHash == nil || *site.PasswordHash == "" {
		return true
	}

	// 1. Check direct password header
	if pass := c.GetHeader("X-Site-Password"); pass != "" {
		if bcrypt.CompareHashAndPassword([]byte(*site.PasswordHash), []byte(pass)) == nil {
			return true
		}
	}

	// 2. Check X-Site-Token header
	if token := c.GetHeader("X-Site-Token"); token != "" {
		if ValidateSiteAccessToken(token, site.ID.String(), site.Slug) {
			return true
		}
	}

	// 3. Check Authorization header
	if auth := c.GetHeader("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		token := strings.TrimPrefix(auth, "Bearer ")
		if ValidateSiteAccessToken(token, site.ID.String(), site.Slug) {
			return true
		}
	}

	// 4. Check cookies
	if cookie, err := c.Cookie("site_token_" + site.Slug); err == nil && cookie != "" {
		if ValidateSiteAccessToken(cookie, site.ID.String(), site.Slug) {
			return true
		}
	}
	if cookie, err := c.Cookie("site_token_" + site.ID.String()); err == nil && cookie != "" {
		if ValidateSiteAccessToken(cookie, site.ID.String(), site.Slug) {
			return true
		}
	}
	if cookie, err := c.Cookie("site_token"); err == nil && cookie != "" {
		if ValidateSiteAccessToken(cookie, site.ID.String(), site.Slug) {
			return true
		}
	}

	// 5. Query param
	if qToken := c.Query("site_token"); qToken != "" {
		if ValidateSiteAccessToken(qToken, site.ID.String(), site.Slug) {
			return true
		}
	}

	c.JSON(http.StatusUnauthorized, gin.H{
		"error":        "site is password protected",
		"is_protected": true,
		"slug":         site.Slug,
		"title":        site.Title,
	})
	return false
}

// VerifyPassword endpoint: POST /v1/public/sites/:slug/verify-password
func (h *SiteHandler) VerifyPassword(c *gin.Context) {
	slug := c.Param("slug")
	var site model.Site
	if err := h.DB.Where("(slug = ? OR custom_domain = ?) AND is_public = ?", slug, slug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	if site.PasswordHash == nil || *site.PasswordHash == "" {
		token := GenerateSiteAccessToken(site.ID.String(), site.Slug)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "site is not password protected",
			"token":   token,
		})
		return
	}

	var req verifyPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password required"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*site.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
		return
	}

	token := GenerateSiteAccessToken(site.ID.String(), site.Slug)
	c.SetCookie("site_token_"+site.Slug, token, 86400, "/", "", false, true)
	c.SetCookie("site_token", token, 86400, "/", "", false, true)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"token":   token,
		"slug":    site.Slug,
	})
}

// SetPassword sets or removes password protection for a site: POST /v1/sites/:id/password
func (h *SiteHandler) SetPassword(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	var site model.Site
	if err := h.DB.Where("id = ? AND user_id = ?", id, userID).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	var req setSitePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trimmed := strings.TrimSpace(req.Password)
	if trimmed == "" {
		site.PasswordHash = nil
	} else {
		hash, err := bcrypt.GenerateFromPassword([]byte(trimmed), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}
		hashStr := string(hash)
		site.PasswordHash = &hashStr
	}

	if err := h.DB.Save(&site).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"is_protected": site.PasswordHash != nil,
	})
}
