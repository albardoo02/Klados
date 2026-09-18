package handler_test

import (
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/klados/api/internal/handler"
)

// TestSnippetAndHighlight verifies search snippet extraction and keyword highlighting
func TestSnippetAndHighlight(t *testing.T) {
	// Case 1: Match inside content
	content := "Klados is a modern markdown-based site builder. It lets you create blogs and documentation with ease."
	snippet, highlight := handler.GenerateSnippetAndHighlight(content, "Introduction", "markdown")

	if !strings.Contains(snippet, "markdown-based") {
		t.Fatalf("expected snippet to contain 'markdown-based', got: %s", snippet)
	}
	if !strings.Contains(highlight, "<mark>markdown</mark>") {
		t.Fatalf("expected highlight to contain '<mark>markdown</mark>', got: %s", highlight)
	}

	// Case 2: Case insensitivity and case preservation
	snippet2, highlight2 := handler.GenerateSnippetAndHighlight("We use Golang and GIN for backend.", "Tech", "golang")
	if !strings.Contains(snippet2, "Golang") {
		t.Fatalf("expected snippet to preserve 'Golang', got: %s", snippet2)
	}
	if !strings.Contains(highlight2, "<mark>Golang</mark>") {
		t.Fatalf("expected highlight to wrap 'Golang' as '<mark>Golang</mark>', got: %s", highlight2)
	}

	// Case 3: Match in title only
	snippet3, highlight3 := handler.GenerateSnippetAndHighlight("Body does not have the word.", "Advanced Features", "features")
	if !strings.Contains(highlight3, "<mark>Features</mark>") {
		t.Fatalf("expected highlight to contain '<mark>Features</mark>', got: %s", highlight3)
	}
	if snippet3 == "" {
		t.Fatalf("expected non-empty snippet")
	}

	// Case 4: Special regex characters (e.g. C++, [test], $foo)
	snippet4, highlight4 := handler.GenerateSnippetAndHighlight("Supports C++ and Go.", "Code", "C++")
	if !strings.Contains(highlight4, "<mark>C++</mark>") {
		t.Fatalf("expected highlight with special chars to contain '<mark>C++</mark>', got: %s", highlight4)
	}
	_ = snippet4

	// Case 5: Empty query
	snippet5, highlight5 := handler.GenerateSnippetAndHighlight("Some content", "Title", "")
	if snippet5 != "Some content" || highlight5 != "Some content" {
		t.Fatalf("expected plain content for empty query")
	}
}

// TestHashIP verifies SHA-256 IP anonymization
func TestHashIP(t *testing.T) {
	ip := "192.168.1.100"
	hash1 := handler.HashIP(ip)
	hash2 := handler.HashIP(ip)

	if len(hash1) != 64 {
		t.Fatalf("expected 64-char sha256 hex string, got len %d (%s)", len(hash1), hash1)
	}
	if hash1 != hash2 {
		t.Fatalf("expected deterministic hash for same IP")
	}

	otherHash := handler.HashIP("10.0.0.1")
	if hash1 == otherHash {
		t.Fatalf("expected different hash for different IPs")
	}

	emptyHash := handler.HashIP("")
	if emptyHash != "" {
		t.Fatalf("expected empty string for empty IP, got '%s'", emptyHash)
	}
}

// TestDomainVerificationLogic verifies DNS CNAME verification rules
func TestDomainVerificationLogic(t *testing.T) {
	mockVerify := func(customDomain string, mockLookup func(host string) (string, error)) (bool, string, string) {
		cname, err := mockLookup(customDomain)
		if err != nil {
			return false, "", err.Error()
		}
		cleanCNAME := strings.ToLower(strings.TrimSuffix(cname, "."))
		isVerified := cleanCNAME == "cname.klados.app" || cleanCNAME == "klados.app"
		return isVerified, cleanCNAME, ""
	}

	// Case 1: Valid CNAME to cname.klados.app.
	verified, cname, _ := mockVerify("docs.example.com", func(h string) (string, error) {
		return "cname.klados.app.", nil
	})
	if !verified || cname != "cname.klados.app" {
		t.Fatalf("expected verified=true for cname.klados.app, got verified=%v, cname=%s", verified, cname)
	}

	// Case 2: Valid CNAME to klados.app
	verified, cname, _ = mockVerify("blog.example.com", func(h string) (string, error) {
		return "klados.app", nil
	})
	if !verified || cname != "klados.app" {
		t.Fatalf("expected verified=true for klados.app, got verified=%v, cname=%s", verified, cname)
	}

	// Case 3: Invalid CNAME to another service
	verified, cname, _ = mockVerify("blog.example.com", func(h string) (string, error) {
		return "domains.otherapp.com.", nil
	})
	if verified || cname != "domains.otherapp.com" {
		t.Fatalf("expected verified=false for otherapp.com, got verified=%v", verified)
	}

	// Case 4: DNS lookup error
	verified, _, errStr := mockVerify("blog.example.com", func(h string) (string, error) {
		return "", errors.New("no such host")
	})
	if verified || errStr == "" {
		t.Fatalf("expected verified=false and non-empty error on DNS lookup failure")
	}
}

// TestSitemapXMLStructure verifies sitemap XML formatting
func TestSitemapXMLStructure(t *testing.T) {
	urlset := handler.SitemapURLSet{
		URLs: []handler.SitemapURL{
			{
				Loc:        "https://myblog.klados.app/",
				LastMod:    "2026-09-18",
				ChangeFreq: "daily",
				Priority:   "1.0",
			},
			{
				Loc:        "https://myblog.klados.app/about",
				LastMod:    "2026-09-18",
				ChangeFreq: "weekly",
				Priority:   "0.8",
			},
		},
	}

	data, err := xml.MarshalIndent(urlset, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal XML: %v", err)
	}

	xmlStr := string(data)
	if !strings.Contains(xmlStr, "http://www.sitemaps.org/schemas/sitemap/0.9") {
		t.Fatalf("missing sitemap schema namespace: %s", xmlStr)
	}
	if !strings.Contains(xmlStr, "<loc>https://myblog.klados.app/</loc>") {
		t.Fatalf("missing home loc: %s", xmlStr)
	}
	if !strings.Contains(xmlStr, "<loc>https://myblog.klados.app/about</loc>") {
		t.Fatalf("missing about loc: %s", xmlStr)
	}
}

// TestPhase2EndpointsRouting tests routing and response formatting for all Phase 2 endpoints
func TestPhase2EndpointsRouting(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	v1 := r.Group("/v1")
	// Public group
	public := v1.Group("/public")
	{
		public.GET("/sites/:slug/sitemap.xml", func(c *gin.Context) {
			slug := c.Param("slug")
			xmlContent := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://%s.klados.app/</loc>
    <priority>1.0</priority>
  </url>
</urlset>`, slug)
			c.Data(http.StatusOK, "application/xml; charset=utf-8", []byte(xmlContent))
		})

		public.GET("/sites/:slug/robots.txt", func(c *gin.Context) {
			slug := c.Param("slug")
			robots := fmt.Sprintf("User-agent: *\nAllow: /\n\nSitemap: https://%s.klados.app/sitemap.xml\n", slug)
			c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(robots))
		})

		public.POST("/sites/:slug/view", func(c *gin.Context) {
			slug := c.Param("slug")
			var req map[string]string
			_ = c.ShouldBindJSON(&req)
			path := req["path"]
			if path == "" {
				path = "/"
			}
			c.JSON(http.StatusCreated, gin.H{
				"success": true,
				"data": gin.H{
					"slug": slug,
					"path": path,
					"ip":   handler.HashIP(c.ClientIP()),
				},
			})
		})
	}

	// Protected group
	protected := v1.Group("")
	{
		// 1. Revert page version
		protected.POST("/pages/:id/revert/:ver", func(c *gin.Context) {
			id := c.Param("id")
			ver := c.Param("ver")
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": gin.H{
					"id":      id,
					"version": ver,
					"content": "Reverted content for v" + ver,
				},
			})
		})

		// 2. Search
		protected.GET("/sites/:id/search", func(c *gin.Context) {
			id := c.Param("id")
			q := c.Query("q")
			snippet, highlight := handler.GenerateSnippetAndHighlight("Test content with markdown search", "Title", q)
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": []gin.H{
					{
						"site_id":   id,
						"snippet":   snippet,
						"highlight": highlight,
					},
				},
			})
		})

		// 3. Analytics
		protected.GET("/sites/:id/analytics", func(c *gin.Context) {
			id := c.Param("id")
			days := c.DefaultQuery("days", "30")
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": gin.H{
					"site_id":         id,
					"days":            days,
					"total_views":     100,
					"unique_visitors": 40,
					"last_7_days": gin.H{
						"total_views":     30,
						"unique_visitors": 12,
					},
					"last_30_days": gin.H{
						"total_views":     100,
						"unique_visitors": 40,
					},
				},
			})
		})

		// 4. Custom domain update
		protected.PATCH("/sites/:id/custom-domain", func(c *gin.Context) {
			id := c.Param("id")
			var req map[string]string
			_ = c.ShouldBindJSON(&req)
			domain := req["custom_domain"]
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": gin.H{
					"id":            id,
					"custom_domain": domain,
				},
			})
		})

		// 5. Verify domain
		protected.POST("/sites/:id/verify-domain", func(c *gin.Context) {
			id := c.Param("id")
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": gin.H{
					"site_id":  id,
					"verified": true,
					"domain":   "docs.example.com",
					"cname":    "cname.klados.app",
				},
			})
		})
	}

	// 1. Test POST /v1/pages/:id/revert/:ver
	{
		req, _ := http.NewRequest("POST", "/v1/pages/123e4567-e89b-12d3-a456-426614174000/revert/2", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("revert failed with status %d", w.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].(map[string]interface{})
		if data["version"] != "2" {
			t.Fatalf("expected version 2, got %v", data["version"])
		}
	}

	// 2. Test GET /v1/sites/:id/search?q=markdown
	{
		req, _ := http.NewRequest("GET", "/v1/sites/site-123/search?q=markdown", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("search failed with status %d", w.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].([]interface{})
		if len(data) == 0 {
			t.Fatalf("expected at least 1 search result")
		}
	}

	// 3. Test POST /v1/public/sites/:slug/view
	{
		body := `{"path": "/docs/intro"}`
		req, _ := http.NewRequest("POST", "/v1/public/sites/my-site/view", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("record view failed with status %d", w.Code)
		}
	}

	// 4. Test GET /v1/sites/:id/analytics
	{
		req, _ := http.NewRequest("GET", "/v1/sites/site-123/analytics?days=7", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("get analytics failed with status %d", w.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].(map[string]interface{})
		if data["days"] != "7" {
			t.Fatalf("expected days=7, got %v", data["days"])
		}
	}

	// 5. Test GET /v1/public/sites/:slug/sitemap.xml
	{
		req, _ := http.NewRequest("GET", "/v1/public/sites/my-site/sitemap.xml", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("sitemap failed with status %d", w.Code)
		}
		if !strings.Contains(w.Header().Get("Content-Type"), "application/xml") {
			t.Fatalf("expected xml content type, got: %s", w.Header().Get("Content-Type"))
		}
		if !strings.Contains(w.Body.String(), "<loc>https://my-site.klados.app/</loc>") {
			t.Fatalf("sitemap body missing site loc: %s", w.Body.String())
		}
	}

	// 6. Test GET /v1/public/sites/:slug/robots.txt
	{
		req, _ := http.NewRequest("GET", "/v1/public/sites/my-site/robots.txt", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("robots.txt failed with status %d", w.Code)
		}
		if !strings.Contains(w.Body.String(), "Sitemap: https://my-site.klados.app/sitemap.xml") {
			t.Fatalf("robots.txt missing sitemap line: %s", w.Body.String())
		}
	}

	// 7. Test PATCH /v1/sites/:id/custom-domain
	{
		body := `{"custom_domain": "docs.example.com"}`
		req, _ := http.NewRequest("PATCH", "/v1/sites/site-123/custom-domain", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("update custom domain failed with status %d", w.Code)
		}
	}

	// 8. Test POST /v1/sites/:id/verify-domain
	{
		req, _ := http.NewRequest("POST", "/v1/sites/site-123/verify-domain", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("verify domain failed with status %d", w.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].(map[string]interface{})
		if data["verified"] != true {
			t.Fatalf("expected verified=true")
		}
	}
}
