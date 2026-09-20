package handler

import (
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"gorm.io/gorm"
)

type CategoryHandler struct {
	DB *gorm.DB
}

type ExtractedCategory struct {
	Name    string `json:"name"`
	SortKey string `json:"sort_key"`
}

// Regex to capture [[Category:Name|SortKey]] and [[カテゴリ:Name|SortKey]]
// Group 1: optional colon ':' (if present, indicates inline link like [[:Category:Foo]])
// Group 2: category name
// Group 3: optional sort key
var categoryRegex = regexp.MustCompile(`(?i)\[\[(:?)(?:category|カテゴリ)\s*:\s*([^\]\n|]+)(?:\|([^\]\n]*))?\]\]`)

// ExtractCategories extracts categories from Markdown wikitext
// Inline links with a leading colon like [[:Category:...]] are ignored
func ExtractCategories(content, defaultSortKey string) []ExtractedCategory {
	if content == "" {
		return nil
	}

	matches := categoryRegex.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return nil
	}

	seen := make(map[string]bool)
	var result []ExtractedCategory

	for _, m := range matches {
		isInline := m[1] == ":"
		if isInline {
			continue
		}

		rawName := strings.TrimSpace(m[2])
		if rawName == "" {
			continue
		}

		normKey := strings.ToLower(rawName)
		if seen[normKey] {
			continue
		}
		seen[normKey] = true

		sortKey := strings.TrimSpace(m[3])
		if sortKey == "" {
			if defaultSortKey != "" {
				sortKey = defaultSortKey
			} else {
				sortKey = rawName
			}
		}

		result = append(result, ExtractedCategory{
			Name:    rawName,
			SortKey: sortKey,
		})
	}

	return result
}

// SyncPageCategories synchronizes category records for a given page
func SyncPageCategories(db *gorm.DB, page *model.Page) error {
	if db == nil || page == nil || page.ID == uuid.Nil {
		return nil
	}

	// If page is soft-deleted or trashed, remove its category links
	if page.DeletedAt != nil || page.Status == model.PageStatusTrashed {
		return db.Where("page_id = ?", page.ID).Delete(&model.PageCategory{}).Error
	}

	defaultSort := page.Title
	if defaultSort == "" {
		defaultSort = page.Slug
	}

	cats := ExtractCategories(page.Content, defaultSort)

	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("page_id = ?", page.ID).Delete(&model.PageCategory{}).Error; err != nil {
			return err
		}

		if len(cats) == 0 {
			return nil
		}

		items := make([]model.PageCategory, len(cats))
		for i, c := range cats {
			items[i] = model.PageCategory{
				SiteID:       page.SiteID,
				PageID:       page.ID,
				CategoryName: c.Name,
				SortKey:      c.SortKey,
			}
		}

		return tx.Create(&items).Error
	})
}

// InitialChar returns the grouping header character (e.g. 'A', 'あ', '#')
func InitialChar(text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return "#"
	}

	r := []rune(trimmed)[0]

	if unicode.Is(unicode.Latin, r) {
		return strings.ToUpper(string(r))
	}

	if unicode.IsDigit(r) {
		return "0-9"
	}

	// Hiragana
	if r >= 0x3041 && r <= 0x3096 {
		return string(r)
	}

	// Katakana to Hiragana normalisation for grouping
	if r >= 0x30A1 && r <= 0x30F6 {
		return string(r - 0x60)
	}

	// Kanji / other unicode
	return string(r)
}

type CategorySummary struct {
	Name             string `json:"name"`
	PageCount        int    `json:"page_count"`
	SubcategoryCount int    `json:"subcategory_count"`
	TotalCount       int    `json:"total_count"`
}

type CategoryMemberItem struct {
	ID           uuid.UUID `json:"id"`
	Slug         string    `json:"slug"`
	Title        string    `json:"title"`
	SortKey      string    `json:"sort_key"`
	IsCategory   bool      `json:"is_category"`
	CategoryName string    `json:"category_name,omitempty"`
	MemberCount  int       `json:"member_count,omitempty"`
}

// ListPublic returns all categories in a site (GET /v1/public/sites/:slug/categories)
func (h *CategoryHandler) ListPublic(c *gin.Context) {
	siteSlug := c.Param("slug")
	var site model.Site
	if err := h.DB.Where("slug = ? AND is_public = ?", siteSlug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	if !CheckSiteAccess(c, &site) {
		return
	}

	type QueryRow struct {
		CategoryName string
		PageID       uuid.UUID
		Slug         string
	}

	var rows []QueryRow
	err := h.DB.Table("page_categories").
		Select("page_categories.category_name, pages.id as page_id, pages.slug").
		Joins("JOIN pages ON pages.id = page_categories.page_id").
		Where("page_categories.site_id = ? AND pages.status = ? AND pages.deleted_at IS NULL", site.ID, model.PageStatusPublished).
		Find(&rows).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	categoryMap := make(map[string]*CategorySummary)
	for _, r := range rows {
		cat, exists := categoryMap[r.CategoryName]
		if !exists {
			cat = &CategorySummary{Name: r.CategoryName}
			categoryMap[r.CategoryName] = cat
		}

		lowerSlug := strings.ToLower(r.Slug)
		isCategoryPage := strings.HasPrefix(lowerSlug, "category:") || strings.HasPrefix(lowerSlug, "カテゴリ:")
		if isCategoryPage {
			cat.SubcategoryCount++
		} else {
			cat.PageCount++
		}
		cat.TotalCount++
	}

	summaries := make([]CategorySummary, 0, len(categoryMap))
	for _, v := range categoryMap {
		summaries = append(summaries, *v)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": summaries})
}

// GetPublicCategory returns detail for a specific category (GET /v1/public/sites/:slug/categories/*name)
func (h *CategoryHandler) GetPublicCategory(c *gin.Context) {
	siteSlug := c.Param("slug")
	rawName := c.Param("name")

	var site model.Site
	if err := h.DB.Where("slug = ? AND is_public = ?", siteSlug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	if !CheckSiteAccess(c, &site) {
		return
	}

	cleanName := strings.Trim(rawName, "/")
	unescaped, err := url.PathUnescape(cleanName)
	if err == nil && unescaped != "" {
		cleanName = unescaped
	}

	// Strip "Category:" or "カテゴリ:" if included in the parameter
	rePrefix := regexp.MustCompile(`(?i)^(?:category|カテゴリ):`)
	catName := rePrefix.ReplaceAllString(cleanName, "")
	catName = strings.TrimSpace(catName)

	if catName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "category name is required"})
		return
	}

	// 1. Try to find the category description page if it exists
	var categoryPage *model.Page
	possibleSlugs := []string{
		"Category:" + catName,
		"category:" + catName,
		"カテゴリ:" + catName,
		"/Category:" + catName,
		"/category:" + catName,
		"/カテゴリ:" + catName,
	}
	var foundPage model.Page
	if err := h.DB.Where("site_id = ? AND slug IN ? AND status = ? AND deleted_at IS NULL",
		site.ID, possibleSlugs, model.PageStatusPublished).First(&foundPage).Error; err == nil {
		categoryPage = &foundPage
	}

	// 2. Query pages in this category
	type PageRow struct {
		ID      uuid.UUID `gorm:"column:id"`
		Slug    string    `gorm:"column:slug"`
		Title   string    `gorm:"column:title"`
		SortKey string    `gorm:"column:sort_key"`
	}

	var rows []PageRow
	err = h.DB.Table("page_categories").
		Select("pages.id, pages.slug, pages.title, page_categories.sort_key").
		Joins("JOIN pages ON pages.id = page_categories.page_id").
		Where("page_categories.site_id = ? AND LOWER(page_categories.category_name) = LOWER(?) AND pages.status = ? AND pages.deleted_at IS NULL",
			site.ID, catName, model.PageStatusPublished).
		Order("page_categories.sort_key ASC, pages.title ASC").
		Find(&rows).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var subcategories []CategoryMemberItem
	var pages []CategoryMemberItem
	groupedPages := make(map[string][]CategoryMemberItem)

	for _, r := range rows {
		lowerSlug := strings.ToLower(r.Slug)
		isCat := strings.HasPrefix(lowerSlug, "category:") || strings.HasPrefix(lowerSlug, "カテゴリ:")

		item := CategoryMemberItem{
			ID:         r.ID,
			Slug:       r.Slug,
			Title:      r.Title,
			SortKey:    r.SortKey,
			IsCategory: isCat,
		}

		if isCat {
			subName := rePrefix.ReplaceAllString(r.Slug, "")
			item.CategoryName = subName

			// Count member pages of this subcategory
			var count int64
			h.DB.Table("page_categories").
				Joins("JOIN pages ON pages.id = page_categories.page_id").
				Where("page_categories.site_id = ? AND LOWER(page_categories.category_name) = LOWER(?) AND pages.status = ? AND pages.deleted_at IS NULL",
					site.ID, subName, model.PageStatusPublished).
				Count(&count)
			item.MemberCount = int(count)

			subcategories = append(subcategories, item)
		} else {
			pages = append(pages, item)

			initKey := InitialChar(r.SortKey)
			groupedPages[initKey] = append(groupedPages[initKey], item)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"category_name":       catName,
			"page":                categoryPage,
			"subcategories":       subcategories,
			"pages":               pages,
			"grouped_pages":       groupedPages,
			"total_pages":         len(pages),
			"total_subcategories": len(subcategories),
		},
	})
}

// ListForSite lists all categories for a site (GET /v1/sites/:id/categories)
func (h *CategoryHandler) ListForSite(c *gin.Context) {
	siteID := c.Param("id")
	if siteID == "" {
		siteID = c.Param("siteId")
	}

	type CatCount struct {
		CategoryName string `json:"category_name"`
		Count        int    `json:"count"`
	}

	var results []CatCount
	err := h.DB.Table("page_categories").
		Select("category_name, COUNT(*) as count").
		Where("site_id = ?", siteID).
		Group("category_name").
		Order("category_name ASC").
		Find(&results).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": results})
}
