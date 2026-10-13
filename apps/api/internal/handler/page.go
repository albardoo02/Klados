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
	ParentID   *uuid.UUID `json:"parent_id"`
	Slug       string     `json:"slug" binding:"required"`
	Title      string     `json:"title" binding:"required"`
	Content    string     `json:"content"`
	Categories []string   `json:"categories"`
}

type updatePageRequest struct {
	Title      *string          `json:"title"`
	Slug       *string          `json:"slug"`
	Content    *string          `json:"content"`
	Status     model.PageStatus `json:"status"`
	Categories *[]string        `json:"categories"`
}

func toPageAuthorSummary(u *model.User) *model.PageAuthorSummary {
	if u == nil || u.ID == uuid.Nil {
		return nil
	}
	displayName := strings.TrimSpace(u.DisplayName)
	if displayName == "" {
		displayName = u.Username
	}
	return &model.PageAuthorSummary{
		ID:          u.ID,
		Username:    u.Username,
		DisplayName: displayName,
		AvatarURL:   u.AvatarURL,
	}
}

// PopulateSinglePageAuthor resolves CreatedBy and UpdatedBy for a single page,
// falling back to latest PageVersion.UserID or Site.UserID when UpdatedByID is not set.
func PopulateSinglePageAuthor(db *gorm.DB, page *model.Page) {
	if db == nil || page == nil {
		return
	}
	PopulatePageAuthors(db, []model.Page{*page})
}

// PopulatePageAuthors batch-resolves CreatedBy and UpdatedBy for a slice of pages.
func PopulatePageAuthors(db *gorm.DB, pages []model.Page) {
	if db == nil || len(pages) == 0 {
		return
	}

	userIDs := make(map[uuid.UUID]bool)
	siteIDs := make(map[uuid.UUID]bool)
	missingUpdaterPageIDs := make([]uuid.UUID, 0)

	for i := range pages {
		p := &pages[i]
		if p.SiteID != uuid.Nil {
			siteIDs[p.SiteID] = true
		}
		if p.CreatedByID != nil && *p.CreatedByID != uuid.Nil {
			userIDs[*p.CreatedByID] = true
		}
		if p.UpdatedByID != nil && *p.UpdatedByID != uuid.Nil {
			userIDs[*p.UpdatedByID] = true
		} else if p.ID != uuid.Nil {
			missingUpdaterPageIDs = append(missingUpdaterPageIDs, p.ID)
		}
	}

	// Fallback 1: check latest PageVersion for pages without UpdatedByID
	latestVersionUser := make(map[uuid.UUID]uuid.UUID)
	if len(missingUpdaterPageIDs) > 0 {
		var versions []model.PageVersion
		db.Where("page_id IN ?", missingUpdaterPageIDs).Order("version desc").Find(&versions)
		for _, v := range versions {
			if _, exists := latestVersionUser[v.PageID]; !exists && v.UserID != uuid.Nil {
				latestVersionUser[v.PageID] = v.UserID
				userIDs[v.UserID] = true
			}
		}
	}

	// Fallback 2: check Site owner
	siteOwnerMap := make(map[uuid.UUID]uuid.UUID)
	if len(siteIDs) > 0 {
		sList := make([]uuid.UUID, 0, len(siteIDs))
		for id := range siteIDs {
			sList = append(sList, id)
		}
		var sites []model.Site
		db.Select("id, user_id").Where("id IN ?", sList).Find(&sites)
		for _, s := range sites {
			if s.UserID != uuid.Nil {
				siteOwnerMap[s.ID] = s.UserID
				userIDs[s.UserID] = true
			}
		}
	}

	if len(userIDs) == 0 {
		return
	}

	uList := make([]uuid.UUID, 0, len(userIDs))
	for id := range userIDs {
		uList = append(uList, id)
	}
	var users []model.User
	db.Where("id IN ?", uList).Find(&users)
	userMap := make(map[uuid.UUID]*model.PageAuthorSummary, len(users))
	for i := range users {
		userMap[users[i].ID] = toPageAuthorSummary(&users[i])
	}

	for i := range pages {
		p := &pages[i]
		// Resolve UpdatedBy
		var updUID uuid.UUID
		if p.UpdatedByID != nil && *p.UpdatedByID != uuid.Nil {
			updUID = *p.UpdatedByID
		} else if vUID, ok := latestVersionUser[p.ID]; ok {
			updUID = vUID
		} else if ownerUID, ok := siteOwnerMap[p.SiteID]; ok {
			updUID = ownerUID
		}
		if updUID != uuid.Nil {
			p.UpdatedBy = userMap[updUID]
		}

		// Resolve CreatedBy
		var crtUID uuid.UUID
		if p.CreatedByID != nil && *p.CreatedByID != uuid.Nil {
			crtUID = *p.CreatedByID
		} else if ownerUID, ok := siteOwnerMap[p.SiteID]; ok {
			crtUID = ownerUID
		}
		if crtUID != uuid.Nil {
			p.CreatedBy = userMap[crtUID]
		}
	}
}

func (h *PageHandler) List(c *gin.Context) {
	siteID := c.Param("id")
	if siteID == "" {
		siteID = c.Param("siteId")
	}
	pages := make([]model.Page, 0)
	if err := h.DB.Where("site_id = ? AND deleted_at IS NULL", siteID).
		Order("position asc").Find(&pages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i := range pages {
		PopulatePageCategories(&pages[i])
	}
	PopulatePageAuthors(h.DB, pages)
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
	uUID, _ := uuid.Parse(userID)

	page := &model.Page{
		SiteID:   sUID,
		ParentID: req.ParentID,
		Slug:     strings.TrimSpace(req.Slug),
		Title:    strings.TrimSpace(req.Title),
		Content:  req.Content,
		Status:   model.PageStatusDraft,
	}
	if uUID != uuid.Nil {
		page.CreatedByID = &uUID
		page.UpdatedByID = &uUID
	}
	if len(req.Categories) > 0 {
		page.SetFrontmatterCategories(req.Categories)
	}

	if err := h.DB.Create(page).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = SyncPageCategories(h.DB, page)
	tmp := []model.Page{*page}
	PopulatePageAuthors(h.DB, tmp)
	page.CreatedBy = tmp[0].CreatedBy
	page.UpdatedBy = tmp[0].UpdatedBy

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": page})
}

func (h *PageHandler) Get(c *gin.Context) {
	id := c.Param("id")
	var page model.Page
	if err := h.DB.Where("id = ? AND deleted_at IS NULL", id).First(&page).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}
	PopulatePageCategories(&page)
	tmp := []model.Page{page}
	PopulatePageAuthors(h.DB, tmp)
	page.CreatedBy = tmp[0].CreatedBy
	page.UpdatedBy = tmp[0].UpdatedBy
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
	if req.Content != nil && *req.Content != page.Content {
		var maxVer struct{ Max int }
		h.DB.Model(&model.PageVersion{}).Select("COALESCE(MAX(version), 0) as max").Where("page_id = ?", page.ID).Scan(&maxVer)
		h.DB.Create(&model.PageVersion{
			PageID:  page.ID,
			UserID:  userID,
			Content: page.Content,
			Version: maxVer.Max + 1,
		})
		page.Content = *req.Content
	}

	if req.Title != nil && strings.TrimSpace(*req.Title) != "" {
		page.Title = strings.TrimSpace(*req.Title)
	}

	if req.Slug != nil {
		newSlug := strings.TrimSpace(*req.Slug)
		newSlug = strings.TrimPrefix(newSlug, "/")
		if newSlug != "" && newSlug != page.Slug {
			var dupCount int64
			h.DB.Model(&model.Page{}).
				Where("site_id = ? AND LOWER(slug) = LOWER(?) AND id != ? AND deleted_at IS NULL", page.SiteID, newSlug, page.ID).
				Count(&dupCount)
			if dupCount > 0 {
				c.JSON(http.StatusConflict, gin.H{"error": "指定されたスラッグは既にこのサイト内の別ページで使用されています"})
				return
			}
			page.Slug = newSlug
		}
	}

	if req.Categories != nil {
		page.SetFrontmatterCategories(*req.Categories)
	}

	if req.Status != "" {
		page.Status = req.Status
		if req.Status == model.PageStatusPublished && page.PublishedAt == nil {
			now := time.Now()
			page.PublishedAt = &now
		}
	}

	if userID != uuid.Nil {
		page.UpdatedByID = &userID
		if page.CreatedByID == nil || *page.CreatedByID == uuid.Nil {
			page.CreatedByID = &userID
		}
	}

	h.DB.Save(&page)
	_ = SyncPageCategories(h.DB, &page)
	tmp := []model.Page{page}
	PopulatePageAuthors(h.DB, tmp)
	page.CreatedBy = tmp[0].CreatedBy
	page.UpdatedBy = tmp[0].UpdatedBy
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
	versions := make([]model.PageVersion, 0)
	h.DB.Where("page_id = ?", id).Order("version desc").Limit(50).Find(&versions)

	userIDs := make(map[uuid.UUID]bool)
	for _, v := range versions {
		if v.UserID != uuid.Nil {
			userIDs[v.UserID] = true
		}
	}
	if len(userIDs) > 0 {
		uList := make([]uuid.UUID, 0, len(userIDs))
		for uid := range userIDs {
			uList = append(uList, uid)
		}
		var users []model.User
		h.DB.Where("id IN ?", uList).Find(&users)
		uMap := make(map[uuid.UUID]*model.PageAuthorSummary, len(users))
		for i := range users {
			uMap[users[i].ID] = toPageAuthorSummary(&users[i])
		}
		for i := range versions {
			versions[i].User = uMap[versions[i].UserID]
		}
	}

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

	pages := make([]model.Page, 0)
	if err := h.DB.Where("site_id = ? AND status = ? AND deleted_at IS NULL", site.ID, model.PageStatusPublished).
		Order("position asc, created_at asc").Find(&pages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	for i := range pages {
		PopulatePageCategories(&pages[i])
	}
	PopulatePageAuthors(h.DB, pages)
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

	// .md / .markdown 拡張子と相対パス記号 "./" の除去
	trimmedSlug := strings.TrimPrefix(pageSlug, "./")
	trimmedSlug = strings.TrimSuffix(trimmedSlug, ".md")
	trimmedSlug = strings.TrimSuffix(trimmedSlug, ".markdown")
	trimmedSlug = strings.Trim(trimmedSlug, "/")

	lowerTrimmed := strings.ToLower(trimmedSlug)
	isHomeLike := pageSlug == "" || pageSlug == "index" ||
		lowerTrimmed == "" || lowerTrimmed == "index" || lowerTrimmed == "home" || lowerTrimmed == "readme"

	var page model.Page
	var err error
	if isHomeLike {
		err = h.DB.Where("site_id = ? AND LOWER(slug) IN ('index', 'home', 'readme', '') AND status = ? AND deleted_at IS NULL",
			site.ID, model.PageStatusPublished).Order("position asc, created_at asc").First(&page).Error
		if err != nil {
			err = h.DB.Where("site_id = ? AND status = ? AND deleted_at IS NULL", site.ID, model.PageStatusPublished).
				Order("position asc, created_at asc").First(&page).Error
		}
	} else {
		possibleSlugs := []string{pageSlug, "/" + pageSlug}
		if trimmedSlug != "" && trimmedSlug != pageSlug {
			possibleSlugs = append(possibleSlugs, trimmedSlug, "/"+trimmedSlug)
		}
		if unescaped != "" && unescaped != pageSlug {
			possibleSlugs = append(possibleSlugs, unescaped, "/"+unescaped)
			unescapedTrimmed := strings.TrimPrefix(unescaped, "./")
			unescapedTrimmed = strings.TrimSuffix(unescapedTrimmed, ".md")
			unescapedTrimmed = strings.TrimSuffix(unescapedTrimmed, ".markdown")
			unescapedTrimmed = strings.Trim(unescapedTrimmed, "/")
			if unescapedTrimmed != "" && unescapedTrimmed != unescaped {
				possibleSlugs = append(possibleSlugs, unescapedTrimmed, "/"+unescapedTrimmed)
			}
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

	PopulatePageCategories(&page)
	tmp := []model.Page{page}
	PopulatePageAuthors(h.DB, tmp)
	page.CreatedBy = tmp[0].CreatedBy
	page.UpdatedBy = tmp[0].UpdatedBy
	c.JSON(http.StatusOK, gin.H{"success": true, "data": page})
}

// ListTrash lists soft-deleted pages for a site (GET /v1/sites/:id/trash)
func (h *PageHandler) ListTrash(c *gin.Context) {
	siteID := c.Param("id")
	if siteID == "" {
		siteID = c.Param("siteId")
	}
	pages := make([]model.Page, 0)
	if err := h.DB.Where("site_id = ? AND deleted_at IS NOT NULL", siteID).
		Order("deleted_at desc").Find(&pages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	PopulatePageAuthors(h.DB, pages)
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
	tmp := []model.Page{page}
	PopulatePageAuthors(h.DB, tmp)
	page.CreatedBy = tmp[0].CreatedBy
	page.UpdatedBy = tmp[0].UpdatedBy
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
	if userID != uuid.Nil {
		page.UpdatedByID = &userID
	}
	if err := h.DB.Save(&page).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = SyncPageCategories(h.DB, &page)
	tmp := []model.Page{page}
	PopulatePageAuthors(h.DB, tmp)
	page.CreatedBy = tmp[0].CreatedBy
	page.UpdatedBy = tmp[0].UpdatedBy
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
