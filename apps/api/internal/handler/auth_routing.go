package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"gorm.io/datatypes"
)

type AppliedRuleResult struct {
	RuleName   string `json:"rule_name"`
	RuleType   string `json:"rule_type"`
	MatchValue string `json:"match_value"`
	SiteID     string `json:"site_id,omitempty"`
	SiteTitle  string `json:"site_title,omitempty"`
	SiteSlug   string `json:"site_slug,omitempty"`
	Role       string `json:"role,omitempty"`
}

func (h *AuthHandler) requireRootUser(c *gin.Context) bool {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "認証が必要です"})
		return false
	}
	var user model.User
	if err := h.DB.Where("id = ?", userID).First(&user).Error; err != nil || !user.IsRoot {
		c.JSON(http.StatusForbidden, gin.H{"error": "システム管理者(root)権限が必要です"})
		return false
	}
	return true
}

// canManageSiteAuth checks whether the user is root, owns the site, or is an admin/settings-manager of the site.
func (h *AuthHandler) canManageSiteAuth(userID string, siteID *uuid.UUID) bool {
	if userID == "" || h.DB == nil {
		return false
	}
	uid, err := uuid.Parse(userID)
	if err != nil {
		return false
	}
	var user model.User
	if err := h.DB.Where("id = ?", uid).First(&user).Error; err == nil && user.IsRoot {
		return true
	}
	if siteID == nil || *siteID == uuid.Nil {
		// Check if user owns at least one site or is admin of at least one site
		var ownedCount int64
		h.DB.Model(&model.Site{}).Where("user_id = ?", uid).Count(&ownedCount)
		if ownedCount > 0 {
			return true
		}
		var adminCount int64
		h.DB.Model(&model.SiteMember{}).Where("user_id = ? AND role IN ?", uid, []model.SiteRole{model.RoleOwner, model.RoleAdmin}).Count(&adminCount)
		return adminCount > 0
	}
	var site model.Site
	if err := h.DB.Where("id = ?", *siteID).First(&site).Error; err != nil {
		return false
	}
	if site.UserID == uid {
		return true
	}
	var member model.SiteMember
	if err := h.DB.Where("site_id = ? AND user_id = ?", *siteID, uid).First(&member).Error; err == nil {
		if member.Role == model.RoleOwner || member.Role == model.RoleAdmin {
			return true
		}
		if member.Role == model.RoleCustom && len(member.Permissions) > 0 {
			var perms model.SitePermissions
			if json.Unmarshal(member.Permissions, &perms) == nil && (perms.CanManageSettings || perms.CanInviteMembers) {
				return true
			}
		}
	}
	return false
}

func (h *AuthHandler) getOrCreateAuthConfig() *model.AuthConfig {
	defaultCfg := &model.AuthConfig{
		ID:                       "default",
		RequireEmailVerification: false, // デフォルト任意（メールサービス設定不要）
		AllowEmailRegistration:   true,  // デフォルト: メール新規登録許可
		EnableEmailLogin:         true,  // デフォルト: メールログイン有効
		EnableGithubLogin:        true,  // デフォルト: GitHub有効
		EnableDiscordLogin:       true,  // デフォルト: Discord有効
		EnableGoogleLogin:        true,  // デフォルト: Google有効
		EnableDemoLogin:          true,  // デフォルト: デモログイン有効
		OnlyRootCanCreateSites:   true,  // デフォルト: サイト作成はroot管理者のみ
		DefaultRole:              "viewer",
		AllowedDomains:           "",
		RestrictToRules:          false,
		UpdatedAt:                time.Now(),
	}
	if h.DB == nil {
		return defaultCfg
	}
	var cfg model.AuthConfig
	if err := h.DB.Where("id = ?", "default").First(&cfg).Error; err != nil {
		cfg = *defaultCfg
		h.DB.Create(&cfg)
	}
	return &cfg
}

// applySiteAuthOverrides overlays site.Settings["auth_config"] onto a copy of AuthConfig.
func applySiteAuthOverrides(base model.AuthConfig, site *model.Site) (model.AuthConfig, map[string]interface{}) {
	cfg := base
	var siteAuthMap map[string]interface{}
	if site == nil || len(site.Settings) == 0 {
		return cfg, nil
	}
	var settings map[string]interface{}
	if err := json.Unmarshal(site.Settings, &settings); err != nil {
		return cfg, nil
	}
	rawAuth, ok := settings["auth_config"].(map[string]interface{})
	if !ok || rawAuth == nil {
		return cfg, nil
	}
	siteAuthMap = rawAuth
	if v, ok := rawAuth["require_email_verification"].(bool); ok {
		cfg.RequireEmailVerification = v
	}
	if v, ok := rawAuth["allow_email_registration"].(bool); ok {
		cfg.AllowEmailRegistration = v
	}
	if v, ok := rawAuth["enable_email_login"].(bool); ok {
		cfg.EnableEmailLogin = v
	}
	if v, ok := rawAuth["enable_github_login"].(bool); ok {
		cfg.EnableGithubLogin = v
	}
	if v, ok := rawAuth["enable_discord_login"].(bool); ok {
		cfg.EnableDiscordLogin = v
	}
	if v, ok := rawAuth["enable_google_login"].(bool); ok {
		cfg.EnableGoogleLogin = v
	}
	if v, ok := rawAuth["enable_demo_login"].(bool); ok {
		cfg.EnableDemoLogin = v
	}
	if v, ok := rawAuth["default_role"].(string); ok && v != "" {
		cfg.DefaultRole = v
	}
	if v, ok := rawAuth["allowed_domains"].(string); ok {
		cfg.AllowedDomains = v
	}
	if v, ok := rawAuth["restrict_to_rules"].(bool); ok {
		cfg.RestrictToRules = v
	}
	if v, ok := rawAuth["github_client_id"].(string); ok && strings.TrimSpace(v) != "" {
		cfg.GithubClientID = strings.TrimSpace(v)
	}
	if v, ok := rawAuth["discord_client_id"].(string); ok && strings.TrimSpace(v) != "" {
		cfg.DiscordClientID = strings.TrimSpace(v)
	}
	return cfg, siteAuthMap
}

// GET /v1/auth/config (公開・認証設定の取得。?site=<slug_or_id> でサイト別設定を反映)
func (h *AuthHandler) GetAuthConfig(c *gin.Context) {
	baseCfg := h.getOrCreateAuthConfig()
	cfg := *baseCfg

	siteParam := strings.TrimSpace(c.Query("site"))
	if siteParam == "" {
		siteParam = strings.TrimSpace(c.Query("site_id"))
	}

	var targetSite *model.Site
	var siteAuthMap map[string]interface{}
	if siteParam != "" && h.DB != nil {
		var s model.Site
		if uid, err := uuid.Parse(siteParam); err == nil {
			if err := h.DB.Where("id = ?", uid).First(&s).Error; err == nil {
				targetSite = &s
			}
		} else {
			if err := h.DB.Where("slug = ?", siteParam).First(&s).Error; err == nil {
				targetSite = &s
			}
		}
		if targetSite != nil {
			cfg, siteAuthMap = applySiteAuthOverrides(cfg, targetSite)
		}
	}

	var ruleCount int64
	if targetSite != nil {
		h.DB.Model(&model.AuthRoutingRule{}).Where("enabled = ? AND (target_site_id = ? OR target_site_id IS NULL)", true, targetSite.ID).Count(&ruleCount)
	} else {
		h.DB.Model(&model.AuthRoutingRule{}).Where("enabled = ?", true).Count(&ruleCount)
	}

	ghID, ghSecret := h.getGithubCredentials()
	dcID, dcSecret := h.getDiscordCredentials()
	if cfg.GithubClientID != "" {
		ghID = cfg.GithubClientID
	}
	if cfg.DiscordClientID != "" {
		dcID = cfg.DiscordClientID
	}

	providers := make([]string, 0)
	if cfg.EnableGoogleLogin {
		providers = append(providers, "google")
	}
	if cfg.EnableGithubLogin {
		providers = append(providers, "github")
	}
	if cfg.EnableDiscordLogin {
		providers = append(providers, "discord")
	}

	respData := gin.H{
		"config":             cfg,
		"active_rules_count": ruleCount,
		"oauth_providers":    providers,
		"github_configured":  ghID != "" && (ghSecret != "" || cfg.GithubClientID != ""),
		"discord_configured": dcID != "" && (dcSecret != "" || cfg.DiscordClientID != ""),
		"github_client_id":   ghID,
		"discord_client_id":  dcID,
	}
	if targetSite != nil {
		respData["site_id"] = targetSite.ID
		respData["site_slug"] = targetSite.Slug
		respData["site_title"] = targetSite.Title
		respData["site_auth_config"] = siteAuthMap
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    respData,
	})
}

type updateAuthConfigRequest struct {
	SiteID                   *string `json:"site_id"`
	RequireEmailVerification *bool   `json:"require_email_verification"`
	AllowEmailRegistration   *bool   `json:"allow_email_registration"`
	EnableEmailLogin         *bool   `json:"enable_email_login"`
	EnableGithubLogin        *bool   `json:"enable_github_login"`
	EnableDiscordLogin       *bool   `json:"enable_discord_login"`
	EnableGoogleLogin        *bool   `json:"enable_google_login"`
	EnableDemoLogin          *bool   `json:"enable_demo_login"`
	OnlyRootCanCreateSites   *bool   `json:"only_root_can_create_sites"`
	DefaultRole              *string `json:"default_role"`
	AllowedDomains           *string `json:"allowed_domains"`
	RestrictToRules          *bool   `json:"restrict_to_rules"`
	GithubClientID           *string `json:"github_client_id"`
	GithubClientSecret       *string `json:"github_client_secret"`
	DiscordClientID          *string `json:"discord_client_id"`
	DiscordClientSecret      *string `json:"discord_client_secret"`
	MainDomains              *string `json:"main_domains"`
}

// PUT /v1/auth/config (認証設定の更新: site_id指定時はサイト管理者権限、未指定時はrootまたはサイト管理者権限)
func (h *AuthHandler) UpdateAuthConfig(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "認証が必要です"})
		return
	}

	var req updateAuthConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// サイト単位の認証設定更新の場合
	if req.SiteID != nil && strings.TrimSpace(*req.SiteID) != "" {
		siteUUID, err := uuid.Parse(strings.TrimSpace(*req.SiteID))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "無効なサイトIDです"})
			return
		}
		if !h.canManageSiteAuth(userID, &siteUUID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "このサイトのログイン設定を変更する権限がありません"})
			return
		}
		var site model.Site
		if err := h.DB.Where("id = ?", siteUUID).First(&site).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "サイトが見つかりません"})
			return
		}
		settings := make(map[string]interface{})
		if len(site.Settings) > 0 {
			_ = json.Unmarshal(site.Settings, &settings)
		}
		authCfg, ok := settings["auth_config"].(map[string]interface{})
		if !ok || authCfg == nil {
			authCfg = make(map[string]interface{})
		}
		if req.RequireEmailVerification != nil {
			authCfg["require_email_verification"] = *req.RequireEmailVerification
		}
		if req.AllowEmailRegistration != nil {
			authCfg["allow_email_registration"] = *req.AllowEmailRegistration
		}
		if req.EnableEmailLogin != nil {
			authCfg["enable_email_login"] = *req.EnableEmailLogin
		}
		if req.EnableGithubLogin != nil {
			authCfg["enable_github_login"] = *req.EnableGithubLogin
		}
		if req.EnableDiscordLogin != nil {
			authCfg["enable_discord_login"] = *req.EnableDiscordLogin
		}
		if req.EnableGoogleLogin != nil {
			authCfg["enable_google_login"] = *req.EnableGoogleLogin
		}
		if req.EnableDemoLogin != nil {
			authCfg["enable_demo_login"] = *req.EnableDemoLogin
		}
		if req.DefaultRole != nil {
			authCfg["default_role"] = *req.DefaultRole
		}
		if req.AllowedDomains != nil {
			authCfg["allowed_domains"] = *req.AllowedDomains
		}
		if req.RestrictToRules != nil {
			authCfg["restrict_to_rules"] = *req.RestrictToRules
		}
		if req.GithubClientID != nil {
			authCfg["github_client_id"] = strings.TrimSpace(*req.GithubClientID)
		}
		if req.GithubClientSecret != nil && strings.TrimSpace(*req.GithubClientSecret) != "" {
			authCfg["github_client_secret"] = strings.TrimSpace(*req.GithubClientSecret)
		}
		if req.DiscordClientID != nil {
			authCfg["discord_client_id"] = strings.TrimSpace(*req.DiscordClientID)
		}
		if req.DiscordClientSecret != nil && strings.TrimSpace(*req.DiscordClientSecret) != "" {
			authCfg["discord_client_secret"] = strings.TrimSpace(*req.DiscordClientSecret)
		}
		settings["auth_config"] = authCfg
		if encoded, err := json.Marshal(settings); err == nil {
			site.Settings = datatypes.JSON(encoded)
		}
		if err := h.DB.Save(&site).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "サイト認証設定の保存に失敗しました"})
			return
		}
		mergedCfg, _ := applySiteAuthOverrides(*h.getOrCreateAuthConfig(), &site)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "サイトのログイン・認証設定を更新しました",
			"data":    mergedCfg,
		})
		return
	}

	if !h.canManageSiteAuth(userID, nil) {
		c.JSON(http.StatusForbidden, gin.H{"error": "管理者権限が必要です"})
		return
	}

	cfg := h.getOrCreateAuthConfig()
	if req.RequireEmailVerification != nil {
		cfg.RequireEmailVerification = *req.RequireEmailVerification
	}
	if req.AllowEmailRegistration != nil {
		cfg.AllowEmailRegistration = *req.AllowEmailRegistration
	}
	if req.EnableEmailLogin != nil {
		cfg.EnableEmailLogin = *req.EnableEmailLogin
	}
	if req.EnableGithubLogin != nil {
		cfg.EnableGithubLogin = *req.EnableGithubLogin
	}
	if req.EnableDiscordLogin != nil {
		cfg.EnableDiscordLogin = *req.EnableDiscordLogin
	}
	if req.EnableGoogleLogin != nil {
		cfg.EnableGoogleLogin = *req.EnableGoogleLogin
	}
	if req.EnableDemoLogin != nil {
		cfg.EnableDemoLogin = *req.EnableDemoLogin
	}
	if req.OnlyRootCanCreateSites != nil {
		cfg.OnlyRootCanCreateSites = *req.OnlyRootCanCreateSites
	}
	if req.DefaultRole != nil {
		cfg.DefaultRole = *req.DefaultRole
	}
	if req.AllowedDomains != nil {
		cfg.AllowedDomains = *req.AllowedDomains
	}
	if req.RestrictToRules != nil {
		cfg.RestrictToRules = *req.RestrictToRules
	}
	if req.GithubClientID != nil {
		cfg.GithubClientID = strings.TrimSpace(*req.GithubClientID)
	}
	if req.GithubClientSecret != nil && strings.TrimSpace(*req.GithubClientSecret) != "" {
		cfg.GithubClientSecret = strings.TrimSpace(*req.GithubClientSecret)
	}
	if req.DiscordClientID != nil {
		cfg.DiscordClientID = strings.TrimSpace(*req.DiscordClientID)
	}
	if req.DiscordClientSecret != nil && strings.TrimSpace(*req.DiscordClientSecret) != "" {
		cfg.DiscordClientSecret = strings.TrimSpace(*req.DiscordClientSecret)
	}
	if req.MainDomains != nil {
		cfg.MainDomains = strings.TrimSpace(*req.MainDomains)
	}
	cfg.UpdatedAt = time.Now()

	if err := h.DB.Save(cfg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "設定の保存に失敗しました"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "認証・システム設定を更新しました",
		"data":    cfg,
	})
}

// GET /v1/system/domains (公開・登録済みメインドメイン一覧の取得)
func (h *AuthHandler) GetSystemDomains(c *gin.Context) {
	cfg := h.getOrCreateAuthConfig()
	domainsSet := make(map[string]bool)

	// デフォルトドメイン
	domainsSet["klados.azisaba.net"] = true
	domainsSet["cms.azisaba.net"] = true
	domainsSet["klados.app"] = true
	domainsSet["localhost"] = true
	domainsSet["127.0.0.1"] = true

	// 環境変数 MAIN_DOMAIN
	if envMD := strings.TrimSpace(os.Getenv("MAIN_DOMAIN")); envMD != "" {
		for _, d := range strings.Split(envMD, ",") {
			d = strings.ToLower(strings.TrimSpace(d))
			if d != "" {
				domainsSet[d] = true
			}
		}
	}

	// DB保存の MainDomains
	if cfg.MainDomains != "" {
		for _, d := range strings.Split(cfg.MainDomains, ",") {
			d = strings.ToLower(strings.TrimSpace(d))
			if d != "" {
				domainsSet[d] = true
			}
		}
	}

	result := make([]string, 0, len(domainsSet))
	for d := range domainsSet {
		result = append(result, d)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"domains":      result,
			"main_domains": cfg.MainDomains,
		},
	})
}

// POST /v1/auth/quick-verify (要認証・メールワンクリック即時認証)
func (h *AuthHandler) QuickVerify(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "認証が必要です"})
		return
	}

	var user model.User
	if err := h.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ユーザーが見つかりません"})
		return
	}

	user.EmailVerified = true
	user.VerificationToken = nil
	user.VerificationExpiresAt = nil
	h.DB.Save(&user)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "メールアドレスを認証済みに設定しました！",
		"data":    user,
	})
}

// GET /v1/auth/routing-rules (振り分けルール一覧)
func (h *AuthHandler) ListRoutingRules(c *gin.Context) {
	rules := make([]model.AuthRoutingRule, 0)
	query := h.DB.Preload("TargetSite")
	if siteIDStr := strings.TrimSpace(c.Query("site_id")); siteIDStr != "" {
		if siteUUID, err := uuid.Parse(siteIDStr); err == nil {
			query = query.Where("target_site_id = ?", siteUUID)
		}
	}
	query.Order("created_at desc").Find(&rules)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": rules})
}

type createRoutingRuleRequest struct {
	Name         string     `json:"name" binding:"required"`
	Enabled      *bool      `json:"enabled"`
	Provider     string     `json:"provider"`
	RuleType     string     `json:"rule_type" binding:"required"`
	MatchValue   string     `json:"match_value" binding:"required"`
	ActionType   string     `json:"action_type"`
	TargetSiteID *uuid.UUID `json:"target_site_id"`
	TargetRole   string     `json:"target_role"`
	AutoVerify   *bool      `json:"auto_verify"`
}

// POST /v1/auth/routing-rules (振り分けルールの作成)
func (h *AuthHandler) CreateRoutingRule(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "認証が必要です"})
		return
	}

	var req createRoutingRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !h.canManageSiteAuth(userID, req.TargetSiteID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "このサイトの振り分けルールを作成する権限がありません"})
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	provider := "all"
	if req.Provider != "" {
		provider = req.Provider
	}

	actionType := "assign_site_role"
	if req.ActionType != "" {
		actionType = req.ActionType
	}

	role := model.SiteRole("editor")
	if req.TargetRole != "" {
		role = model.SiteRole(req.TargetRole)
	}

	autoVerify := true
	if req.AutoVerify != nil {
		autoVerify = *req.AutoVerify
	}

	rule := model.AuthRoutingRule{
		Name:         req.Name,
		Enabled:      enabled,
		Provider:     provider,
		RuleType:     req.RuleType,
		MatchValue:   strings.TrimSpace(req.MatchValue),
		ActionType:   actionType,
		TargetSiteID: req.TargetSiteID,
		TargetRole:   role,
		AutoVerify:   autoVerify,
	}

	if err := h.DB.Create(&rule).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ルールの作成に失敗しました"})
		return
	}

	if rule.TargetSiteID != nil {
		h.DB.Preload("TargetSite").First(&rule, rule.ID)
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"message": "振り分けルールを作成しました",
		"data":    rule,
	})
}

// PUT /v1/auth/routing-rules/:id (振り分けルールの更新)
func (h *AuthHandler) UpdateRoutingRule(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "認証が必要です"})
		return
	}

	id := c.Param("id")
	var rule model.AuthRoutingRule
	if err := h.DB.Where("id = ?", id).First(&rule).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ルールが見つかりません"})
		return
	}

	if !h.canManageSiteAuth(userID, rule.TargetSiteID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "このルールを変更する権限がありません"})
		return
	}

	var req createRoutingRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.TargetSiteID != nil && !h.canManageSiteAuth(userID, req.TargetSiteID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "指定されたサイトのルールを設定する権限がありません"})
		return
	}

	rule.Name = req.Name
	if req.Enabled != nil {
		rule.Enabled = *req.Enabled
	}
	if req.Provider != "" {
		rule.Provider = req.Provider
	}
	rule.RuleType = req.RuleType
	rule.MatchValue = strings.TrimSpace(req.MatchValue)
	if req.ActionType != "" {
		rule.ActionType = req.ActionType
	}
	rule.TargetSiteID = req.TargetSiteID
	if req.TargetRole != "" {
		rule.TargetRole = model.SiteRole(req.TargetRole)
	}
	if req.AutoVerify != nil {
		rule.AutoVerify = *req.AutoVerify
	}

	if err := h.DB.Save(&rule).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ルールの更新に失敗しました"})
		return
	}

	if rule.TargetSiteID != nil {
		h.DB.Preload("TargetSite").First(&rule, rule.ID)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "振り分けルールを更新しました",
		"data":    rule,
	})
}

// DELETE /v1/auth/routing-rules/:id (振り分けルールの削除)
func (h *AuthHandler) DeleteRoutingRule(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "認証が必要です"})
		return
	}

	id := c.Param("id")
	var rule model.AuthRoutingRule
	if err := h.DB.Where("id = ?", id).First(&rule).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ルールが見つかりません"})
		return
	}

	if !h.canManageSiteAuth(userID, rule.TargetSiteID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "このルールを削除する権限がありません"})
		return
	}

	if err := h.DB.Where("id = ?", id).Delete(&model.AuthRoutingRule{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ルールの削除に失敗しました"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "振り分けルールを削除しました",
	})
}

type testRoutingRuleRequest struct {
	Provider  string `json:"provider"`
	Email     string `json:"email"`
	Org       string `json:"org"`
	GuildID   string `json:"guild_id"`
	GuildName string `json:"guild_name"`
}

// POST /v1/auth/routing-rules/test (振り分け判定のシミュレーションテスト)
func (h *AuthHandler) TestRoutingRule(c *gin.Context) {
	var req testRoutingRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dummyUser := &model.User{
		Email: req.Email,
		ID:    uuid.New(),
	}

	results, _ := h.applyRoutingRules(dummyUser, req.Provider, req.Org, req.GuildID, req.GuildName, req.Email, false)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"matched_count": len(results),
			"matches":       results,
			"auto_verified": dummyUser.EmailVerified,
		},
	})
}

type DiscordGuildInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type OAuthMatchContext struct {
	Provider string
	Orgs     []string
	Guilds   []DiscordGuildInfo
	Email    string
}

// 組織・サーバー・メールドメインによる振り分けルールの適用
func (h *AuthHandler) applyRoutingRules(
	user *model.User,
	provider, org, guildID, guildName, email string,
	persist bool,
) ([]AppliedRuleResult, error) {
	ctx := OAuthMatchContext{
		Provider: provider,
		Email:    email,
	}
	if org != "" {
		ctx.Orgs = []string{org}
	}
	if guildID != "" || guildName != "" {
		ctx.Guilds = []DiscordGuildInfo{{ID: guildID, Name: guildName}}
	}
	return h.applyRoutingRulesContext(user, ctx, persist)
}

func (h *AuthHandler) applyRoutingRulesContext(
	user *model.User,
	ctx OAuthMatchContext,
	persist bool,
) ([]AppliedRuleResult, error) {
	var rules []model.AuthRoutingRule
	h.DB.Where("enabled = ?", true).Preload("TargetSite").Find(&rules)

	var applied []AppliedRuleResult
	emailLower := strings.ToLower(strings.TrimSpace(ctx.Email))
	emailDomain := ""
	if atIdx := strings.LastIndex(emailLower, "@"); atIdx != -1 {
		emailDomain = emailLower[atIdx:]
	}

	for _, rule := range rules {
		// プロバイダー照合
		if rule.Provider != "all" && rule.Provider != "" && rule.Provider != ctx.Provider {
			continue
		}

		matched := false
		matchVal := strings.TrimSpace(rule.MatchValue)
		matchValLower := strings.ToLower(matchVal)

		switch rule.RuleType {
		case "github_org":
			for _, o := range ctx.Orgs {
				if strings.EqualFold(o, matchVal) {
					matched = true
					break
				}
			}
		case "discord_guild":
			for _, g := range ctx.Guilds {
				if (g.ID != "" && g.ID == matchVal) || (g.Name != "" && strings.EqualFold(g.Name, matchVal)) {
					matched = true
					break
				}
			}
		case "email_domain":
			domainTarget := matchValLower
			if !strings.HasPrefix(domainTarget, "@") {
				domainTarget = "@" + domainTarget
			}
			if emailDomain != "" && strings.EqualFold(emailDomain, domainTarget) {
				matched = true
			}
		case "email_list":
			allowedEmails := strings.Split(matchValLower, ",")
			for _, allowed := range allowedEmails {
				if strings.TrimSpace(allowed) == emailLower {
					matched = true
					break
				}
			}
		}

		if matched {
			if rule.AutoVerify && !user.EmailVerified {
				user.EmailVerified = true
				if persist {
					h.DB.Model(user).Update("email_verified", true)
				}
			}

			if rule.ActionType == "assign_site_role" && rule.TargetSiteID != nil {
				siteID := *rule.TargetSiteID

				if persist {
					var member model.SiteMember
					err := h.DB.Where("site_id = ? AND user_id = ?", siteID, user.ID).First(&member).Error
					if err != nil {
						newMember := model.SiteMember{
							SiteID: siteID,
							UserID: user.ID,
							Role:   rule.TargetRole,
						}
						h.DB.Create(&newMember)
					} else if member.Role != rule.TargetRole && member.Role != model.RoleOwner {
						member.Role = rule.TargetRole
						h.DB.Save(&member)
					}
				}

				res := AppliedRuleResult{
					RuleName:   rule.Name,
					RuleType:   rule.RuleType,
					MatchValue: rule.MatchValue,
					SiteID:     siteID.String(),
					Role:       string(rule.TargetRole),
				}
				if rule.TargetSite != nil {
					res.SiteTitle = rule.TargetSite.Title
					res.SiteSlug = rule.TargetSite.Slug
				}
				applied = append(applied, res)
			} else {
				applied = append(applied, AppliedRuleResult{
					RuleName:   rule.Name,
					RuleType:   rule.RuleType,
					MatchValue: rule.MatchValue,
				})
			}
		}
	}

	return applied, nil
}
