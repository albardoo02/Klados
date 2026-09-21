package handler

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
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

// GET /v1/auth/config (公開・認証設定の取得)
func (h *AuthHandler) GetAuthConfig(c *gin.Context) {
	cfg := h.getOrCreateAuthConfig()
	var ruleCount int64
	h.DB.Model(&model.AuthRoutingRule{}).Where("enabled = ?", true).Count(&ruleCount)

	ghID, ghSecret := h.getGithubCredentials()
	dcID, dcSecret := h.getDiscordCredentials()

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

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"config":             cfg,
			"active_rules_count": ruleCount,
			"oauth_providers":    providers,
			"github_configured":  ghID != "" && ghSecret != "",
			"discord_configured": dcID != "" && dcSecret != "",
			"github_client_id":   ghID,
			"discord_client_id":  dcID,
		},
	})
}

type updateAuthConfigRequest struct {
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

// PUT /v1/auth/config (要root認証・認証設定の更新)
func (h *AuthHandler) UpdateAuthConfig(c *gin.Context) {
	if !h.requireRootUser(c) {
		return
	}

	var req updateAuthConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
	var rules []model.AuthRoutingRule
	h.DB.Preload("TargetSite").Order("created_at desc").Find(&rules)
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
	if !h.requireRootUser(c) {
		return
	}

	var req createRoutingRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
	if !h.requireRootUser(c) {
		return
	}

	id := c.Param("id")
	var rule model.AuthRoutingRule
	if err := h.DB.Where("id = ?", id).First(&rule).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ルールが見つかりません"})
		return
	}

	var req createRoutingRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
	if !h.requireRootUser(c) {
		return
	}

	id := c.Param("id")
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
