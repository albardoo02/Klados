package handler

import (
	"net/http"
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
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
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

	token, err := h.generateToken(user.ID.String())
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

	token, err := h.generateToken(user.ID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"token": token, "user": user}})
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

func (h *AuthHandler) generateToken(userID string) (string, error) {
	claims := jwt.MapClaims{
		"sub": userID,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
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

// compile-time check
var _ = uuid.New