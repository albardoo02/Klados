package router

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/klados/api/internal/config"
	"github.com/klados/api/internal/handler"
	"github.com/klados/api/internal/middleware"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"gorm.io/gorm"
	"log"
	"strings"
	"context"
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
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
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

	// バケット作成（存在しない場合）
	exists, _ := minioClient.BucketExists(context.Background(), cfg.MinioBucket)
	if !exists {
		minioClient.MakeBucket(context.Background(), cfg.MinioBucket, minio.MakeBucketOptions{})
	}

	// ハンドラー
	authH := &handler.AuthHandler{DB: db, JWTSecret: cfg.JWTSecret}
	siteH := &handler.SiteHandler{DB: db}
	pageH := &handler.PageHandler{DB: db}
	analyticsH := &handler.AnalyticsHandler{DB: db}
	mediaH := &handler.MediaHandler{
		DB:       db,
		Minio:    minioClient,
		Bucket:   cfg.MinioBucket,
		Endpoint: cfg.MinioEndpoint,
	}

	api := r.Group("/v1")

	// パブリック閲覧 (Public)
	public := api.Group("/public")
	{
		public.GET("/sites/:slug", siteH.GetBySlug)
		public.GET("/sites/:slug/sitemap.xml", siteH.GetSitemap)
		public.GET("/sites/:slug/robots.txt", siteH.GetRobotsTxt)
		public.POST("/sites/:slug/view", analyticsH.RecordView)
		public.POST("/sites/:slug/views", analyticsH.RecordView)
		public.GET("/sites/:slug/pages", pageH.ListPublicBySlug)
		public.GET("/sites/:slug/pages/*pageSlug", pageH.GetPublicPage)
	}

	// 認証 (Public)
	auth := api.Group("/auth")
	{
		auth.POST("/register", authH.Register)
		auth.POST("/login", authH.Login)
	}

	// 認証必須
	protected := api.Group("")
	protected.Use(middleware.Auth(cfg.JWTSecret))
	{
		protected.GET("/auth/me", authH.Me)

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

		// Pages
		protected.GET("/sites/:id/pages", pageH.List)
		protected.POST("/sites/:id/pages", pageH.Create)
		protected.GET("/pages/:id", pageH.Get)
		protected.PATCH("/pages/:id", pageH.Update)
		protected.DELETE("/pages/:id", pageH.Delete)
		protected.GET("/pages/:id/versions", pageH.GetVersions)
		protected.POST("/pages/:id/revert/:ver", pageH.Revert)

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