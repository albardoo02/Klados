package handler

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type SiteHandler struct {
	DB          *gorm.DB
	LookupCNAME func(host string) (string, error)
	JWTSecret   string
}

type createSiteRequest struct {
	Slug        string `json:"slug" binding:"required,min=3,max=63"`
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	Theme       string `json:"theme"`
	Password    string `json:"password"`
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

type SiteResponseItem struct {
	model.Site
	Role    model.SiteRole `json:"role"`
	IsOwner bool           `json:"is_owner"`
}

func (h *SiteHandler) List(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	// オーナーとして所有しているサイト
	var ownedSites []model.Site
	h.DB.Where("user_id = ?", userID).Order("created_at desc").Find(&ownedSites)

	// メンバーとして招待されたサイト
	var memberRecords []model.SiteMember
	h.DB.Preload("Site").Where("user_id = ?", userID).Find(&memberRecords)

	var results []SiteResponseItem
	siteMap := make(map[uuid.UUID]bool)

	for _, s := range ownedSites {
		siteMap[s.ID] = true
		results = append(results, SiteResponseItem{
			Site:    s,
			Role:    model.RoleOwner,
			IsOwner: true,
		})
	}

	for _, m := range memberRecords {
		if !siteMap[m.SiteID] && m.Site.ID != uuid.Nil {
			siteMap[m.SiteID] = true
			results = append(results, SiteResponseItem{
				Site:    m.Site,
				Role:    m.Role,
				IsOwner: false,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": results})
}

func (h *SiteHandler) Create(c *gin.Context) {
	userID := c.GetString("user_id")
	var req createSiteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	uid, _ := uuid.Parse(userID)

	// root制限チェック: OnlyRootCanCreateSites が true の場合、rootユーザー以外はサイト新規作成不可
	var user model.User
	if err := h.DB.Where("id = ?", uid).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ユーザーが見つかりません"})
		return
	}

	var authConfig model.AuthConfig
	if err := h.DB.Where("id = ?", "default").First(&authConfig).Error; err == nil {
		if authConfig.OnlyRootCanCreateSites && !user.IsRoot {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "サイトの新規作成はシステム管理者(root)のみ許可されています。割り当てられたサイトをご利用ください。",
			})
			return
		}
	}

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

	if strings.TrimSpace(req.Password) != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(strings.TrimSpace(req.Password)), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}
		hashStr := string(hash)
		site.PasswordHash = &hashStr
		site.IsProtected = true
	}

	if err := h.DB.Create(site).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "slug already in use"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": site})
}

func (h *SiteHandler) Get(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)
	id := c.Param("id")

	var site model.Site
	if err := h.DB.Where("id = ?", id).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	// オーナーかメンバーか確認
	role := model.RoleOwner
	isOwner := site.UserID == userID

	if !isOwner {
		var member model.SiteMember
		if err := h.DB.Where("site_id = ? AND user_id = ?", site.ID, userID).First(&member).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		role = member.Role
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"id":            site.ID,
			"user_id":       site.UserID,
			"slug":          site.Slug,
			"custom_domain": site.CustomDomain,
			"title":         site.Title,
			"description":   site.Description,
			"theme":         site.Theme,
			"is_public":     site.IsPublic,
			"is_protected":  site.IsProtected,
			"settings":      site.Settings,
			"created_at":    site.CreatedAt,
			"updated_at":    site.UpdatedAt,
			"role":          role,
			"is_owner":      isOwner,
		},
	})
}

func (h *SiteHandler) Update(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)
	id := c.Param("id")

	var site model.Site
	if err := h.DB.Where("id = ?", id).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	// オーナーまたは管理者・設定変更権限を持つカスタムメンバー
	if site.UserID != userID {
		var member model.SiteMember
		if err := h.DB.Where("site_id = ? AND user_id = ?", site.ID, userID).First(&member).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		canManage := member.Role == model.RoleAdmin
		if member.Role == model.RoleCustom && len(member.Permissions) > 0 {
			var perms model.SitePermissions
			if json.Unmarshal(member.Permissions, &perms) == nil && perms.CanManageSettings {
				canManage = true
			}
		}
		if !canManage {
			c.JSON(http.StatusForbidden, gin.H{"error": "サイト設定を変更する権限がありません"})
			return
		}
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

func extractTokenFromHeaderOrCookie(c *gin.Context) string {
	if h := c.GetHeader("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer ")
	}
	if cookie, err := c.Cookie("access_token"); err == nil {
		return cookie
	}
	return ""
}

func (h *SiteHandler) GetBySlug(c *gin.Context) {
	slug := c.Param("slug")
	var site model.Site
	if err := h.DB.Where("(slug = ? OR custom_domain = ?) AND is_public = ?", slug, slug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	if !CheckSiteAccess(c, &site) {
		return
	}

	// オプショナル認証: トークンが存在する場合、現在のユーザーの権限をチェック
	canEdit := false
	isOwner := false
	var role string

	token := extractTokenFromHeaderOrCookie(c)
	if token != "" && h.JWTSecret != "" {
		claims := jwt.MapClaims{}
		t, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(h.JWTSecret), nil
		})
		if err == nil && t.Valid {
			if sub, ok := claims["sub"].(string); ok {
				if uid, err := uuid.Parse(sub); err == nil {
					if site.UserID == uid {
						canEdit = true
						isOwner = true
						role = string(model.RoleOwner)
					} else {
						var member model.SiteMember
						if err := h.DB.Where("site_id = ? AND user_id = ?", site.ID, uid).Limit(1).Find(&member).Error; err == nil && member.ID != uuid.Nil {
							role = string(member.Role)
							if member.Role == model.RoleAdmin || member.Role == model.RoleEditor {
								canEdit = true
							} else if member.Role == model.RoleCustom && len(member.Permissions) > 0 {
								var perms model.SitePermissions
								if json.Unmarshal(member.Permissions, &perms) == nil && perms.CanEditPages {
									canEdit = true
								}
							}
						}
					}
				}
			}
		}
	}

	var pages []model.Page
	h.DB.Where("site_id = ? AND status = ? AND deleted_at IS NULL", site.ID, model.PageStatusPublished).
		Order("position asc, created_at asc").
		Find(&pages)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"id":            site.ID,
			"user_id":       site.UserID,
			"slug":          site.Slug,
			"custom_domain": site.CustomDomain,
			"title":         site.Title,
			"description":   site.Description,
			"theme":         site.Theme,
			"is_public":     site.IsPublic,
			"is_protected":  site.IsProtected,
			"settings":      site.Settings,
			"created_at":    site.CreatedAt,
			"updated_at":    site.UpdatedAt,
			"can_edit":      canEdit,
			"is_owner":      isOwner,
			"role":          role,
			"pages":         pages,
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
	cnameTarget := strings.ToLower(strings.TrimSpace(os.Getenv("CNAME_TARGET")))
	if cnameTarget == "" {
		cnameTarget = "cms.azisaba.net"
	}
	isVerified := cleanCNAME == "cname.klados.app" || cleanCNAME == "klados.app" ||
		cleanCNAME == cnameTarget || strings.HasSuffix(cleanCNAME, ".azisaba.net") ||
		strings.HasSuffix(cleanCNAME, ".cfargotunnel.com")

	var message string
	if isVerified {
		message = "Custom domain successfully verified."
	} else {
		message = fmt.Sprintf("CNAME points to '%s', but must point to %s or Cloudflare Tunnel", cleanCNAME, cnameTarget)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"verified": isVerified,
			"domain":   site.CustomDomain,
			"cname":    cleanCNAME,
			"expected": []string{cnameTarget, "cname.klados.app", "*.cfargotunnel.com"},
			"message":  message,
		},
	})
}

// GetSitemap returns the dynamic XML sitemap for a published site (public endpoint)
func (h *SiteHandler) GetSitemap(c *gin.Context) {
	slug := c.Param("slug")
	var site model.Site
	if err := h.DB.Where("(slug = ? OR custom_domain = ?) AND is_public = ?", slug, slug, true).First(&site).Error; err != nil {
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
	if err := h.DB.Where("(slug = ? OR custom_domain = ?) AND is_public = ?", slug, slug, true).First(&site).Error; err != nil {
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

// Export packages all pages as .md files (with YAML frontmatter) into a downloadable ZIP archive
func (h *SiteHandler) Export(c *gin.Context) {
	userID := c.GetString("user_id")
	id := c.Param("id")

	var site model.Site
	if err := h.DB.Where("id = ? AND user_id = ?", id, userID).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	var pages []model.Page
	if err := h.DB.Where("site_id = ? AND deleted_at IS NULL", site.ID).
		Order("position asc, created_at asc").Find(&pages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	buf := new(bytes.Buffer)
	zw := zip.NewWriter(buf)

	for _, page := range pages {
		cleanSlug := strings.Trim(page.Slug, "/")
		if cleanSlug == "" {
			cleanSlug = "index"
		}
		filename := cleanSlug + ".md"

		createdAtStr := page.CreatedAt.Format(time.RFC3339)
		updatedAtStr := page.UpdatedAt.Format(time.RFC3339)

		frontmatter := fmt.Sprintf("---\ntitle: \"%s\"\nslug: \"%s\"\nstatus: \"%s\"\nposition: %d\ncreated_at: \"%s\"\nupdated_at: \"%s\"\n---\n\n",
			strings.ReplaceAll(page.Title, `"`, `\"`),
			strings.ReplaceAll(page.Slug, `"`, `\"`),
			page.Status,
			page.Position,
			createdAtStr,
			updatedAtStr,
		)

		content := frontmatter + page.Content

		w, err := zw.Create(filename)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create zip entry"})
			return
		}
		if _, err := w.Write([]byte(content)); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to write zip file content"})
			return
		}
	}

	if err := zw.Close(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to finalize zip archive"})
		return
	}

	c.Header("Content-Type", "application/zip")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s-export.zip\"", site.Slug))
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}
