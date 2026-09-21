package handler

import (
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"gorm.io/gorm"
)

type PageHandler struct {
	DB *gorm.DB
}

type createPageRequest struct {
	ParentID *uuid.UUID `json:"parent_id"`
	Slug     string     `json:"slug" binding:"required"`
	Title    string     `json:"title" binding:"required"`
	Content  string     `json:"content"`
}

type updatePageRequest struct {
	Title   string           `json:"title"`
	Content string           `json:"content"`
	Status  model.PageStatus `json:"status"`
}

func (h *PageHandler) List(c *gin.Context) {
	siteID := c.Param("id")
	if siteID == "" {
		siteID = c.Param("siteId")
	}
	var pages []model.Page
	if err := h.DB.Where("site_id = ? AND deleted_at IS NULL", siteID).
		Order("position asc").Find(&pages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": pages})
}

func (h *PageHandler) Create(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("id")
	if siteID == "" {
		siteID = c.Param("siteId")
	}

	var req createPageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	sUID, _ := uuid.Parse(siteID)
	_ = userID

	page := &model.Page{
		SiteID:   sUID,
		ParentID: req.ParentID,
		Slug:     req.Slug,
		Title:    req.Title,
		Content:  req.Content,
		Status:   model.PageStatusDraft,
	}

	if err := h.DB.Create(page).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = SyncPageCategories(h.DB, page)

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": page})
}

func (h *PageHandler) Get(c *gin.Context) {
	id := c.Param("id")
	var page model.Page
	if err := h.DB.Where("id = ? AND deleted_at IS NULL", id).First(&page).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": page})
}

func (h *PageHandler) Update(c *gin.Context) {
	id := c.Param("id")
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	var page model.Page
	if err := h.DB.Where("id = ? AND deleted_at IS NULL", id).First(&page).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	var req updatePageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// コンテンツに変更がある場合のみ新しいバージョンとして履歴を保存
	if req.Content != "" && req.Content != page.Content {
		var maxVer struct{ Max int }
		h.DB.Model(&model.PageVersion{}).Select("COALESCE(MAX(version), 0) as max").Where("page_id = ?", page.ID).Scan(&maxVer)
		h.DB.Create(&model.PageVersion{
			PageID:  page.ID,
			UserID:  userID,
			Content: page.Content,
			Version: maxVer.Max + 1,
		})
		page.Content = req.Content
	}

	if req.Title != "" {
		page.Title = req.Title
	}
	if req.Status != "" {
		page.Status = req.Status
		if req.Status == model.PageStatusPublished && page.PublishedAt == nil {
			now := time.Now()
			page.PublishedAt = &now
		}
	}

	h.DB.Save(&page)
	_ = SyncPageCategories(h.DB, &page)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": page})
}

func (h *PageHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	now := time.Now()
	result := h.DB.Model(&model.Page{}).Where("id = ?", id).Updates(map[string]interface{}{
		"deleted_at": now,
		"status":     model.PageStatusTrashed,
	})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}
	h.DB.Where("page_id = ?", id).Delete(&model.PageCategory{})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *PageHandler) GetVersions(c *gin.Context) {
	id := c.Param("id")
	var versions []model.PageVersion
	h.DB.Where("page_id = ?", id).Order("version desc").Limit(50).Find(&versions)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": versions})
}

func (h *PageHandler) ListPublicBySlug(c *gin.Context) {
	slug := c.Param("slug")
	var site model.Site
	if err := h.DB.Where("(LOWER(slug) = LOWER(?) OR LOWER(custom_domain) = LOWER(?)) AND is_public = ?", slug, slug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	if !CheckSiteAccess(c, &site) {
		return
	}

	var pages []model.Page
	if err := h.DB.Where("site_id = ? AND status = ? AND deleted_at IS NULL", site.ID, model.PageStatusPublished).
		Order("position asc, created_at asc").Find(&pages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": pages})
}

func (h *PageHandler) GetPublicPage(c *gin.Context) {
	siteSlug := c.Param("slug")
	rawPageSlug := c.Param("pageSlug")

	// If route matches /sites/:slug/pages/*pageSlug/comments, delegate to CommentHandler.ListPublic
	if strings.HasSuffix(rawPageSlug, "/comments") || rawPageSlug == "/comments" || rawPageSlug == "comments" {
		commentH := &CommentHandler{DB: h.DB}
		commentH.ListPublic(c)
		return
	}

	var site model.Site
	if err := h.DB.Where("(LOWER(slug) = LOWER(?) OR LOWER(custom_domain) = LOWER(?)) AND is_public = ?", siteSlug, siteSlug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	if !CheckSiteAccess(c, &site) {
		return
	}

	pageSlug := strings.Trim(rawPageSlug, "/")
	unescaped, _ := url.PathUnescape(pageSlug)
	var page model.Page
	var err error
	if pageSlug == "" || pageSlug == "index" {
		err = h.DB.Where("site_id = ? AND slug IN ('index', 'home', '') AND status = ? AND deleted_at IS NULL",
			site.ID, model.PageStatusPublished).Order("position asc, created_at asc").First(&page).Error
		if err != nil {
			err = h.DB.Where("site_id = ? AND status = ? AND deleted_at IS NULL", site.ID, model.PageStatusPublished).
				Order("position asc, created_at asc").First(&page).Error
		}
	} else {
		possibleSlugs := []string{pageSlug, "/" + pageSlug}
		if unescaped != "" && unescaped != pageSlug {
			possibleSlugs = append(possibleSlugs, unescaped, "/"+unescaped)
		}
		err = h.DB.Where("site_id = ? AND slug IN ? AND status = ? AND deleted_at IS NULL",
			site.ID, possibleSlugs, model.PageStatusPublished).First(&page).Error
	}

	if err != nil {
		lowerSlug := strings.ToLower(pageSlug)
		lowerUnescaped := strings.ToLower(unescaped)
		if strings.HasPrefix(lowerSlug, "category:") || strings.HasPrefix(lowerSlug, "カテゴリ:") ||
			strings.HasPrefix(lowerUnescaped, "category:") || strings.HasPrefix(lowerUnescaped, "カテゴリ:") {
			title := pageSlug
			if unescaped != "" {
				title = unescaped
			}
			syntheticPage := model.Page{
				ID:        uuid.Nil,
				SiteID:    site.ID,
				Slug:      pageSlug,
				Title:     title,
				Content:   "",
				Status:    model.PageStatusPublished,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "data": syntheticPage})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": page})
}

// ListTrash lists soft-deleted pages for a site (GET /v1/sites/:id/trash)
func (h *PageHandler) ListTrash(c *gin.Context) {
	siteID := c.Param("id")
	if siteID == "" {
		siteID = c.Param("siteId")
	}
	var pages []model.Page
	if err := h.DB.Where("site_id = ? AND deleted_at IS NOT NULL", siteID).
		Order("deleted_at desc").Find(&pages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": pages})
}

// Restore restores a soft-deleted page (POST /v1/pages/:id/restore)
func (h *PageHandler) Restore(c *gin.Context) {
	id := c.Param("id")
	var page model.Page
	if err := h.DB.Where("id = ?", id).First(&page).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	if err := h.DB.Model(&model.Page{}).Where("id = ?", id).Updates(map[string]interface{}{
		"deleted_at": nil,
		"status":     model.PageStatusDraft,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	page.DeletedAt = nil
	page.Status = model.PageStatusDraft
	_ = SyncPageCategories(h.DB, &page)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": page})
}

func (h *PageHandler) Revert(c *gin.Context) {
	id := c.Param("id")
	verStr := c.Param("ver")
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	ver, err := strconv.Atoi(verStr)
	if err != nil || ver <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid version"})
		return
	}

	var page model.Page
	if err := h.DB.Where("id = ? AND deleted_at IS NULL", id).First(&page).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	var targetVersion model.PageVersion
	if err := h.DB.Where("page_id = ? AND version = ?", page.ID, ver).First(&targetVersion).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "version not found"})
		return
	}

	// 現在の内容を新しいバージョンレコードとして保存
	var maxVer struct{ Max int }
	h.DB.Model(&model.PageVersion{}).Select("COALESCE(MAX(version), 0) as max").Where("page_id = ?", page.ID).Scan(&maxVer)
	newVersion := model.PageVersion{
		PageID:  page.ID,
		UserID:  userID,
		Content: page.Content,
		Version: maxVer.Max + 1,
	}
	if err := h.DB.Create(&newVersion).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 指定バージョンの内容にロールバック
	page.Content = targetVersion.Content
	if err := h.DB.Save(&page).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = SyncPageCategories(h.DB, &page)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": page})
}

type SearchResult struct {
	ID        uuid.UUID        `json:"id"`
	SiteID    uuid.UUID        `json:"site_id"`
	Slug      string           `json:"slug"`
	Title     string           `json:"title"`
	Snippet   string           `json:"snippet"`
	Highlight string           `json:"highlight"`
	Status    model.PageStatus `json:"status"`
	UpdatedAt time.Time        `json:"updated_at"`
}

func GenerateSnippetAndHighlight(content, title, query string) (string, string) {
	if query == "" {
		snippet := content
		if len(snippet) > 150 {
			snippet = snippet[:150] + "..."
		}
		return snippet, snippet
	}

	re, err := regexp.Compile("(?i)" + regexp.QuoteMeta(query))
	highlightFunc := func(text string) string {
		if err != nil {
			return text
		}
		return re.ReplaceAllStringFunc(text, func(m string) string {
			return "<mark>" + m + "</mark>"
		})
	}

	lowerContent := strings.ToLower(content)
	lowerQuery := strings.ToLower(query)
	idx := strings.Index(lowerContent, lowerQuery)

	if idx != -1 {
		start := idx - 50
		prefix := "..."
		if start <= 0 {
			start = 0
			prefix = ""
		}
		end := idx + len(query) + 80
		suffix := "..."
		if end >= len(content) {
			end = len(content)
			suffix = ""
		}

		rawSnippet := content[start:end]
		snippet := prefix + strings.TrimSpace(rawSnippet) + suffix
		highlight := prefix + highlightFunc(strings.TrimSpace(rawSnippet)) + suffix
		return snippet, highlight
	}

	var rawSnippet string
	suffix := ""
	if len(content) > 150 {
		rawSnippet = content[:150]
		suffix = "..."
	} else {
		rawSnippet = content
	}

	snippet := strings.TrimSpace(rawSnippet) + suffix
	if snippet == "" {
		snippet = title
	}
	highlight := highlightFunc(title)
	if highlight == title && snippet != "" {
		highlight = snippet
	}

	return snippet, highlight
}

func (h *PageHandler) Search(c *gin.Context) {
	siteID := c.Param("id")
	if siteID == "" {
		siteID = c.Param("siteId")
	}

	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": []SearchResult{}})
		return
	}

	var pages []model.Page
	pattern := "%" + strings.ToLower(q) + "%"
	if err := h.DB.Where("site_id = ? AND deleted_at IS NULL AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?)",
		siteID, pattern, pattern).
		Order("updated_at desc").Find(&pages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	results := make([]SearchResult, 0, len(pages))
	for _, p := range pages {
		snippet, highlight := GenerateSnippetAndHighlight(p.Content, p.Title, q)
		results = append(results, SearchResult{
			ID:        p.ID,
			SiteID:    p.SiteID,
			Slug:      p.Slug,
			Title:     p.Title,
			Snippet:   snippet,
			Highlight: highlight,
			Status:    p.Status,
			UpdatedAt: p.UpdatedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": results})
}
