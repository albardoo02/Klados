package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestPublicRoutesSetup(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()


	api := r.Group("/v1/public")
	{
		api.GET("/sites/:slug", func(c *gin.Context) {
			slug := c.Param("slug")
			c.JSON(http.StatusOK, gin.H{"slug": slug})
		})
		api.GET("/sites/:slug/pages/*pageSlug", func(c *gin.Context) {
			slug := c.Param("slug")
			rawSlug := c.Param("pageSlug")
			pageSlug := strings.Trim(rawSlug, "/")
			c.JSON(http.StatusOK, gin.H{"slug": slug, "pageSlug": pageSlug})
		})
		api.GET("/sites/:slug/pages", func(c *gin.Context) {
			slug := c.Param("slug")
			c.JSON(http.StatusOK, gin.H{"slug": slug, "pageSlug": ""})
		})
	}

	// Test 1: GET /v1/public/sites/my-site
	{
		req, _ := http.NewRequest("GET", "/v1/public/sites/my-site", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var resp map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse JSON: %v", err)
		}
		if resp["slug"] != "my-site" {
			t.Fatalf("expected slug 'my-site', got '%s'", resp["slug"])
		}
	}

	// Test 2: GET /v1/public/sites/my-site/pages/about
	{
		req, _ := http.NewRequest("GET", "/v1/public/sites/my-site/pages/about", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var resp map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse JSON: %v", err)
		}
		if resp["slug"] != "my-site" || resp["pageSlug"] != "about" {
			t.Fatalf("expected slug='my-site' and pageSlug='about', got slug='%s' pageSlug='%s'", resp["slug"], resp["pageSlug"])
		}
	}

	// Test 3: GET /v1/public/sites/my-site/pages/nested/doc
	{
		req, _ := http.NewRequest("GET", "/v1/public/sites/my-site/pages/nested/doc", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var resp map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse JSON: %v", err)
		}
		if resp["pageSlug"] != "nested/doc" {
			t.Fatalf("expected pageSlug='nested/doc', got '%s'", resp["pageSlug"])
		}
	}

	// Test 4: GET /v1/public/sites/my-site/pages
	{
		req, _ := http.NewRequest("GET", "/v1/public/sites/my-site/pages", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var resp map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to parse JSON: %v", err)
		}
		if resp["pageSlug"] != "" {
			t.Fatalf("expected pageSlug='', got '%s'", resp["pageSlug"])
		}
	}
}

func TestMediaServeByIDRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	api := r.Group("/v1")
	public := api.Group("/public")
	{
		public.GET("/media/:id", func(c *gin.Context) {
			id := c.Param("id")
			c.JSON(http.StatusOK, gin.H{"id": id, "served": true})
		})
	}
	api.GET("/media/:id", func(c *gin.Context) {
		id := c.Param("id")
		c.JSON(http.StatusOK, gin.H{"id": id, "served_api": true})
	})

	testID := "e5e77619-5287-4c1a-9831-1e639159bf67"
	// Test 1: GET /v1/public/media/:id
	{
		req, _ := http.NewRequest("GET", "/v1/public/media/"+testID, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["id"] != testID || resp["served"] != true {
			t.Fatalf("unexpected response: %+v", resp)
		}
	}

	// Test 2: GET /v1/media/:id
	{
		req, _ := http.NewRequest("GET", "/v1/media/"+testID, nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
	}
}

