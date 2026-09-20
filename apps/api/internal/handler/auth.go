package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/klados/api/internal/config"
	"github.com/klados/api/internal/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthHandler struct {
	DB        *gorm.DB
	JWTSecret string
	Cfg       *config.Config
}

func (h *AuthHandler) determineIfRoot(email, username string) bool {
	rootEmail := strings.TrimSpace(os.Getenv("ROOT_EMAIL"))
	rootUsername := strings.TrimSpace(os.Getenv("ROOT_USERNAME"))

	if rootEmail != "" && strings.EqualFold(email, rootEmail) {
		return true
	}
	if rootUsername != "" && strings.EqualFold(username, rootUsername) {
		return true
	}

	// ユーザーがまだ0人の場合、最初のユーザーを自動でrootにする
	var userCount int64
	h.DB.Model(&model.User{}).Count(&userCount)
	return userCount == 0
}

type registerRequest struct {
	Email       string `json:"email" binding:"required,email"`
	Username    string `json:"username" binding:"required,min=3,max=30"`
	Password    string `json:"password" binding:"required,min=8"`
	DisplayName string `json:"display_name"`
}

type loginRequest struct {
	Email      string `json:"email" binding:"required,email"`
	Password   string `json:"password" binding:"required"`
	RememberMe bool   `json:"remember_me"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	authConfig := h.getOrCreateAuthConfig()

	var userCount int64
	h.DB.Model(&model.User{}).Count(&userCount)

	// システム初回構築（ユーザー0人）以外の新規登録セキュリティチェック
	if userCount > 0 {
		if !authConfig.EnableEmailLogin || !authConfig.AllowEmailRegistration {
			c.JSON(http.StatusForbidden, gin.H{"error": "メールアドレスによる新規登録は制限されています。公式DiscordまたはGitHubでログインしてください。"})
			return
		}

		// ドメイン制限チェック
		if authConfig.AllowedDomains != "" {
			emailLower := strings.ToLower(strings.TrimSpace(req.Email))
			emailDomain := ""
			if atIdx := strings.LastIndex(emailLower, "@"); atIdx != -1 {
				emailDomain = emailLower[atIdx:]
			}
			domainAllowed := false
			for _, d := range strings.Split(authConfig.AllowedDomains, ",") {
				d = strings.TrimSpace(strings.ToLower(d))
				if !strings.HasPrefix(d, "@") {
					d = "@" + d
				}
				if emailDomain == d {
					domainAllowed = true
					break
				}
			}
			if !domainAllowed {
				c.JSON(http.StatusForbidden, gin.H{"error": fmt.Sprintf("このメールドメイン（%s）からの登録は許可されていません。", emailDomain)})
				return
			}
		}

		// ルール一致制限チェック
		if authConfig.RestrictToRules {
			dummyUser := &model.User{Email: req.Email}
			matches, _ := h.applyRoutingRules(dummyUser, "email", "", "", "", req.Email, false)
			var activeRuleCount int64
			h.DB.Model(&model.AuthRoutingRule{}).Where("enabled = ?", true).Count(&activeRuleCount)
			if activeRuleCount > 0 && len(matches) == 0 {
				c.JSON(http.StatusForbidden, gin.H{"error": "承認された関係者リストまたは所属ルールに合致するメールアドレスのみ登録できます。"})
				return
			}
		}
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	emailVerified := !authConfig.RequireEmailVerification
	isRoot := h.determineIfRoot(req.Email, req.Username)

	pass := string(hashed)
	verificationToken := uuid.New().String()
	verificationExpires := time.Now().Add(24 * time.Hour)
	user := &model.User{
		Email:                 req.Email,
		Username:              req.Username,
		Password:              &pass,
		DisplayName:           req.DisplayName,
		IsRoot:                isRoot,
		EmailVerified:         emailVerified,
		VerificationToken:     &verificationToken,
		VerificationExpiresAt: &verificationExpires,
	}

	if err := h.DB.Create(user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email or username already exists"})
		return
	}

	// 振り分けルールの適用
	h.applyRoutingRules(user, "email", "", "", "", req.Email, true)

	token, err := h.generateToken(user.ID.String(), 24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"data": gin.H{
			"token":                token,
			"user":                 user,
			"dev_verification_url": "http://localhost:3000/verify-email?token=" + verificationToken,
			"require_verification": authConfig.RequireEmailVerification,
		},
	})
}

type verifyEmailRequest struct {
	Token string `json:"token" binding:"required"`
}

func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	var req verifyEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "認証トークンを指定してください"})
		return
	}

	var user model.User
	if err := h.DB.Where("verification_token = ?", req.Token).First(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無効な認証トークンです。すでに認証済みか、トークンが正しくありません。"})
		return
	}

	if user.VerificationExpiresAt != nil && user.VerificationExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "認証トークンの有効期限が切れています。確認メールを再送してください。"})
		return
	}

	user.EmailVerified = true
	user.VerificationToken = nil
	user.VerificationExpiresAt = nil

	if err := h.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ユーザー情報の更新に失敗しました"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "メールアドレスの認証が正常に完了しました！",
		"data":    user,
	})
}

type resendVerificationRequest struct {
	Email string `json:"email"`
}

func (h *AuthHandler) ResendVerification(c *gin.Context) {
	var user model.User

	// ログイン中のユーザー、またはリクエストボディのEmailから取得
	userID := c.GetString("user_id")
	if userID == "" {
		if authHeader := c.GetHeader("Authorization"); len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			tokenStr := authHeader[7:]
			claims := jwt.MapClaims{}
			if t, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				return []byte(h.JWTSecret), nil
			}); err == nil && t.Valid {
				if sub, ok := claims["sub"].(string); ok {
					userID = sub
				}
			}
		}
	}

	if userID != "" {
		if err := h.DB.Where("id = ?", userID).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "ユーザーが見つかりません"})
			return
		}
	} else {
		var req resendVerificationRequest
		if err := c.ShouldBindJSON(&req); err != nil || req.Email == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "メールアドレスを指定してください"})
			return
		}
		if err := h.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
			// セキュリティのため存在しない場合でも成功レスポンスを返す
			c.JSON(http.StatusOK, gin.H{"success": true, "message": "確認メールを送信しました"})
			return
		}
	}

	if user.EmailVerified {
		c.JSON(http.StatusOK, gin.H{
			"success":          true,
			"message":          "このメールアドレスは既に認証済みです",
			"already_verified": true,
		})
		return
	}

	newToken := uuid.New().String()
	newExpires := time.Now().Add(24 * time.Hour)
	user.VerificationToken = &newToken
	user.VerificationExpiresAt = &newExpires

	if err := h.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "認証トークンの再発行に失敗しました"})
		return
	}

	devURL := "http://localhost:3000/verify-email?token=" + newToken

	c.JSON(http.StatusOK, gin.H{
		"success":              true,
		"message":              "確認メールを送信しました（開発環境用リンクを発行しました）",
		"token":                newToken,
		"dev_verification_url": devURL,
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user model.User
	if err := h.DB.Where("email = ?", req.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if user.Password == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "please use OAuth login"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	authConfig := h.getOrCreateAuthConfig()

	// root 管理者以外に対するセキュリティ制限チェック
	if !user.IsRoot {
		if !authConfig.EnableEmailLogin {
			c.JSON(http.StatusForbidden, gin.H{"error": "メールアドレスによるログインは無効化されています。指定の認証プロバイダーをご利用ください。"})
			return
		}

		if authConfig.RequireEmailVerification && !user.EmailVerified {
			c.JSON(http.StatusForbidden, gin.H{"error": "メールアドレスの確認が完了していません。確認メールのリンクをご確認ください。"})
			return
		}

		// ドメイン制限チェック
		if authConfig.AllowedDomains != "" {
			emailLower := strings.ToLower(strings.TrimSpace(user.Email))
			emailDomain := ""
			if atIdx := strings.LastIndex(emailLower, "@"); atIdx != -1 {
				emailDomain = emailLower[atIdx:]
			}
			domainAllowed := false
			for _, d := range strings.Split(authConfig.AllowedDomains, ",") {
				d = strings.TrimSpace(strings.ToLower(d))
				if !strings.HasPrefix(d, "@") {
					d = "@" + d
				}
				if emailDomain == d {
					domainAllowed = true
					break
				}
			}
			if !domainAllowed {
				c.JSON(http.StatusForbidden, gin.H{"error": fmt.Sprintf("このメールドメイン（%s）からのログインは許可されていません。", emailDomain)})
				return
			}
		}

		// ルール一致制限チェック
		if authConfig.RestrictToRules {
			dummyUser := &model.User{Email: user.Email}
			matches, _ := h.applyRoutingRules(dummyUser, "email", "", "", "", user.Email, false)
			var activeRuleCount int64
			h.DB.Model(&model.AuthRoutingRule{}).Where("enabled = ?", true).Count(&activeRuleCount)
			if activeRuleCount > 0 && len(matches) == 0 {
				c.JSON(http.StatusForbidden, gin.H{"error": "承認された関係者リストまたは所属ルールに合致するユーザーのみログインできます。"})
				return
			}
		}
	}

	// remember_me=true → 30日、false → 1日（ブラウザセッション相当）
	ttl := 24 * time.Hour
	if req.RememberMe {
		ttl = 30 * 24 * time.Hour
	}

	token, err := h.generateToken(user.ID.String(), ttl)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"token": token, "user": user, "remember_me": req.RememberMe}})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID := c.GetString("user_id")

	var user model.User
	if err := h.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": user})
}

func (h *AuthHandler) generateToken(userID string, ttl time.Duration) (string, error) {
	claims := jwt.MapClaims{
		"sub": userID,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(ttl).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(h.JWTSecret))
}

type updateProfileRequest struct {
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
}

func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetString("user_id")

	var user model.User
	if err := h.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var req updateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user.DisplayName = req.DisplayName
	user.AvatarURL = req.AvatarURL

	if err := h.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": user})
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := c.GetString("user_id")

	var user model.User
	if err := h.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if user.Password != nil && *user.Password != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(*user.Password), []byte(req.CurrentPassword)); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "現在のパスワードが正しくありません"})
			return
		}
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "パスワードのハッシュ化に失敗しました"})
		return
	}

	passStr := string(hashed)
	user.Password = &passStr

	if err := h.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "パスワードの保存に失敗しました"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "パスワードを変更しました"})
}

// ワンクリック簡単ログイン (Demo / Guest Account)
func (h *AuthHandler) DemoLogin(c *gin.Context) {
	authConfig := h.getOrCreateAuthConfig()
	if !authConfig.EnableDemoLogin {
		c.JSON(http.StatusForbidden, gin.H{"error": "デモログインは無効化されています。"})
		return
	}

	var user model.User
	demoEmail := "demo@klados.app"

	if err := h.DB.Where("email = ?", demoEmail).First(&user).Error; err != nil {
		// デモユーザー作成
		pass := "demo12345"
		hashed, _ := bcrypt.GenerateFromPassword([]byte(pass), bcrypt.DefaultCost)
		passStr := string(hashed)
		user = model.User{
			Email:         demoEmail,
			Username:      "demo_user",
			DisplayName:   "デモ体験ユーザー",
			Password:      &passStr,
			IsRoot:        true, // デモ環境ではroot操作を試せる
			EmailVerified: true,
			Plan:          model.PlanFree,
		}
		if err := h.DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "デモユーザーの作成に失敗しました"})
			return
		}

		// デモ用の初期サイトとサンプルページをシード
		site := model.Site{
			UserID:      user.ID,
			Slug:        "demo-site",
			Title:       "Klados デモサイト",
			Description: "Kladosの全機能（Markdownエディタ・目次・コードブロック・数式）を体験できるデモサイトです",
			Theme:       "minimal",
			IsPublic:    true,
		}
		if err := h.DB.Create(&site).Error; err == nil {
			content := `# ようこそ Klados へ！

Klados は、現代的な開発者やライターのために設計された **次世代 Markdown ウェブサイト構築プラットフォーム** です。

---

## 主な機能のハイライト

### 1. リアルタイム・マークダウンプレビュー & コード補完
左側で書いた Markdown が、右側に即座にレンダリングされます。

### 2. 数式表示 (KaTeX)
インライン数式 $E = mc^2$ やブロック数式に対応しています：

$$\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$

### 3. ソースコードのシンタックスハイライト
` + "```typescript" + `
interface User {
  id: string;
  name: string;
  role: 'admin' | 'editor';
}

console.log("Hello, Klados!");
` + "```" + `

### 4. テーブル描画
| 機能 | Klados | 従来のWiki |
| --- | --- | --- |
| サイト数 | **無制限** | 制限あり |
| ページ数 | **無制限** | 制限あり |
| カスタムドメイン | **対応** | 要設定 |
| リアルタイム共同編集 | **標準搭載** | プラグイン依存 |

---
*上部のエディタやサイト設定から、自由に編集・プレビューをお試しください！*
`
			page := model.Page{
				SiteID:  site.ID,
				Slug:    "home",
				Title:   "ようこそ Klados へ！",
				Content: content,
				Status:  model.PageStatusPublished,
			}
			h.DB.Create(&page)
		}
	} else if !user.IsRoot {
		user.IsRoot = true
		h.DB.Model(&user).Update("is_root", true)
	}

	token, err := h.generateToken(user.ID.String(), 30*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"token": token,
			"user":  user,
		},
	})
}

func (h *AuthHandler) getGithubCredentials() (clientID, clientSecret string) {
	if h.Cfg != nil {
		clientID = h.Cfg.GithubClientID
		clientSecret = h.Cfg.GithubClientSecret
	}
	if clientID == "" || clientSecret == "" {
		cfg := h.getOrCreateAuthConfig()
		if clientID == "" {
			clientID = cfg.GithubClientID
		}
		if clientSecret == "" {
			clientSecret = cfg.GithubClientSecret
		}
	}
	return strings.TrimSpace(clientID), strings.TrimSpace(clientSecret)
}

func (h *AuthHandler) getDiscordCredentials() (clientID, clientSecret string) {
	if h.Cfg != nil {
		clientID = h.Cfg.DiscordClientID
		clientSecret = h.Cfg.DiscordClientSecret
	}
	if clientID == "" || clientSecret == "" {
		cfg := h.getOrCreateAuthConfig()
		if clientID == "" {
			clientID = cfg.DiscordClientID
		}
		if clientSecret == "" {
			clientSecret = cfg.DiscordClientSecret
		}
	}
	return strings.TrimSpace(clientID), strings.TrimSpace(clientSecret)
}

// GET /v1/auth/:provider/url?redirect_uri=...
func (h *AuthHandler) GetOAuthURL(c *gin.Context) {
	provider := strings.ToLower(c.Param("provider"))
	redirectURI := c.Query("redirect_uri")
	state := c.DefaultQuery("state", uuid.New().String())

	authConfig := h.getOrCreateAuthConfig()

	switch provider {
	case "github":
		if !authConfig.EnableGithubLogin {
			c.JSON(http.StatusForbidden, gin.H{"error": "GitHubログインは無効化されています。"})
			return
		}
		clientID, _ := h.getGithubCredentials()
		if clientID == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "GitHub OAuth の Client ID が設定されていません。管理画面（認証設定）または環境変数 GITHUB_CLIENT_ID を設定してください。",
			})
			return
		}
		authURL := fmt.Sprintf(
			"https://github.com/login/oauth/authorize?client_id=%s&redirect_uri=%s&scope=%s&state=%s",
			url.QueryEscape(clientID),
			url.QueryEscape(redirectURI),
			url.QueryEscape("read:user user:email read:org"),
			url.QueryEscape(state),
		)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"url": authURL,
			},
		})

	case "discord":
		if !authConfig.EnableDiscordLogin {
			c.JSON(http.StatusForbidden, gin.H{"error": "Discordログインは無効化されています。"})
			return
		}
		clientID, _ := h.getDiscordCredentials()
		if clientID == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Discord OAuth の Client ID が設定されていません。管理画面（認証設定）または環境変数 DISCORD_CLIENT_ID を設定してください。",
			})
			return
		}
		authURL := fmt.Sprintf(
			"https://discord.com/api/oauth2/authorize?client_id=%s&redirect_uri=%s&response_type=code&scope=%s&state=%s",
			url.QueryEscape(clientID),
			url.QueryEscape(redirectURI),
			url.QueryEscape("identify email guilds"),
			url.QueryEscape(state),
		)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"url": authURL,
			},
		})

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("未対応のOAuthプロバイダーです: %s", provider)})
	}
}

type oauthCallbackRequest struct {
	Provider    string `json:"provider" binding:"required"`
	Code        string `json:"code" binding:"required"`
	RedirectURI string `json:"redirect_uri"`
}

// POST /v1/auth/oauth/callback
func (h *AuthHandler) OAuthCallback(c *gin.Context) {
	var req oauthCallbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "リクエスト形式が不正です"})
		return
	}

	provider := strings.ToLower(req.Provider)
	authConfig := h.getOrCreateAuthConfig()

	var (
		providerID  string
		email       string
		username    string
		displayName string
		avatarURL   string
		orgs        []string
		guilds      []DiscordGuildInfo
	)

	switch provider {
	case "github":
		if !authConfig.EnableGithubLogin {
			c.JSON(http.StatusForbidden, gin.H{"error": "GitHubログインは無効化されています。"})
			return
		}
		clientID, clientSecret := h.getGithubCredentials()
		if clientID == "" || clientSecret == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "GitHub OAuth の Client ID または Client Secret が設定されていません。管理画面（認証設定）または環境変数を設定してください。",
			})
			return
		}

		pID, em, un, dn, av, ogs, err := h.exchangeGitHubCode(c.Request.Context(), req.Code, req.RedirectURI, clientID, clientSecret)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "GitHub認証に失敗しました: " + err.Error()})
			return
		}
		providerID = pID
		email = em
		username = un
		displayName = dn
		avatarURL = av
		orgs = ogs

	case "discord":
		if !authConfig.EnableDiscordLogin {
			c.JSON(http.StatusForbidden, gin.H{"error": "Discordログインは無効化されています。"})
			return
		}
		clientID, clientSecret := h.getDiscordCredentials()
		if clientID == "" || clientSecret == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Discord OAuth の Client ID または Client Secret が設定されていません。管理画面（認証設定）または環境変数を設定してください。",
			})
			return
		}

		pID, em, un, dn, av, glds, err := h.exchangeDiscordCode(c.Request.Context(), req.Code, req.RedirectURI, clientID, clientSecret)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Discord認証に失敗しました: " + err.Error()})
			return
		}
		providerID = pID
		email = em
		username = un
		displayName = dn
		avatarURL = av
		guilds = glds

	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "未対応のプロバイダーです: " + provider})
		return
	}

	h.completeOAuthLogin(c, provider, providerID, email, username, displayName, avatarURL, orgs, guilds)
}

func (h *AuthHandler) exchangeGitHubCode(ctx context.Context, code, redirectURI, clientID, clientSecret string) (
	providerID, email, username, displayName, avatarURL string,
	orgs []string,
	err error,
) {
	client := &http.Client{Timeout: 10 * time.Second}

	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("code", code)
	if redirectURI != "" {
		form.Set("redirect_uri", redirectURI)
	}

	tokenReq, err := http.NewRequestWithContext(ctx, "POST", "https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", "", "", "", "", nil, err
	}
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenReq.Header.Set("Accept", "application/json")

	tokenResp, err := client.Do(tokenReq)
	if err != nil {
		return "", "", "", "", "", nil, fmt.Errorf("トークン取得通信エラー: %w", err)
	}
	defer tokenResp.Body.Close()

	var tokenData struct {
		AccessToken      string `json:"access_token"`
		TokenType        string `json:"token_type"`
		Scope            string `json:"scope"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil {
		return "", "", "", "", "", nil, fmt.Errorf("トークン解析エラー: %w", err)
	}
	if tokenData.AccessToken == "" {
		errMsg := tokenData.ErrorDescription
		if errMsg == "" {
			errMsg = tokenData.Error
		}
		if errMsg == "" {
			errMsg = "access_token が取得できませんでした"
		}
		return "", "", "", "", "", nil, errors.New(errMsg)
	}

	// ユーザー情報取得
	userReq, _ := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user", nil)
	userReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
	userReq.Header.Set("User-Agent", "Klados-CMS")
	userReq.Header.Set("Accept", "application/vnd.github.v3+json")

	userResp, err := client.Do(userReq)
	if err != nil {
		return "", "", "", "", "", nil, fmt.Errorf("ユーザー情報取得通信エラー: %w", err)
	}
	defer userResp.Body.Close()

	var ghUser struct {
		ID        int64  `json:"id"`
		Login     string `json:"login"`
		Name      string `json:"name"`
		Email     string `json:"email"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.NewDecoder(userResp.Body).Decode(&ghUser); err != nil {
		return "", "", "", "", "", nil, fmt.Errorf("ユーザー情報解析エラー: %w", err)
	}

	providerID = strconv.FormatInt(ghUser.ID, 10)
	username = ghUser.Login
	displayName = ghUser.Name
	if displayName == "" {
		displayName = ghUser.Login
	}
	avatarURL = ghUser.AvatarURL
	email = ghUser.Email

	// メールアドレスが非公開の場合、メール一覧APIからプライマリメールを取得
	if email == "" {
		emailReq, _ := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user/emails", nil)
		emailReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
		emailReq.Header.Set("User-Agent", "Klados-CMS")
		emailReq.Header.Set("Accept", "application/vnd.github.v3+json")

		if emailResp, err := client.Do(emailReq); err == nil {
			defer emailResp.Body.Close()
			var emails []struct {
				Email    string `json:"email"`
				Primary  bool   `json:"primary"`
				Verified bool   `json:"verified"`
			}
			if json.NewDecoder(emailResp.Body).Decode(&emails) == nil {
				for _, em := range emails {
					if em.Primary && em.Verified {
						email = em.Email
						break
					}
				}
				if email == "" && len(emails) > 0 {
					email = emails[0].Email
				}
			}
		}
	}
	if email == "" {
		email = fmt.Sprintf("%s@users.noreply.github.com", ghUser.Login)
	}

	// 所属Organization一覧取得（ルーティングルール照合用）
	orgsReq, _ := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user/orgs", nil)
	orgsReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
	orgsReq.Header.Set("User-Agent", "Klados-CMS")
	orgsReq.Header.Set("Accept", "application/vnd.github.v3+json")

	if orgsResp, err := client.Do(orgsReq); err == nil {
		defer orgsResp.Body.Close()
		var ghOrgs []struct {
			Login string `json:"login"`
		}
		if json.NewDecoder(orgsResp.Body).Decode(&ghOrgs) == nil {
			for _, o := range ghOrgs {
				if o.Login != "" {
					orgs = append(orgs, o.Login)
				}
			}
		}
	}

	return providerID, email, username, displayName, avatarURL, orgs, nil
}

func (h *AuthHandler) exchangeDiscordCode(ctx context.Context, code, redirectURI, clientID, clientSecret string) (
	providerID, email, username, displayName, avatarURL string,
	guilds []DiscordGuildInfo,
	err error,
) {
	client := &http.Client{Timeout: 10 * time.Second}

	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	if redirectURI != "" {
		form.Set("redirect_uri", redirectURI)
	}

	tokenReq, err := http.NewRequestWithContext(ctx, "POST", "https://discord.com/api/oauth2/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", "", "", "", "", nil, err
	}
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenReq.Header.Set("Accept", "application/json")

	tokenResp, err := client.Do(tokenReq)
	if err != nil {
		return "", "", "", "", "", nil, fmt.Errorf("トークン取得通信エラー: %w", err)
	}
	defer tokenResp.Body.Close()

	var tokenData struct {
		AccessToken      string `json:"access_token"`
		TokenType        string `json:"token_type"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.NewDecoder(tokenResp.Body).Decode(&tokenData); err != nil {
		return "", "", "", "", "", nil, fmt.Errorf("トークン解析エラー: %w", err)
	}
	if tokenData.AccessToken == "" {
		errMsg := tokenData.ErrorDescription
		if errMsg == "" {
			errMsg = tokenData.Error
		}
		if errMsg == "" {
			errMsg = "access_token が取得できませんでした"
		}
		return "", "", "", "", "", nil, errors.New(errMsg)
	}

	// ユーザー情報取得
	userReq, _ := http.NewRequestWithContext(ctx, "GET", "https://discord.com/api/users/@me", nil)
	userReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
	userReq.Header.Set("User-Agent", "Klados-CMS")

	userResp, err := client.Do(userReq)
	if err != nil {
		return "", "", "", "", "", nil, fmt.Errorf("ユーザー情報取得通信エラー: %w", err)
	}
	defer userResp.Body.Close()

	var dcUser struct {
		ID         string `json:"id"`
		Username   string `json:"username"`
		GlobalName string `json:"global_name"`
		Email      string `json:"email"`
		Avatar     string `json:"avatar"`
		Verified   bool   `json:"verified"`
	}
	if err := json.NewDecoder(userResp.Body).Decode(&dcUser); err != nil {
		return "", "", "", "", "", nil, fmt.Errorf("ユーザー情報解析エラー: %w", err)
	}

	providerID = dcUser.ID
	username = dcUser.Username
	displayName = dcUser.GlobalName
	if displayName == "" {
		displayName = dcUser.Username
	}
	if dcUser.Avatar != "" {
		avatarURL = fmt.Sprintf("https://cdn.discordapp.com/avatars/%s/%s.png", dcUser.ID, dcUser.Avatar)
	}
	email = dcUser.Email
	if email == "" {
		email = fmt.Sprintf("%s@discord.user", dcUser.ID)
	}

	// 所属Guild一覧取得（ルーティングルール照合用）
	guildsReq, _ := http.NewRequestWithContext(ctx, "GET", "https://discord.com/api/users/@me/guilds", nil)
	guildsReq.Header.Set("Authorization", "Bearer "+tokenData.AccessToken)
	guildsReq.Header.Set("User-Agent", "Klados-CMS")

	if guildsResp, err := client.Do(guildsReq); err == nil {
		defer guildsResp.Body.Close()
		var dcGuilds []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}
		if json.NewDecoder(guildsResp.Body).Decode(&dcGuilds) == nil {
			for _, g := range dcGuilds {
				guilds = append(guilds, DiscordGuildInfo{
					ID:   g.ID,
					Name: g.Name,
				})
			}
		}
	}

	return providerID, email, username, displayName, avatarURL, guilds, nil
}

func (h *AuthHandler) completeOAuthLogin(
	c *gin.Context,
	provider, providerID, email, username, displayName, avatarURL string,
	orgs []string,
	guilds []DiscordGuildInfo,
) {
	authConfig := h.getOrCreateAuthConfig()

	// 1. ドメインホワイトリスト制限チェック (AllowedDomains)
	if authConfig.AllowedDomains != "" {
		emailLower := strings.ToLower(strings.TrimSpace(email))
		emailDomain := ""
		if atIdx := strings.LastIndex(emailLower, "@"); atIdx != -1 {
			emailDomain = emailLower[atIdx:]
		}
		domains := strings.Split(authConfig.AllowedDomains, ",")
		domainAllowed := false
		for _, d := range domains {
			d = strings.TrimSpace(strings.ToLower(d))
			if !strings.HasPrefix(d, "@") {
				d = "@" + d
			}
			if emailDomain == d {
				domainAllowed = true
				break
			}
		}
		if !domainAllowed {
			c.JSON(http.StatusForbidden, gin.H{
				"error": fmt.Sprintf("このメールドメイン（%s）からのログインは許可されていません。", emailDomain),
			})
			return
		}
	}

	// 2. 事前振り分けテスト（ホワイトリスト制限チェック用）
	matchCtx := OAuthMatchContext{
		Provider: provider,
		Orgs:     orgs,
		Guilds:   guilds,
		Email:    email,
	}
	dummyUser := &model.User{Email: email}
	preMatches, _ := h.applyRoutingRulesContext(dummyUser, matchCtx, false)

	if authConfig.RestrictToRules {
		var activeRuleCount int64
		h.DB.Model(&model.AuthRoutingRule{}).Where("enabled = ?", true).Count(&activeRuleCount)
		if activeRuleCount > 0 && len(preMatches) == 0 {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "許可された組織（GitHub/Discord）または承認済みメールドメインのユーザーのみログインできます。",
			})
			return
		}
	}

	// 3. ユーザー検索（OAuthAccount または Email）
	var user model.User
	var oauthAcc model.OAuthAccount
	err := h.DB.Where("provider = ? AND provider_id = ?", provider, providerID).First(&oauthAcc).Error
	if err == nil {
		h.DB.Where("id = ?", oauthAcc.UserID).First(&user)
	} else {
		err = h.DB.Where("email = ?", email).First(&user).Error
		if err == nil {
			newAcc := model.OAuthAccount{
				UserID:     user.ID,
				Provider:   provider,
				ProviderID: providerID,
			}
			h.DB.Create(&newAcc)
		}
	}

	if user.ID == uuid.Nil {
		cleanUsername := strings.ToLower(strings.ReplaceAll(username, " ", "_"))
		cleanUsername = strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
				return r
			}
			return -1
		}, cleanUsername)
		if len(cleanUsername) < 3 {
			cleanUsername = fmt.Sprintf("user_%s", uuid.New().String()[:6])
		}
		var existingUser model.User
		if h.DB.Where("username = ?", cleanUsername).First(&existingUser).Error == nil {
			cleanUsername = fmt.Sprintf("%s_%s", cleanUsername, uuid.New().String()[:4])
		}

		isRoot := h.determineIfRoot(email, cleanUsername)
		user = model.User{
			Email:         email,
			Username:      cleanUsername,
			DisplayName:   displayName,
			AvatarURL:     avatarURL,
			IsRoot:        isRoot,
			EmailVerified: true,
			Plan:          model.PlanFree,
		}
		if err := h.DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "OAuthユーザーの登録に失敗しました: " + err.Error()})
			return
		}

		newAcc := model.OAuthAccount{
			UserID:     user.ID,
			Provider:   provider,
			ProviderID: providerID,
		}
		h.DB.Create(&newAcc)
	} else {
		if !user.IsRoot && h.determineIfRoot(user.Email, user.Username) {
			user.IsRoot = true
			h.DB.Model(&user).Update("is_root", true)
		}
		if !user.EmailVerified {
			user.EmailVerified = true
			h.DB.Model(&user).Update("email_verified", true)
		}
		if avatarURL != "" && user.AvatarURL == "" {
			user.AvatarURL = avatarURL
			h.DB.Model(&user).Update("avatar_url", avatarURL)
		}
		if displayName != "" && user.DisplayName == "" {
			user.DisplayName = displayName
			h.DB.Model(&user).Update("display_name", displayName)
		}
	}

	// 4. 自動振り分けルールの永続実行
	appliedRules, _ := h.applyRoutingRulesContext(&user, matchCtx, true)

	// 5. JWTトークン発行
	token, err := h.generateToken(user.ID.String(), 30*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "トークンの生成に失敗しました"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"token":           token,
			"user":            user,
			"routing_matches": appliedRules,
		},
	})
}

// 後方互換性およびテスト用の直接ログインハンドラー
type oauthLoginRequest struct {
	Provider  string   `json:"provider"`
	Email     string   `json:"email"`
	Name      string   `json:"name"`
	AvatarURL string   `json:"avatar_url"`
	Token     string   `json:"token"`
	Org       string   `json:"org"`
	GuildID   string   `json:"guild_id"`
	GuildName string   `json:"guild_name"`
	Roles     []string `json:"roles"`
}

func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	var req oauthLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "リクエスト形式が不正です"})
		return
	}
	if req.Email == "" {
		req.Email = "google.user@example.com"
	}
	if req.Name == "" {
		req.Name = "Google ユーザー"
	}
	req.Provider = "google"
	h.handleOAuthUser(c, req)
}

func (h *AuthHandler) GitHubLogin(c *gin.Context) {
	var req oauthLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "リクエスト形式が不正です"})
		return
	}
	if req.Email == "" {
		req.Email = "github.user@example.com"
	}
	if req.Name == "" {
		req.Name = "GitHub ユーザー"
	}
	req.Provider = "github"
	h.handleOAuthUser(c, req)
}

func (h *AuthHandler) DiscordLogin(c *gin.Context) {
	var req oauthLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "リクエスト形式が不正です"})
		return
	}
	if req.Email == "" {
		req.Email = "discord.user@example.com"
	}
	if req.Name == "" {
		req.Name = "Discord ユーザー"
	}
	req.Provider = "discord"
	h.handleOAuthUser(c, req)
}

func (h *AuthHandler) handleOAuthUser(c *gin.Context, req oauthLoginRequest) {
	var orgs []string
	if req.Org != "" {
		orgs = []string{req.Org}
	}
	var guilds []DiscordGuildInfo
	if req.GuildID != "" || req.GuildName != "" {
		guilds = []DiscordGuildInfo{{ID: req.GuildID, Name: req.GuildName}}
	}
	h.completeOAuthLogin(c, req.Provider, req.Email, req.Email, strings.Split(req.Email, "@")[0], req.Name, req.AvatarURL, orgs, guilds)
}
