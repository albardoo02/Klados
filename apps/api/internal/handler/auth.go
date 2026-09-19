package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthHandler struct {
	DB        *gorm.DB
	JWTSecret string
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

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	pass := string(hashed)
	verificationToken := uuid.New().String()
	verificationExpires := time.Now().Add(24 * time.Hour)
	user := &model.User{
		Email:                 req.Email,
		Username:              req.Username,
		Password:              &pass,
		DisplayName:           req.DisplayName,
		EmailVerified:         false,
		VerificationToken:     &verificationToken,
		VerificationExpiresAt: &verificationExpires,
	}

	if err := h.DB.Create(user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email or username already exists"})
		return
	}

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
			"success": true,
			"message": "このメールアドレスは既に認証済みです",
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

type oauthLoginRequest struct {
	Provider  string `json:"provider"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	Token     string `json:"token"`
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
	if req.Provider == "" {
		req.Provider = "google"
	}

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

func (h *AuthHandler) handleOAuthUser(c *gin.Context, req oauthLoginRequest) {
	var user model.User
	err := h.DB.Where("email = ?", req.Email).First(&user).Error
	if err != nil {
		// ユーザー新規作成
		username := strings.Split(req.Email, "@")[0]
		var existingUser model.User
		if h.DB.Where("username = ?", username).First(&existingUser).Error == nil {
			username = fmt.Sprintf("%s_%s", username, uuid.New().String()[:5])
		}

		user = model.User{
			Email:         req.Email,
			Username:      username,
			DisplayName:   req.Name,
			AvatarURL:     req.AvatarURL,
			EmailVerified: true, // Google / OAuthプロバイダー認証済み
			Plan:          model.PlanFree,
		}
		if err := h.DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "OAuthユーザーの登録に失敗しました"})
			return
		}

		oauthAcc := model.OAuthAccount{
			UserID:     user.ID,
			Provider:   req.Provider,
			ProviderID: req.Email,
		}
		h.DB.Create(&oauthAcc)
	} else {
		// 既存ユーザー: OAuthログインによりメール認証済みフラグをtrueに更新
		if !user.EmailVerified {
			user.EmailVerified = true
			h.DB.Model(&user).Update("email_verified", true)
		}
		if req.AvatarURL != "" && user.AvatarURL == "" {
			user.AvatarURL = req.AvatarURL
			h.DB.Model(&user).Update("avatar_url", req.AvatarURL)
		}

		var oauthAcc model.OAuthAccount
		if h.DB.Where("user_id = ? AND provider = ?", user.ID, req.Provider).First(&oauthAcc).Error != nil {
			oauthAcc = model.OAuthAccount{
				UserID:     user.ID,
				Provider:   req.Provider,
				ProviderID: req.Email,
			}
			h.DB.Create(&oauthAcc)
		}
	}

	token, err := h.generateToken(user.ID.String(), 30*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "トークンの生成に失敗しました"})
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