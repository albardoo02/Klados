package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// SecurityHeaders adds critical security HTTP headers to prevent common attacks:
// - X-Content-Type-Options: nosniff (prevent MIME type sniffing)
// - X-Frame-Options: SAMEORIGIN (prevent clickjacking while allowing same-origin embeds)
// - Referrer-Policy: strict-origin-when-cross-origin (protect sensitive URL params)
// - X-XSS-Protection: 1; mode=block (legacy browser XSS filter)
// - Permissions-Policy: camera=(), microphone=(), geolocation=() (block dangerous web APIs)
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "SAMEORIGIN")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		// If HTTPS, enforce Strict-Transport-Security (HSTS)
		if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
			c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
		}

		c.Next()
	}
}

// MaxBodySize restricts the maximum request body size to prevent memory-exhaustion DoS attacks.
// Default for standard API JSON requests is maxBytes (e.g. 2MB).
func MaxBodySize(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Do not restrict multipart uploads here (handled separately by MediaHandler with 10MB limit)
		path := c.Request.URL.Path
		if !strings.HasPrefix(path, "/v1/media") && !strings.HasPrefix(path, "/v1/sites") && path != "/v1/auth/avatar" {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		}
		c.Next()
	}
}
