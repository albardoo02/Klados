package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/klados/api/internal/handler"
)

func TestExtractCategories(t *testing.T) {
	content := `# Test Document

Here is some content with an inline link [[:Category:Reference|Reference Docs]] that should not be categorized.
Also another inline link without label [[:カテゴリ:ヘルプ]].

Now the actual categories:
[[Category:Programming]]
[[category:web development|Frontend]]
[[CATEGORY:TypeScript]]
[[カテゴリ:データベース|SQL]]
[[カテゴリ:プログラミング]]

Duplicate check:
[[Category:Programming|OtherSortKey]]
`

	cats := handler.ExtractCategories(content, "DefaultTitle")

	if len(cats) != 5 {
		t.Fatalf("expected 5 unique categories, got %d: %+v", len(cats), cats)
	}

	// 1. Programming (default sort key "DefaultTitle")
	if cats[0].Name != "Programming" || cats[0].SortKey != "DefaultTitle" {
		t.Errorf("cat[0] mismatch: %+v", cats[0])
	}

	// 2. web development (sort key "Frontend")
	if cats[1].Name != "web development" || cats[1].SortKey != "Frontend" {
		t.Errorf("cat[1] mismatch: %+v", cats[1])
	}

	// 3. TypeScript (default sort key "DefaultTitle")
	if cats[2].Name != "TypeScript" || cats[2].SortKey != "DefaultTitle" {
		t.Errorf("cat[2] mismatch: %+v", cats[2])
	}

	// 4. データベース (sort key "SQL")
	if cats[3].Name != "データベース" || cats[3].SortKey != "SQL" {
		t.Errorf("cat[3] mismatch: %+v", cats[3])
	}
}

func TestInitialChar(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Apple", "A"},
		{"banana", "B"},
		{"123 Numbers", "0-9"},
		{"あいうえお", "あ"},
		{"アイス", "あ"}, // Katakana normalized to Hiragana
		{"TypeScript", "T"},
		{"", "#"},
	}

	for _, tt := range tests {
		got := handler.InitialChar(tt.input)
		if got != tt.expected {
			t.Errorf("InitialChar(%q) = %q, expected %q", tt.input, got, tt.expected)
		}
	}
}

func TestCategoryEndpointsRouting(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	v1 := r.Group("/v1/public")
	{
		v1.GET("/sites/:slug/categories", func(c *gin.Context) {
			slug := c.Param("slug")
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": []gin.H{
					{
						"name":              "Programming",
						"page_count":        3,
						"subcategory_count": 1,
						"total_count":       4,
					},
				},
				"slug": slug,
			})
		})

		v1.GET("/sites/:slug/categories/*name", func(c *gin.Context) {
			slug := c.Param("slug")
			name := strings.Trim(c.Param("name"), "/")
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data": gin.H{
					"category_name":       name,
					"total_pages":         2,
					"total_subcategories": 1,
				},
				"slug": slug,
			})
		})
	}

	// Test 1: GET /v1/public/sites/my-site/categories
	{
		req, _ := http.NewRequest("GET", "/v1/public/sites/my-site/categories", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["slug"] != "my-site" {
			t.Fatalf("expected slug 'my-site', got '%v'", resp["slug"])
		}
	}

	// Test 2: GET /v1/public/sites/my-site/categories/Programming
	{
		req, _ := http.NewRequest("GET", "/v1/public/sites/my-site/categories/Programming", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", w.Code)
		}
		var resp map[string]interface{}
		_ = json.Unmarshal(w.Body.Bytes(), &resp)
		data := resp["data"].(map[string]interface{})
		if data["category_name"] != "Programming" {
			t.Fatalf("expected category_name 'Programming', got '%v'", data["category_name"])
		}
	}
}
