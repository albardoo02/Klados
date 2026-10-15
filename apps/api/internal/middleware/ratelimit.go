package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type clientBucket struct {
	tokens     float64
	lastRefill time.Time
}

type IPRateLimiter struct {
	mu      sync.Mutex
	clients map[string]*clientBucket
	rate    float64 // tokens added per second
	burst   float64 // maximum tokens bucket can hold
}

func NewIPRateLimiter(requestsPerMinute int, burst int) *IPRateLimiter {
	limiter := &IPRateLimiter{
		clients: make(map[string]*clientBucket),
		rate:    float64(requestsPerMinute) / 60.0,
		burst:   float64(burst),
	}

	// Periodic cleanup of inactive IPs every 5 minutes to prevent memory leaks
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			limiter.mu.Lock()
			now := time.Now()
			for ip, bucket := range limiter.clients {
				// Remove buckets idle for more than 10 minutes
				if now.Sub(bucket.lastRefill) > 10*time.Minute {
					delete(limiter.clients, ip)
				}
			}
			limiter.mu.Unlock()
		}
	}()

	return limiter
}

func (limiter *IPRateLimiter) Allow(ip string) bool {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	now := time.Now()
	bucket, exists := limiter.clients[ip]
	if !exists {
		limiter.clients[ip] = &clientBucket{
			tokens:     limiter.burst - 1,
			lastRefill: now,
		}
		return true
	}

	// Refill tokens based on elapsed time
	elapsed := now.Sub(bucket.lastRefill).Seconds()
	bucket.tokens += elapsed * limiter.rate
	if bucket.tokens > limiter.burst {
		bucket.tokens = limiter.burst
	}
	bucket.lastRefill = now

	if bucket.tokens >= 1.0 {
		bucket.tokens -= 1.0
		return true
	}

	return false
}

// RateLimit returns a Gin middleware that enforces IP rate limiting.
func RateLimit(requestsPerMinute int, burst int) gin.HandlerFunc {
	limiter := NewIPRateLimiter(requestsPerMinute, burst)

	return func(c *gin.Context) {
		// 静的メディアファイル（画像・アセット）へのリクエストはレートリミット対象外
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/v1/public/media") || strings.HasPrefix(path, "/v1/media/") {
			c.Next()
			return
		}

		ip := c.ClientIP()
		if !limiter.Allow(ip) {
			c.Header("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error":   fmt.Sprintf("リクエスト回数の上限（毎分%d回）を超過しました。しばらく待ってから再度お試しください。", requestsPerMinute),
				"status":  http.StatusTooManyRequests,
				"message": "Too Many Requests",
			})
			return
		}
		c.Next()
	}
}
