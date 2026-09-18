package handler

import (
	"encoding/xml"
	"fmt"
	"net"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"gorm.io/gorm"
)

type SiteHandler struct {
	DB          *gorm.DB
	LookupCNAME func(host string) (string, error)
}

type createSiteRequest struct {
	Slug        string `json:"slug" binding:"required,min=3,max=63"`
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	Theme       string `json:"theme"`
}

type updateCustomDomainRequest struct {
	CustomDomain string `json:"custom_domain"`
}

type SitemapURL struct {
	XMLName    xml.Name `xml:"url"`
	Loc        string   `xml:"loc"`
	LastMod    string   `xml:"lastmod,omitempty"`
	ChangeFreq string   `xml:"changefreq,omitempty"`
	Priority   string   `xml:"priority,omitempty"`
}

type SitemapURLSet struct {
	XMLName xml.Name     `xml:"http://www.sitemaps.org/schemas/sitemap/0.9 urlset"`
	URLs    []SitemapURL `xml:"url"`
}

func (h *SiteHandler) List(c *gin.Context) {
	userID := c.GetString("user_id")
	var sites []model.Site
	if err := h.DB.Where("user_id = ?", userID).Find(&sites).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": sites})
}

func (h *SiteHandler) Create(c *gin.Context) {
	userID := c.GetString("user_id")
	var req createSiteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	uid, _ := uuid.Parse(userID)
	theme := req.Theme
	if theme == "" {
		theme = "minimal"
	}

	site := &model.Site{
		UserID:      uid,
		Slug:        req.Slug,
		Title:       req.Title,
		Description: req.Description,
		Theme:       theme,
	}

	if err := h.DB.Create(site).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "slug already in use"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": site})
}

func (h *SiteHandler) Get(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	var site model.Site
	if err := h.DB.Where("id = ? AND user_id = ?", id, userID).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": site})
}

func (h *SiteHandler) Update(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	var site model.Site
	if err := h.DB.Where("id = ? AND user_id = ?", id, userID).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	if err := c.ShouldBindJSON(&site); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.DB.Save(&site)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": site})
}

func (h *SiteHandler) Delete(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	result := h.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&model.Site{})
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *SiteHandler) GetBySlug(c *gin.Context) {
	slug := c.Param("slug")
	var site model.Site
	if err := h.DB.Where("slug = ? AND is_public = ?", slug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	var pages []model.Page
	h.DB.Where("site_id = ? AND status = ? AND deleted_at IS NULL", site.ID, model.PageStatusPublished).
		Order("position asc, created_at asc").
		Find(&pages)

	type publicSiteWithPages struct {
		model.Site
		Pages []model.Page `json:"pages"`
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": publicSiteWithPages{
			Site:  site,
			Pages: pages,
		},
	})
}

// UpdateCustomDomain sets the custom domain for a site (protected endpoint)
func (h *SiteHandler) UpdateCustomDomain(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	var site model.Site
	if err := h.DB.Where("id = ? AND user_id = ?", id, userID).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	var req updateCustomDomainRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	domain := strings.ToLower(strings.TrimSpace(req.CustomDomain))
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimRight(domain, "/")

	if domain != "" {
		if strings.Contains(domain, " ") || !strings.Contains(domain, ".") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid custom domain format"})
			return
		}

		var count int64
		h.DB.Model(&model.Site{}).Where("custom_domain = ? AND id != ?", domain, site.ID).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "custom domain already in use"})
			return
		}
	}

	site.CustomDomain = domain
	if err := h.DB.Save(&site).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": site})
}

// VerifyDomain verifies that the site's custom domain CNAME points to cname.klados.app or klados.app
func (h *SiteHandler) VerifyDomain(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	var site model.Site
	if err := h.DB.Where("id = ? AND user_id = ?", id, userID).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	if site.CustomDomain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no custom domain configured"})
		return
	}

	lookup := h.LookupCNAME
	if lookup == nil {
		lookup = net.LookupCNAME
	}

	cname, err := lookup(site.CustomDomain)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"verified": false,
				"domain":   site.CustomDomain,
				"error":    err.Error(),
				"message":  "DNS CNAME lookup failed. Ensure CNAME record is configured.",
			},
		})
		return
	}

	cleanCNAME := strings.ToLower(strings.TrimSuffix(cname, "."))
	isVerified := cleanCNAME == "cname.klados.app" || cleanCNAME == "klados.app"

	var message string
	if isVerified {
		message = "Custom domain successfully verified."
	} else {
		message = fmt.Sprintf("CNAME points to '%s', but must point to cname.klados.app or klados.app", cleanCNAME)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"verified": isVerified,
			"domain":   site.CustomDomain,
			"cname":    cleanCNAME,
			"expected": []string{"cname.klados.app", "klados.app"},
			"message":  message,
		},
	})
}

// GetSitemap returns the dynamic XML sitemap for a published site (public endpoint)
func (h *SiteHandler) GetSitemap(c *gin.Context) {
	slug := c.Param("slug")
	var site model.Site
	if err := h.DB.Where("slug = ? AND is_public = ?", slug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	baseURL := "https://" + site.Slug + ".klados.app"
	if site.CustomDomain != "" {
		baseURL = "https://" + site.CustomDomain
	}

	var pages []model.Page
	h.DB.Where("site_id = ? AND status = ? AND deleted_at IS NULL", site.ID, model.PageStatusPublished).
		Order("position asc, created_at asc").Find(&pages)

	urls := []SitemapURL{
		{
			Loc:        baseURL + "/",
			LastMod:    site.UpdatedAt.Format("2006-01-02"),
			ChangeFreq: "daily",
			Priority:   "1.0",
		},
	}

	for _, p := range pages {
		cleanSlug := strings.Trim(p.Slug, "/")
		if cleanSlug == "" || cleanSlug == "index" || cleanSlug == "home" {
			continue
		}
		lastMod := p.UpdatedAt
		if p.PublishedAt != nil {
			lastMod = *p.PublishedAt
		}
		urls = append(urls, SitemapURL{
			Loc:        baseURL + "/" + cleanSlug,
			LastMod:    lastMod.Format("2006-01-02"),
			ChangeFreq: "weekly",
			Priority:   "0.8",
		})
	}

	urlset := SitemapURLSet{URLs: urls}
	data, err := xml.MarshalIndent(urlset, "", "  ")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate sitemap"})
		return
	}

	output := append([]byte(xml.Header), data...)
	c.Data(http.StatusOK, "application/xml; charset=utf-8", output)
}

// GetRobotsTxt returns robots.txt permitting crawling and linking to sitemap (public endpoint)
func (h *SiteHandler) GetRobotsTxt(c *gin.Context) {
	slug := c.Param("slug")
	var site model.Site
	if err := h.DB.Where("slug = ? AND is_public = ?", slug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	baseURL := "https://" + site.Slug + ".klados.app"
	if site.CustomDomain != "" {
		baseURL = "https://" + site.CustomDomain
	}

	robots := fmt.Sprintf("User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n", baseURL)
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(robots))
}