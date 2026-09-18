package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"gorm.io/gorm"
)

type AnalyticsHandler struct {
	DB *gorm.DB
}

type recordViewRequest struct {
	Path      string     `json:"path"`
	Referrer  string     `json:"referrer"`
	UserAgent string     `json:"user_agent"`
	PageID    *uuid.UUID `json:"page_id"`
}

type TopPageItem struct {
	Path   string     `json:"path"`
	PageID *uuid.UUID `json:"page_id"`
	Title  string     `json:"title"`
	Views  int64      `json:"views"`
}

func HashIP(ip string) string {
	if ip == "" {
		return ""
	}
	h := sha256.Sum256([]byte(ip))
	return hex.EncodeToString(h[:])
}

// RecordView records a page view for a site (public endpoint)
func (h *AnalyticsHandler) RecordView(c *gin.Context) {
	slug := c.Param("slug")

	var site model.Site
	if err := h.DB.Where("slug = ? AND is_public = ?", slug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	var req recordViewRequest
	_ = c.ShouldBindJSON(&req)

	path := strings.TrimSpace(req.Path)
	if path == "" {
		path = "/"
	}

	referrer := req.Referrer
	if referrer == "" {
		referrer = c.Request.Referer()
	}

	userAgent := req.UserAgent
	if userAgent == "" {
		userAgent = c.Request.UserAgent()
	}

	clientIP := c.ClientIP()
	hashedIP := HashIP(clientIP)

	var pageID *uuid.UUID
	if req.PageID != nil && *req.PageID != uuid.Nil {
		pageID = req.PageID
	} else {
		// Attempt to resolve PageID from path
		cleanPath := strings.Trim(path, "/")
		var page model.Page
		var err error
		if cleanPath == "" || cleanPath == "index" {
			err = h.DB.Where("site_id = ? AND slug IN ('index', 'home', '') AND status = ? AND deleted_at IS NULL",
				site.ID, model.PageStatusPublished).Order("position asc, created_at asc").First(&page).Error
		} else {
			err = h.DB.Where("site_id = ? AND (slug = ? OR slug = ?) AND status = ? AND deleted_at IS NULL",
				site.ID, cleanPath, "/"+cleanPath, model.PageStatusPublished).First(&page).Error
		}
		if err == nil {
			pageID = &page.ID
		}
	}

	pv := model.PageView{
		SiteID:    site.ID,
		PageID:    pageID,
		Path:      path,
		Referrer:  referrer,
		UserAgent: userAgent,
		IP:        hashedIP,
		CreatedAt: time.Now(),
	}

	if err := h.DB.Create(&pv).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": pv})
}

// GetAnalytics returns analytics stats for the site (protected endpoint)
func (h *AnalyticsHandler) GetAnalytics(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("id")

	var site model.Site
	if err := h.DB.Where("id = ? AND user_id = ?", siteID, userID).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	daysParam := c.DefaultQuery("days", "30")
	days, err := strconv.Atoi(daysParam)
	if err != nil || days <= 0 {
		days = 30
	}

	cutoff := time.Now().AddDate(0, 0, -days)

	// Total views in requested period
	var totalViews int64
	h.DB.Model(&model.PageView{}).Where("site_id = ? AND created_at >= ?", site.ID, cutoff).Count(&totalViews)

	// Unique visitors in requested period
	var uniqueVisitors int64
	h.DB.Model(&model.PageView{}).
		Where("site_id = ? AND created_at >= ? AND ip != ''", site.ID, cutoff).
		Distinct("ip").
		Count(&uniqueVisitors)

	// Top pages in requested period
	var topPages []TopPageItem
	h.DB.Model(&model.PageView{}).
		Select("path, page_id, count(*) as views").
		Where("site_id = ? AND created_at >= ?", site.ID, cutoff).
		Group("path, page_id").
		Order("views desc").
		Limit(10).
		Scan(&topPages)

	// Populate page titles
	if len(topPages) > 0 {
		var pages []model.Page
		h.DB.Where("site_id = ? AND deleted_at IS NULL", site.ID).Find(&pages)
		pageMap := make(map[uuid.UUID]string)
		slugMap := make(map[string]string)
		for _, p := range pages {
			pageMap[p.ID] = p.Title
			cleanSlug := strings.Trim(p.Slug, "/")
			slugMap[cleanSlug] = p.Title
		}

		for i := range topPages {
			if topPages[i].PageID != nil {
				if title, ok := pageMap[*topPages[i].PageID]; ok {
					topPages[i].Title = title
					continue
				}
			}
			cleanPath := strings.Trim(topPages[i].Path, "/")
			if title, ok := slugMap[cleanPath]; ok {
				topPages[i].Title = title
				continue
			}
			if cleanPath == "" || cleanPath == "index" {
				topPages[i].Title = "Home"
			} else {
				topPages[i].Title = topPages[i].Path
			}
		}
	}

	// Calculate 7-day stats
	cutoff7d := time.Now().AddDate(0, 0, -7)
	var pv7d, uv7d int64
	h.DB.Model(&model.PageView{}).Where("site_id = ? AND created_at >= ?", site.ID, cutoff7d).Count(&pv7d)
	h.DB.Model(&model.PageView{}).Where("site_id = ? AND created_at >= ? AND ip != ''", site.ID, cutoff7d).Distinct("ip").Count(&uv7d)

	// Calculate 30-day stats
	cutoff30d := time.Now().AddDate(0, 0, -30)
	var pv30d, uv30d int64
	h.DB.Model(&model.PageView{}).Where("site_id = ? AND created_at >= ?", site.ID, cutoff30d).Count(&pv30d)
	h.DB.Model(&model.PageView{}).Where("site_id = ? AND created_at >= ? AND ip != ''", site.ID, cutoff30d).Distinct("ip").Count(&uv30d)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"site_id":         site.ID,
			"days":            days,
			"total_views":     totalViews,
			"unique_visitors": uniqueVisitors,
			"top_pages":       topPages,
			"last_7_days": gin.H{
				"total_views":     pv7d,
				"unique_visitors": uv7d,
			},
			"last_30_days": gin.H{
				"total_views":     pv30d,
				"unique_visitors": uv30d,
			},
		},
	})
}
