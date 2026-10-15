package router

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/klados/api/internal/config"
	"github.com/klados/api/internal/handler"
	"github.com/klados/api/internal/middleware"
	"github.com/klados/api/internal/storage"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"gorm.io/gorm"
)

func New(cfg *config.Config, db *gorm.DB) *gin.Engine {
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	// Security Headers & Request Body Size Limit (2MB max for standard JSON requests)
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.MaxBodySize(2 * 1024 * 1024))

	// Global General Rate Limiting (180 requests/min, burst 40 per IP)
	r.Use(middleware.RateLimit(180, 40))

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
			// ローカルおよび正規ドメイン、Cloudflare Tunnel等のアクセスを安全に検証
			lower := strings.ToLower(origin)
			if lower == "https://klados.app" || strings.HasSuffix(lower, ".klados.app") ||
				lower == "https://klados.azisaba.net" || strings.HasSuffix(lower, ".klados.azisaba.net") ||
				lower == "https://cms.azisaba.net" || strings.HasSuffix(lower, ".cms.azisaba.net") ||
				strings.HasSuffix(lower, ".trycloudflare.com") ||
				strings.HasPrefix(lower, "http://localhost:") || lower == "http://localhost" ||
				strings.HasPrefix(lower, "http://127.0.0.1:") || lower == "http://127.0.0.1" {
				return true
			}
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept", "X-Requested-With", "X-API-Key"},
		ExposeHeaders:    []string{"Content-Length", "Retry-After"},
		AllowCredentials: true,
	}))

	// ストレージの初期化 (Local Filesystem または S3/MinIO)
	fallbackDirs := []string{
		"/data/minio_data/klados-media",
		"/data/minio_data",
		"./data/minio_data/klados-media",
		"./data/media",
	}
	localStorage := storage.NewLocalStorage(cfg.StorageDir, fallbackDirs)

	var storageDriver storage.Storage = localStorage
	var minioClient *minio.Client

	if cfg.StorageDriver == "s3" || cfg.StorageDriver == "minio" {
		mClient, err := minio.New(cfg.MinioEndpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
			Secure: cfg.MinioUseSSL,
		})
		if err != nil {
			log.Printf("[Storage] Warning: failed to init minio client: %v. Falling back to local storage.", err)
		} else {
			minioClient = mClient
			storageDriver = storage.NewS3Storage(minioClient, cfg.MinioBucket, localStorage)
			log.Printf("[Storage] S3/MinIO storage configured for endpoint %s, bucket %s (with local fallback)", cfg.MinioEndpoint, cfg.MinioBucket)

			// バケット作成（存在しない場合）および公開読み取りポリシーの設定（MinIO起動待ちリトライ付き）
			go func() {
				for i := 0; i < 15; i++ {
					if i > 0 {
						time.Sleep(2 * time.Second)
					}
					exists, bErr := minioClient.BucketExists(context.Background(), cfg.MinioBucket)
					if bErr == nil {
						if !exists {
							if err := minioClient.MakeBucket(context.Background(), cfg.MinioBucket, minio.MakeBucketOptions{}); err == nil {
								log.Printf("[MinIO] Bucket %s created successfully", cfg.MinioBucket)
							}
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
						return
					}
				}
			}()
		}
	} else {
		log.Printf("[Storage] Built-in local filesystem storage enabled at %s", cfg.StorageDir)
	}

	// ハンドラー
	authH := &handler.AuthHandler{DB: db, JWTSecret: cfg.JWTSecret, Cfg: cfg}
	siteH := &handler.SiteHandler{DB: db, JWTSecret: cfg.JWTSecret}
	memberH := &handler.MemberHandler{DB: db}
	pageH := &handler.PageHandler{DB: db}
	commentH := &handler.CommentHandler{DB: db}
	apiKeyH := &handler.APIKeyHandler{DB: db}
	analyticsH := &handler.AnalyticsHandler{DB: db}
	categoryH := &handler.CategoryHandler{DB: db}
	mediaH := &handler.MediaHandler{
		DB:       db,
		Storage:  storageDriver,
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

	// Strict Rate Limiter for authentication & password attempts (25 requests/min, burst 10 per IP)
	authLimiter := middleware.RateLimit(25, 10)

	// パブリック閲覧 (Public)
	public := api.Group("/public")
	{
		public.GET("/sites/:slug", siteH.GetBySlug)
		public.POST("/sites/:slug/verify-password", authLimiter, siteH.VerifyPassword)
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
	api.GET("/media/file/*key", mediaH.ServeFile)

	// Public comments list & creation (with optional auth) & page versions
	api.GET("/pages/:id/comments", commentH.List)
	api.POST("/pages/:id/comments", middleware.OptionalAuth(cfg.JWTSecret, db), commentH.Create)
	api.GET("/pages/:id/versions", pageH.GetVersions)

	// 認証 (Public with strict brute-force rate limit)
	auth := api.Group("/auth")
	auth.Use(authLimiter)
	{
		auth.POST("/register", authH.Register)
		auth.POST("/login", authH.Login)
		auth.POST("/demo-login", authH.DemoLogin)
		auth.POST("/google", authH.GoogleLogin)
		auth.POST("/github", authH.GitHubLogin)
		auth.POST("/discord", authH.DiscordLogin)
		auth.POST("/azisaba", authH.AzisabaAuth)
		auth.GET("/:provider/url", authH.GetOAuthURL)
		auth.POST("/oauth/callback", authH.OAuthCallback)
		auth.POST("/oauth/relay-exchange", authH.RelayExchange)
		auth.GET("/config", authH.GetAuthConfig)
		auth.POST("/verify-email", authH.VerifyEmail)
		auth.POST("/resend-verification", authH.ResendVerification)
	}

	// システム設定 (Public)
	system := api.Group("/system")
	{
		system.GET("/domains", authH.GetSystemDomains)
	}

	// 認証必須
	protected := api.Group("")
	protected.Use(middleware.Auth(cfg.JWTSecret, db))
	{
		protected.GET("/auth/me", authH.Me)
		protected.PATCH("/auth/profile", authH.UpdateProfile)
		protected.PATCH("/auth/password", authLimiter, authH.ChangePassword)
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
		protected.POST("/sites/:id/azisaba-test", siteH.TestAzisabaPlayer)
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
		protected.POST("/pages/:id/revert/:ver", pageH.Revert)
		protected.POST("/pages/:id/restore", pageH.Restore)

		// Comments
		protected.DELETE("/comments/:id", commentH.Delete)
		protected.DELETE("/pages/:id/comments/:commentId", func(c *gin.Context) {
			c.Params = gin.Params{{Key: "id", Value: c.Param("commentId")}}
			commentH.Delete(c)
		})

		// API Keys
		protected.GET("/api-keys", apiKeyH.List)
		protected.POST("/api-keys", apiKeyH.Create)
		protected.DELETE("/api-keys/:id", apiKeyH.Delete)

		// Media
		protected.POST("/media/upload", mediaH.Upload)
		protected.GET("/media", mediaH.List)
		protected.DELETE("/media/:id", mediaH.Delete)
		protected.GET("/media/export", mediaH.Export)
		protected.POST("/media/import", mediaH.Import)
		protected.GET("/sites/:id/media/export", mediaH.Export)
		protected.POST("/sites/:id/media/import", mediaH.Import)
	}

	// ヘルスチェック
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	return r
}
