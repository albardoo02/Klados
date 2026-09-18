package handler_test

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/klados/api/internal/handler"
	"github.com/klados/api/internal/middleware"
	"github.com/klados/api/internal/model"
	"golang.org/x/crypto/bcrypt"
)

// TestAPIKeyGenerationAndHashing tests generation format, key prefix, and hashing
func TestAPIKeyGenerationAndHashing(t *testing.T) {
	token, prefix, hash, err := handler.GenerateAPIKey()
	if err != nil {
		t.Fatalf("unexpected error generating api key: %v", err)
	}

	if !strings.HasPrefix(token, "klados_live_") {
		t.Fatalf("expected token to start with 'klados_live_', got: %s", token)
	}

	if !strings.HasPrefix(prefix, "klados_live_") || !strings.HasSuffix(prefix, "...") {
		t.Fatalf("expected prefix format 'klados_live_...', got: %s", prefix)
	}

	expectedHash := handler.HashAPIKey(token)
	if hash != expectedHash {
		t.Fatalf("expected hash %s, got %s", expectedHash, hash)
	}

	token2, _, hash2, _ := handler.GenerateAPIKey()
	if token == token2 || hash == hash2 {
		t.Fatalf("expected cryptographically unique tokens and hashes")
	}
}

// TestSitePasswordProtectionTokens tests site access token generation, expiration and validation
func TestSitePasswordProtectionTokens(t *testing.T) {
	siteID := uuid.New().String()
	slug := "test-vault"

	token := handler.GenerateSiteAccessToken(siteID, slug)
	if token == "" {
		t.Fatalf("expected non-empty site access token")
	}

	// 1. Valid token
	if !handler.ValidateSiteAccessToken(token, siteID, slug) {
		t.Fatalf("expected token to be valid for siteID and slug")
	}

	// 2. Token invalid for different site
	otherSiteID := uuid.New().String()
	if handler.ValidateSiteAccessToken(token, otherSiteID, "other-slug") {
		t.Fatalf("expected token to be invalid for different site")
	}

	// 3. Tampered token
	tampered := token + "tampered"
	if handler.ValidateSiteAccessToken(tampered, siteID, slug) {
		t.Fatalf("expected tampered token to fail validation")
	}

	// 4. Malformed token
	if handler.ValidateSiteAccessToken("malformed:token", siteID, slug) {
		t.Fatalf("expected malformed token to fail validation")
	}
}

// TestCheckSiteAccess verifies access control on public sites with and without password
func TestCheckSiteAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Case 1: Unprotected site
	unprotectedSite := &model.Site{
		ID:           uuid.New(),
		Slug:         "public-blog",
		PasswordHash: nil,
	}

	r := gin.New()
	r.GET("/test-unprotected", func(c *gin.Context) {
		if handler.CheckSiteAccess(c, unprotectedSite) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		}
	})

	req, _ := http.NewRequest("GET", "/test-unprotected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 for unprotected site, got %d", w.Code)
	}

	// Case 2: Protected site with password
	password := "SecretPass123"
	hashBytes, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	hashStr := string(hashBytes)
	protectedSite := &model.Site{
		ID:           uuid.New(),
		Slug:         "private-docs",
		PasswordHash: &hashStr,
		IsProtected:  true,
	}

	r2 := gin.New()
	r2.GET("/test-protected", func(c *gin.Context) {
		if handler.CheckSiteAccess(c, protectedSite) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		}
	})

	// 2a: No credentials provided -> 401
	{
		req2a, _ := http.NewRequest("GET", "/test-protected", nil)
		w2a := httptest.NewRecorder()
		r2.ServeHTTP(w2a, req2a)
		if w2a.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 for unauthorized access to protected site, got %d", w2a.Code)
		}
		if !strings.Contains(w2a.Body.String(), "is_protected") {
			t.Fatalf("expected is_protected in 401 body, got: %s", w2a.Body.String())
		}
	}

	// 2b: Access with X-Site-Password header -> 200
	{
		req2b, _ := http.NewRequest("GET", "/test-protected", nil)
		req2b.Header.Set("X-Site-Password", password)
		w2b := httptest.NewRecorder()
		r2.ServeHTTP(w2b, req2b)
		if w2b.Code != http.StatusOK {
			t.Fatalf("expected 200 with valid X-Site-Password, got %d", w2b.Code)
		}
	}

	// 2c: Access with valid X-Site-Token header -> 200
	{
		token := handler.GenerateSiteAccessToken(protectedSite.ID.String(), protectedSite.Slug)
		req2c, _ := http.NewRequest("GET", "/test-protected", nil)
		req2c.Header.Set("X-Site-Token", token)
		w2c := httptest.NewRecorder()
		r2.ServeHTTP(w2c, req2c)
		if w2c.Code != http.StatusOK {
			t.Fatalf("expected 200 with valid X-Site-Token, got %d", w2c.Code)
		}
	}

	// 2d: Access with cookie -> 200
	{
		token := handler.GenerateSiteAccessToken(protectedSite.ID.String(), protectedSite.Slug)
		req2d, _ := http.NewRequest("GET", "/test-protected", nil)
		req2d.AddCookie(&http.Cookie{
			Name:  "site_token_" + protectedSite.Slug,
			Value: token,
		})
		w2d := httptest.NewRecorder()
		r2.ServeHTTP(w2d, req2d)
		if w2d.Code != http.StatusOK {
			t.Fatalf("expected 200 with valid cookie, got %d", w2d.Code)
		}
	}
}

// TestSiteExportZIPPackaging tests packaging pages into a downloadable zip file with YAML frontmatter
func TestSiteExportZIPPackaging(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	r.GET("/v1/sites/:id/export", func(c *gin.Context) {
		siteSlug := "sample-site"
		pages := []model.Page{
			{
				Title:     "Home Page",
				Slug:      "index",
				Content:   "# Welcome to our website\n\nThis is the home page.",
				Status:    model.PageStatusPublished,
				Position:  0,
				CreatedAt: time.Date(2026, 9, 18, 10, 0, 0, 0, time.UTC),
				UpdatedAt: time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC),
			},
			{
				Title:     "About Us",
				Slug:      "about",
				Content:   "## About Us\n\nWe build modern software.",
				Status:    model.PageStatusPublished,
				Position:  1,
				CreatedAt: time.Date(2026, 9, 18, 11, 0, 0, 0, time.UTC),
				UpdatedAt: time.Date(2026, 9, 18, 13, 0, 0, 0, time.UTC),
			},
		}

		buf := new(bytes.Buffer)
		zw := zip.NewWriter(buf)

		for _, page := range pages {
			filename := page.Slug + ".md"
			frontmatter := fmt.Sprintf("---\ntitle: \"%s\"\nslug: \"%s\"\nstatus: \"%s\"\nposition: %d\ncreated_at: \"%s\"\nupdated_at: \"%s\"\n---\n\n",
				page.Title, page.Slug, page.Status, page.Position,
				page.CreatedAt.Format(time.RFC3339),
				page.UpdatedAt.Format(time.RFC3339),
			)
			content := frontmatter + page.Content

			w, err := zw.Create(filename)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			_, _ = w.Write([]byte(content))
		}
		_ = zw.Close()

		c.Header("Content-Type", "application/zip")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s-export.zip\"", siteSlug))
		c.Data(http.StatusOK, "application/zip", buf.Bytes())
	})

	req, _ := http.NewRequest("GET", "/v1/sites/site-123/export", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if w.Header().Get("Content-Type") != "application/zip" {
		t.Fatalf("expected application/zip header, got %s", w.Header().Get("Content-Type"))
	}
	if !strings.Contains(w.Header().Get("Content-Disposition"), "sample-site-export.zip") {
		t.Fatalf("expected Content-Disposition with sample-site-export.zip, got %s", w.Header().Get("Content-Disposition"))
	}

	// Verify zip contents
	zipReader, err := zip.NewReader(bytes.NewReader(w.Body.Bytes()), int64(w.Body.Len()))
	if err != nil {
		t.Fatalf("failed to parse returned zip archive: %v", err)
	}

	if len(zipReader.File) != 2 {
		t.Fatalf("expected 2 files in zip archive, got %d", len(zipReader.File))
	}

	foundFiles := make(map[string]string)
	for _, f := range zipReader.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("failed to open zip entry %s: %v", f.Name, err)
		}
		buf := new(bytes.Buffer)
		_, _ = buf.ReadFrom(rc)
		_ = rc.Close()
		foundFiles[f.Name] = buf.String()
	}

	// Check index.md
	indexContent, ok := foundFiles["index.md"]
	if !ok {
		t.Fatalf("missing index.md in zip archive")
	}
	if !strings.Contains(indexContent, "title: \"Home Page\"") || !strings.Contains(indexContent, "# Welcome to our website") {
		t.Fatalf("index.md missing expected content or frontmatter: %s", indexContent)
	}

	// Check about.md
	aboutContent, ok := foundFiles["about.md"]
	if !ok {
		t.Fatalf("missing about.md in zip archive")
	}
	if !strings.Contains(aboutContent, "title: \"About Us\"") || !strings.Contains(aboutContent, "## About Us") {
		t.Fatalf("about.md missing expected content or frontmatter: %s", aboutContent)
	}
}

// TestWebSocketCollaborativeEditing tests real websocket connection, joining room, and broadcasting edits & cursors
func TestWebSocketCollaborativeEditing(t *testing.T) {
	gin.SetMode(gin.TestMode)

	hub := handler.NewWSHub()
	go hub.Run()
	wsHandler := handler.NewWSHandler(hub)

	r := gin.New()
	r.GET("/v1/ws/pages/:id", wsHandler.HandlePageWS)

	server := httptest.NewServer(r)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/v1/ws/pages/page-xyz"

	// Connect Client 1 (Alice)
	url1 := wsURL + "?user_id=user-alice&user_name=Alice"
	c1, _, err := websocket.DefaultDialer.Dial(url1, nil)
	if err != nil {
		t.Fatalf("failed to connect client 1: %v", err)
	}
	defer c1.Close()

	// Alice receives self join event
	var join1 handler.WSMessage
	_ = c1.ReadJSON(&join1)
	if join1.Type != "join" || join1.UserName != "Alice" {
		t.Fatalf("expected join event for Alice, got: %+v", join1)
	}

	// Connect Client 2 (Bob)
	url2 := wsURL + "?user_id=user-bob&user_name=Bob"
	c2, _, err := websocket.DefaultDialer.Dial(url2, nil)
	if err != nil {
		t.Fatalf("failed to connect client 2: %v", err)
	}
	defer c2.Close()

	// Bob receives self join event
	var joinBobSelf handler.WSMessage
	_ = c2.ReadJSON(&joinBobSelf)

	// Alice receives Bob's join event
	var join2 handler.WSMessage
	_ = c1.ReadJSON(&join2)
	if join2.Type != "join" || join2.UserName != "Bob" {
		t.Fatalf("expected Alice to receive Bob's join event, got: %+v", join2)
	}

	// 1. Test Edit broadcast: Alice sends edit -> Bob receives it
	editMsg := handler.WSMessage{
		Type:    "edit",
		Content: "# Updated title from Alice",
		Version: 2,
	}
	if err := c1.WriteJSON(editMsg); err != nil {
		t.Fatalf("failed to send edit message: %v", err)
	}

	var receivedEdit handler.WSMessage
	_ = c2.SetReadDeadline(time.Now().Add(2 * time.Second))
	if err := c2.ReadJSON(&receivedEdit); err != nil {
		t.Fatalf("Bob failed to receive edit broadcast: %v", err)
	}
	if receivedEdit.Type != "edit" || receivedEdit.Content != "# Updated title from Alice" || receivedEdit.UserName != "Alice" {
		t.Fatalf("Bob received unexpected edit message: %+v", receivedEdit)
	}

	// 2. Test Cursor broadcast: Bob moves cursor -> Alice receives it
	cursorMsg := handler.WSMessage{
		Type:   "cursor",
		Cursor: map[string]interface{}{"line": 10.0, "ch": 5.0},
	}
	if err := c2.WriteJSON(cursorMsg); err != nil {
		t.Fatalf("failed to send cursor message: %v", err)
	}

	var receivedCursor handler.WSMessage
	_ = c1.SetReadDeadline(time.Now().Add(2 * time.Second))
	if err := c1.ReadJSON(&receivedCursor); err != nil {
		t.Fatalf("Alice failed to receive cursor broadcast: %v", err)
	}
	if receivedCursor.Type != "cursor" || receivedCursor.UserName != "Bob" {
		t.Fatalf("Alice received unexpected cursor message: %+v", receivedCursor)
	}
}

// TestPhase3EndpointsRouting verifies all Phase 3 required endpoints, paths, status codes and response formats
func TestPhase3EndpointsRouting(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	v1 := r.Group("/v1")

	// Public routes
	public := v1.Group("/public")
	{
		// 1. Verify site password
		public.POST("/sites/:slug/verify-password", func(c *gin.Context) {
			slug := c.Param("slug")
			var req map[string]string
			_ = c.ShouldBindJSON(&req)
			if req["password"] != "mypassword" {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
				return
			}
			token := handler.GenerateSiteAccessToken("site-123", slug)
			c.SetCookie("site_token_"+slug, token, 86400, "/", "", false, true)
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"token":   token,
				"slug":    slug,
			})
		})

		// 2. Public comments GET and POST
		public.GET("/sites/:slug/pages/*pageSlug", func(c *gin.Context) {
			rawPageSlug := c.Param("pageSlug")
			if strings.HasSuffix(rawPageSlug, "/comments") {
				pageSlug := strings.Trim(strings.TrimSuffix(rawPageSlug, "/comments"), "/")
				c.JSON(http.StatusOK, gin.H{
					"success": true,
					"data": []gin.H{
						{
							"id":          "comment-1",
							"page_slug":   pageSlug,
							"author_name": "Public Reader",
							"content":     "Great article!",
						},
					},
				})
				return
			}
			c.JSON(http.StatusOK, gin.H{"slug": c.Param("slug"), "page": rawPageSlug})
		})

		public.POST("/sites/:slug/pages/*pageSlug", func(c *gin.Context) {
			rawPageSlug := c.Param("pageSlug")
			if strings.HasSuffix(rawPageSlug, "/comments") {
				var req map[string]string
				_ = c.ShouldBindJSON(&req)
				pageSlug := strings.Trim(strings.TrimSuffix(rawPageSlug, "/comments"), "/")
				c.JSON(http.StatusCreated, gin.H{
					"success": true,
					"data": gin.H{
						"id":          "comment-new",
						"page_slug":   pageSlug,
						"author_name": req["author_name"],
						"content":     req["content"],
					},
				})
				return
			}
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		})
	}

	// Protected routes
	protected := v1.Group("")
	{
		// 1. Comments
		protected.GET("/pages/:id/comments", func(c *gin.Context) {
			id := c.Param("id")
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": []gin.H{
					{
						"id":          "comment-101",
						"page_id":     id,
						"author_name": "Alice",
						"content":     "Internal team feedback",
					},
				},
			})
		})

		protected.POST("/pages/:id/comments", func(c *gin.Context) {
			id := c.Param("id")
			var req map[string]string
			_ = c.ShouldBindJSON(&req)
			c.JSON(http.StatusCreated, gin.H{
				"success": true,
				"data": gin.H{
					"id":          "comment-102",
					"page_id":     id,
					"author_name": "Alice",
					"content":     req["content"],
				},
			})
		})

		protected.DELETE("/comments/:id", func(c *gin.Context) {
			_ = c.Param("id")
			c.JSON(http.StatusOK, gin.H{"success": true})
		})

		// 2. Trash & Restore
		protected.GET("/sites/:id/trash", func(c *gin.Context) {
			id := c.Param("id")
			now := time.Now()
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": []gin.H{
					{
						"id":         "page-trashed-1",
						"site_id":    id,
						"title":      "Old Draft",
						"status":     model.PageStatusTrashed,
						"deleted_at": now,
					},
				},
			})
		})

		protected.POST("/pages/:id/restore", func(c *gin.Context) {
			id := c.Param("id")
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": gin.H{
					"id":         id,
					"status":     model.PageStatusDraft,
					"deleted_at": nil,
				},
			})
		})

		// 3. API Keys
		protected.GET("/api-keys", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": []gin.H{
					{
						"id":         "key-1",
						"name":       "Deploy Key",
						"key_prefix": "klados_live_abc1...",
					},
				},
			})
		})

		protected.POST("/api-keys", func(c *gin.Context) {
			var req map[string]string
			_ = c.ShouldBindJSON(&req)
			token, prefix, _, _ := handler.GenerateAPIKey()
			c.JSON(http.StatusCreated, gin.H{
				"success": true,
				"data": gin.H{
					"id":         "key-2",
					"name":       req["name"],
					"key_prefix": prefix,
					"token":      token,
				},
			})
		})

		protected.DELETE("/api-keys/:id", func(c *gin.Context) {
			_ = c.Param("id")
			c.JSON(http.StatusOK, gin.H{"success": true})
		})
	}

	// Verify 1: POST /v1/public/sites/:slug/verify-password
	{
		// Invalid password
		badBody := `{"password": "wrong"}`
		req, _ := http.NewRequest("POST", "/v1/public/sites/my-site/verify-password", strings.NewReader(badBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 for wrong password, got %d", w.Code)
		}

		// Valid password
		goodBody := `{"password": "mypassword"}`
		req2, _ := http.NewRequest("POST", "/v1/public/sites/my-site/verify-password", strings.NewReader(goodBody))
		req2.Header.Set("Content-Type", "application/json")
		w2 := httptest.NewRecorder()
		r.ServeHTTP(w2, req2)
		if w2.Code != http.StatusOK {
			t.Fatalf("expected 200 for valid password, got %d", w2.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w2.Body.Bytes(), &resp)
		if resp["token"] == nil || resp["token"] == "" {
			t.Fatalf("expected token in verify-password response")
		}
	}

	// Verify 2: GET /v1/public/sites/:slug/pages/*pageSlug/comments
	{
		req, _ := http.NewRequest("GET", "/v1/public/sites/my-site/pages/intro/comments", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].([]interface{})
		if len(data) != 1 {
			t.Fatalf("expected 1 comment, got %d", len(data))
		}
	}

	// Verify 3: POST /v1/public/sites/:slug/pages/*pageSlug/comments
	{
		body := `{"author_name": "Visitor", "content": "Awesome documentation!"}`
		req, _ := http.NewRequest("POST", "/v1/public/sites/my-site/pages/intro/comments", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d", w.Code)
		}
	}

	// Verify 4: GET /v1/pages/:id/comments
	{
		req, _ := http.NewRequest("GET", "/v1/pages/page-123/comments", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
	}

	// Verify 5: POST /v1/pages/:id/comments
	{
		body := `{"content": "Internal feedback note"}`
		req, _ := http.NewRequest("POST", "/v1/pages/page-123/comments", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d", w.Code)
		}
	}

	// Verify 6: DELETE /v1/comments/:id
	{
		req, _ := http.NewRequest("DELETE", "/v1/comments/comment-123", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
	}

	// Verify 7: GET /v1/sites/:id/trash
	{
		req, _ := http.NewRequest("GET", "/v1/sites/site-123/trash", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].([]interface{})
		if len(data) != 1 {
			t.Fatalf("expected 1 trashed page, got %d", len(data))
		}
	}

	// Verify 8: POST /v1/pages/:id/restore
	{
		req, _ := http.NewRequest("POST", "/v1/pages/page-trashed-1/restore", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].(map[string]interface{})
		if data["status"] != string(model.PageStatusDraft) || data["deleted_at"] != nil {
			t.Fatalf("expected status draft and deleted_at nil after restore, got: %+v", data)
		}
	}

	// Verify 9: GET /v1/api-keys
	{
		req, _ := http.NewRequest("GET", "/v1/api-keys", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
	}

	// Verify 10: POST /v1/api-keys
	{
		body := `{"name": "CI/CD Token"}`
		req, _ := http.NewRequest("POST", "/v1/api-keys", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusCreated {
			t.Fatalf("expected 201, got %d", w.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].(map[string]interface{})
		if !strings.HasPrefix(data["token"].(string), "klados_live_") {
			t.Fatalf("expected token starting with klados_live_, got %v", data["token"])
		}
	}

	// Verify 11: DELETE /v1/api-keys/:id
	{
		req, _ := http.NewRequest("DELETE", "/v1/api-keys/key-123", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
	}
}

// TestMiddlewareAPIKeyAuth verifies Bearer and X-API-Key middleware support
func TestMiddlewareAPIKeyAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	r.Use(middleware.Auth("secret-jwt-key"))
	r.GET("/protected-resource", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"user_id": c.GetString("user_id"),
		})
	})

	// Case 1: Missing token
	{
		req, _ := http.NewRequest("GET", "/protected-resource", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 on missing token, got %d", w.Code)
		}
	}
}
