package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"math"
	"net/http"
	"sort"
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
	PageSlug  string     `json:"page_slug"`
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

type DailyStat struct {
	Date string `json:"date"`
	PV   int64  `json:"pv"`
	UV   int64  `json:"uv"`
}

type TopPageStat struct {
	Slug       string  `json:"slug"`
	Title      string  `json:"title"`
	PV         int64   `json:"pv"`
	UV         int64   `json:"uv"`
	Percentage float64 `json:"percentage"`
}

type ReferrerStat struct {
	Source     string  `json:"source"`
	PV         int64   `json:"pv"`
	Percentage float64 `json:"percentage"`
}

type DeviceStat struct {
	Device     string  `json:"device"`
	Percentage float64 `json:"percentage"`
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
	if err := h.DB.Where("(slug = ? OR custom_domain = ?) AND is_public = ?", slug, slug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	var req recordViewRequest
	_ = c.ShouldBindJSON(&req)

	path := strings.TrimSpace(req.Path)
	if path == "" && req.PageSlug != "" {
		path = req.PageSlug
		if !strings.HasPrefix(path, "/") {
			path = "/" + path
		}
	}
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

	rangeParam := c.Query("range")
	daysParam := c.DefaultQuery("days", "30")
	days := 30
	if rangeParam == "7d" {
		days = 7
	} else if rangeParam == "30d" {
		days = 30
	} else if d, err := strconv.Atoi(daysParam); err == nil && d > 0 {
		days = d
	}

	now := time.Now()
	cutoff := now.AddDate(0, 0, -days)
	prevCutoff := now.AddDate(0, 0, -2*days)

	// Fetch all pageviews in the period
	var pvs []model.PageView
	h.DB.Where("site_id = ? AND created_at >= ?", site.ID, cutoff).Order("created_at asc").Find(&pvs)

	totalPV := int64(len(pvs))
	uniqueIPs := make(map[string]bool)

	// Prepare daily stats slots
	type dayAcc struct {
		pv  int64
		ips map[string]bool
	}
	dayKeys := make([]string, days)
	dayMap := make(map[string]*dayAcc)

	for i := 0; i < days; i++ {
		t := now.AddDate(0, 0, -(days - 1 - i))
		key := t.Format("2006-01-02")
		dayKeys[i] = key
		dayMap[key] = &dayAcc{ips: make(map[string]bool)}
	}

	// Prepare page accumulators
	type pageAcc struct {
		pageID *uuid.UUID
		path   string
		pv     int64
		ips    map[string]bool
	}
	pageStatsMap := make(map[string]*pageAcc)

	// Referrers accumulator
	refMap := make(map[string]int64)

	// Devices accumulator
	deviceMap := make(map[string]int64)

	// Session duration & bounce calculation
	ipTimestamps := make(map[string][]time.Time)

	for _, pv := range pvs {
		if pv.IP != "" {
			uniqueIPs[pv.IP] = true
			ipTimestamps[pv.IP] = append(ipTimestamps[pv.IP], pv.CreatedAt)
		}

		// Daily
		dKey := pv.CreatedAt.Format("2006-01-02")
		if acc, ok := dayMap[dKey]; ok {
			acc.pv++
			if pv.IP != "" {
				acc.ips[pv.IP] = true
			}
		}

		// Top page
		cleanPath := strings.Trim(pv.Path, "/")
		if cleanPath == "" {
			cleanPath = "index"
		}
		if _, ok := pageStatsMap[cleanPath]; !ok {
			pageStatsMap[cleanPath] = &pageAcc{
				pageID: pv.PageID,
				path:   cleanPath,
				ips:    make(map[string]bool),
			}
		}
		pageStatsMap[cleanPath].pv++
		if pv.IP != "" {
			pageStatsMap[cleanPath].ips[pv.IP] = true
		}

		// Referrer
		rawRef := strings.TrimSpace(pv.Referrer)
		refLabel := "直接アクセス (Direct)"
		if rawRef != "" {
			lowRef := strings.ToLower(rawRef)
			if strings.Contains(lowRef, "google.") {
				refLabel = "Google 検索 (Organic)"
			} else if strings.Contains(lowRef, "bing.") || strings.Contains(lowRef, "yahoo.") || strings.Contains(lowRef, "duckduckgo.") {
				refLabel = "検索エンジン (Other Search)"
			} else if strings.Contains(lowRef, "twitter.com") || strings.Contains(lowRef, "x.com") || strings.Contains(lowRef, "t.co") {
				refLabel = "X (旧 Twitter)"
			} else if strings.Contains(lowRef, "github.com") {
				refLabel = "GitHub"
			} else if strings.Contains(lowRef, "facebook.com") || strings.Contains(lowRef, "instagram.com") {
				refLabel = "SNS (Meta)"
			} else {
				cleanRef := lowRef
				if strings.HasPrefix(cleanRef, "http://") {
					cleanRef = cleanRef[7:]
				} else if strings.HasPrefix(cleanRef, "https://") {
					cleanRef = cleanRef[8:]
				}
				slashIdx := strings.Index(cleanRef, "/")
				if slashIdx != -1 {
					cleanRef = cleanRef[:slashIdx]
				}
				if cleanRef != "" {
					refLabel = cleanRef
				} else {
					refLabel = "その他 / リファラー"
				}
			}
		}
		refMap[refLabel]++

		// Device
		lowUA := strings.ToLower(pv.UserAgent)
		devLabel := "デスクトップ PC"
		if strings.Contains(lowUA, "ipad") || strings.Contains(lowUA, "tablet") {
			devLabel = "タブレット"
		} else if strings.Contains(lowUA, "mobile") || strings.Contains(lowUA, "iphone") || strings.Contains(lowUA, "android") {
			devLabel = "モバイル"
		} else if strings.Contains(lowUA, "bot") || strings.Contains(lowUA, "crawler") || strings.Contains(lowUA, "spider") {
			devLabel = "ボット / クローラー"
		}
		deviceMap[devLabel]++
	}

	// Format daily stats
	dailyStats := make([]DailyStat, len(dayKeys))
	for i, key := range dayKeys {
		acc := dayMap[key]
		t, _ := time.Parse("2006-01-02", key)
		dateLabel := t.Format("1/2")
		dailyStats[i] = DailyStat{
			Date: dateLabel,
			PV:   acc.pv,
			UV:   int64(len(acc.ips)),
		}
	}

	// Format top pages
	var pages []model.Page
	h.DB.Where("site_id = ? AND deleted_at IS NULL", site.ID).Find(&pages)
	pageTitleMap := make(map[string]string)
	for _, p := range pages {
		cleanSlug := strings.Trim(p.Slug, "/")
		if cleanSlug == "" {
			cleanSlug = "index"
		}
		pageTitleMap[cleanSlug] = p.Title
	}

	topPages := make([]TopPageStat, 0, len(pageStatsMap))
	for slug, acc := range pageStatsMap {
		title := slug
		if t, ok := pageTitleMap[slug]; ok && t != "" {
			title = t
		} else if slug == "index" {
			title = site.Title + " トップ"
		}
		var pct float64 = 0
		if totalPV > 0 {
			pct = math.Round(float64(acc.pv)/float64(totalPV)*1000) / 10
		}
		topPages = append(topPages, TopPageStat{
			Slug:       slug,
			Title:      title,
			PV:         acc.pv,
			UV:         int64(len(acc.ips)),
			Percentage: pct,
		})
	}
	sort.Slice(topPages, func(i, j int) bool {
		return topPages[i].PV > topPages[j].PV
	})
	if len(topPages) > 10 {
		topPages = topPages[:10]
	}

	// Format referrers
	referrers := make([]ReferrerStat, 0, len(refMap))
	for src, count := range refMap {
		var pct float64 = 0
		if totalPV > 0 {
			pct = math.Round(float64(count)/float64(totalPV)*1000) / 10
		}
		referrers = append(referrers, ReferrerStat{
			Source:     src,
			PV:         count,
			Percentage: pct,
		})
	}
	sort.Slice(referrers, func(i, j int) bool {
		return referrers[i].PV > referrers[j].PV
	})

	// Format devices
	devices := make([]DeviceStat, 0, len(deviceMap))
	for dev, count := range deviceMap {
		var pct float64 = 0
		if totalPV > 0 {
			pct = math.Round(float64(count)/float64(totalPV)*1000) / 10
		}
		devices = append(devices, DeviceStat{
			Device:     dev,
			Percentage: pct,
		})
	}
	sort.Slice(devices, func(i, j int) bool {
		return devices[i].Percentage > devices[j].Percentage
	})

	// Comparison with previous period
	var prevPV, prevUV int64
	h.DB.Model(&model.PageView{}).Where("site_id = ? AND created_at >= ? AND created_at < ?", site.ID, prevCutoff, cutoff).Count(&prevPV)
	h.DB.Model(&model.PageView{}).Where("site_id = ? AND created_at >= ? AND created_at < ? AND ip != ''", site.ID, prevCutoff, cutoff).Distinct("ip").Count(&prevUV)

	var pvChangePct float64 = 0
	if prevPV > 0 {
		pvChangePct = math.Round(float64(totalPV-prevPV)/float64(prevPV)*1000) / 10
	} else if totalPV > 0 {
		pvChangePct = 100
	}

	uniqueVisitors := int64(len(uniqueIPs))
	var uvChangePct float64 = 0
	if prevUV > 0 {
		uvChangePct = math.Round(float64(uniqueVisitors-prevUV)/float64(prevUV)*1000) / 10
	} else if uniqueVisitors > 0 {
		uvChangePct = 100
	}

	// Bounce rate & session duration
	var bounceCount int64 = 0
	var totalDurationSec float64 = 0
	var multiPageSessions int64 = 0

	for _, times := range ipTimestamps {
		if len(times) <= 1 {
			bounceCount++
		} else {
			multiPageSessions++
			minT := times[0]
			maxT := times[0]
			for _, t := range times[1:] {
				if t.Before(minT) {
					minT = t
				}
				if t.After(maxT) {
					maxT = t
				}
			}
			diff := maxT.Sub(minT).Seconds()
			if diff > 1800 {
				diff = 1800
			}
			totalDurationSec += diff
		}
	}

	var bounceRate float64 = 0
	if uniqueVisitors > 0 {
		bounceRate = math.Round(float64(bounceCount)/float64(uniqueVisitors)*1000) / 10
	}

	var avgDurationSec int64 = 0
	if multiPageSessions > 0 {
		avgDurationSec = int64(math.Round(totalDurationSec / float64(multiPageSessions)))
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"site_id":              site.ID,
			"days":                 days,
			"total_pv":             totalPV,
			"total_views":          totalPV,
			"unique_visitors":      uniqueVisitors,
			"pv_change_percentage": pvChangePct,
			"uv_change_percentage": uvChangePct,
			"avg_duration_seconds": avgDurationSec,
			"bounce_rate":          bounceRate,
			"daily_stats":          dailyStats,
			"top_pages":            topPages,
			"referrers":            referrers,
			"devices":              devices,
		},
	})
}
