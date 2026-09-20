package router

import (
	"context"
	"fmt"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/klados/api/internal/config"
	"github.com/klados/api/internal/handler"
	"github.com/klados/api/internal/middleware"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"gorm.io/gorm"
	"log"
	"net/http"
	"strings"
)

func New(cfg *config.Config, db *gorm.DB) *gin.Engine {
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	// CORS
	origins := strings.Split(cfg.AllowOrigins, ",")
	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			// 設定されたオリジンを検証
			for _, o := range origins {
				trimmed := strings.TrimSpace(o)
				if trimmed == "*" || trimmed == origin {
					return true
				}
			}
			// ローカルおよびCloudflare Tunnel等のトンネルアクセスを許容
			if strings.HasSuffix(origin, ".trycloudflare.com") ||
				strings.HasSuffix(origin, "klados.app") ||
				strings.Contains(origin, "localhost") ||
				strings.Contains(origin, "127.0.0.1") {
				return true
			}
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// MinIO クライアント
	minioClient, err := minio.New(cfg.MinioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
		Secure: cfg.MinioUseSSL,
	})
	if err != nil {
		log.Fatalf("failed to init minio: %v", err)
	}

	// バケット作成（存在しない場合）および公開読み取りポリシーの設定
	exists, _ := minioClient.BucketExists(context.Background(), cfg.MinioBucket)
	if !exists {
		_ = minioClient.MakeBucket(context.Background(), cfg.MinioBucket, minio.MakeBucketOptions{})
	}
	policy := fmt.Sprintf(`{
		"Version": "2012-10-17",
		"Statement": [
			{
				"Effect": "Allow",
				"Principal": {"AWS": ["*"]},
				"Action": ["s3:GetObject"],
				"Resource": ["arn:aws:s3:::%s/*"]
			}
		]
	}`, cfg.MinioBucket)
	_ = minioClient.SetBucketPolicy(context.Background(), cfg.MinioBucket, policy)

	// ハンドラー
	authH := &handler.AuthHandler{DB: db, JWTSecret: cfg.JWTSecret}
	siteH := &handler.SiteHandler{DB: db, JWTSecret: cfg.JWTSecret}
	memberH := &handler.MemberHandler{DB: db}
	pageH := &handler.PageHandler{DB: db}
	commentH := &handler.CommentHandler{DB: db}
	apiKeyH := &handler.APIKeyHandler{DB: db}
	analyticsH := &handler.AnalyticsHandler{DB: db}
	categoryH := &handler.CategoryHandler{DB: db}
	mediaH := &handler.MediaHandler{
		DB:       db,
		Minio:    minioClient,
		Bucket:   cfg.MinioBucket,
		Endpoint: cfg.MinioEndpoint,
	}

	// WebSocket Hub
	wsHub := handler.NewWSHub()
	go wsHub.Run()
	wsH := handler.NewWSHandler(wsHub)

	api := r.Group("/v1")

	// WebSocket Collaborative Editing
	api.GET("/ws/pages/:id", wsH.HandlePageWS)

	// パブリック閲覧 (Public)
	public := api.Group("/public")
	{
		public.GET("/sites/:slug", siteH.GetBySlug)
		public.POST("/sites/:slug/verify-password", siteH.VerifyPassword)
		public.GET("/sites/:slug/sitemap.xml", siteH.GetSitemap)
		public.GET("/sites/:slug/robots.txt", siteH.GetRobotsTxt)
		public.POST("/sites/:slug/view", analyticsH.RecordView)
		public.POST("/sites/:slug/views", analyticsH.RecordView)
		public.GET("/sites/:slug/categories", categoryH.ListPublic)
		public.GET("/sites/:slug/categories/*name", categoryH.GetPublicCategory)
		public.GET("/sites/:slug/pages", pageH.ListPublicBySlug)
		public.GET("/sites/:slug/pages/*pageSlug", pageH.GetPublicPage)
		public.POST("/sites/:slug/pages/*pageSlug", func(c *gin.Context) {
			rawPageSlug := c.Param("pageSlug")
			if strings.HasSuffix(rawPageSlug, "/comments") || rawPageSlug == "/comments" || rawPageSlug == "comments" {
				commentH.CreatePublic(c)
				return
			}
			c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
		})
		public.GET("/media/:id", mediaH.ServeByID)
		public.GET("/media/:id/content", mediaH.ServeByID)
		public.GET("/media/file/*key", mediaH.ServeFile)
	}

	// Direct media access by ID
	api.GET("/media/:id", mediaH.ServeByID)
	api.GET("/media/:id/content", mediaH.ServeByID)

	// 認証 (Public)
	auth := api.Group("/auth")
	{
		auth.POST("/register", authH.Register)
		auth.POST("/login", authH.Login)
		auth.POST("/demo-login", authH.DemoLogin)
		auth.POST("/google", authH.GoogleLogin)
		auth.POST("/github", authH.GitHubLogin)
		auth.POST("/discord", authH.DiscordLogin)
		auth.GET("/config", authH.GetAuthConfig)
		auth.POST("/verify-email", authH.VerifyEmail)
		auth.POST("/resend-verification", authH.ResendVerification)
	}

	// 認証必須
	protected := api.Group("")
	protected.Use(middleware.Auth(cfg.JWTSecret, db))
	{
		protected.GET("/auth/me", authH.Me)
		protected.PATCH("/auth/profile", authH.UpdateProfile)
		protected.PATCH("/auth/password", authH.ChangePassword)
		protected.POST("/auth/avatar", mediaH.UploadAvatar)
		protected.PUT("/auth/config", authH.UpdateAuthConfig)
		protected.POST("/auth/quick-verify", authH.QuickVerify)
		protected.GET("/auth/routing-rules", authH.ListRoutingRules)
		protected.POST("/auth/routing-rules", authH.CreateRoutingRule)
		protected.PUT("/auth/routing-rules/:id", authH.UpdateRoutingRule)
		protected.DELETE("/auth/routing-rules/:id", authH.DeleteRoutingRule)
		protected.POST("/auth/routing-rules/test", authH.TestRoutingRule)

		// Sites
		protected.GET("/sites", siteH.List)
		protected.POST("/sites", siteH.Create)
		protected.GET("/sites/:id", siteH.Get)
		protected.PATCH("/sites/:id", siteH.Update)
		protected.DELETE("/sites/:id", siteH.Delete)
		protected.PATCH("/sites/:id/custom-domain", siteH.UpdateCustomDomain)
		protected.POST("/sites/:id/verify-domain", siteH.VerifyDomain)
		protected.GET("/sites/:id/analytics", analyticsH.GetAnalytics)
		protected.GET("/sites/:id/search", pageH.Search)
		protected.GET("/sites/:id/trash", pageH.ListTrash)
		protected.GET("/sites/:id/export", siteH.Export)
		protected.POST("/sites/:id/password", siteH.SetPassword)
		protected.GET("/sites/:id/categories", categoryH.ListForSite)

		// Site Members
		protected.GET("/sites/:id/members", memberH.List)
		protected.POST("/sites/:id/members", memberH.Add)
		protected.PATCH("/sites/:id/members/:memberId", memberH.Update)
		protected.DELETE("/sites/:id/members/:memberId", memberH.Remove)

		// Pages
		protected.GET("/sites/:id/pages", pageH.List)
		protected.POST("/sites/:id/pages", pageH.Create)
		protected.GET("/pages/:id", pageH.Get)
		protected.PATCH("/pages/:id", pageH.Update)
		protected.DELETE("/pages/:id", pageH.Delete)
		protected.GET("/pages/:id/versions", pageH.GetVersions)
		protected.POST("/pages/:id/revert/:ver", pageH.Revert)
		protected.POST("/pages/:id/restore", pageH.Restore)
		protected.GET("/pages/:id/comments", commentH.List)
		protected.POST("/pages/:id/comments", commentH.Create)

		// Comments
		protected.DELETE("/comments/:id", commentH.Delete)

		// API Keys
		protected.GET("/api-keys", apiKeyH.List)
		protected.POST("/api-keys", apiKeyH.Create)
		protected.DELETE("/api-keys/:id", apiKeyH.Delete)

		// Media
		protected.POST("/media/upload", mediaH.Upload)
		protected.GET("/media", mediaH.List)
		protected.DELETE("/media/:id", mediaH.Delete)
	}

	// ヘルスチェック
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	return r
}
