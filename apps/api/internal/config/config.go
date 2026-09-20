package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DatabaseURL string
	RedisURL    string
	JWTSecret   string
	MinioEndpoint   string
	MinioAccessKey  string
	MinioSecretKey  string
	MinioBucket     string
	MinioUseSSL     bool
	AllowOrigins    string
	Environment     string
	GithubClientID     string
	GithubClientSecret string
	DiscordClientID    string
	DiscordClientSecret string
}

func Load() *Config {
	loaded := false
	for _, envFile := range []string{"apps/api/.env", ".env"} {
		if err := godotenv.Load(envFile); err == nil {
			loaded = true
			break
		}
	}
	if !loaded {
		log.Println("No .env file found, using environment variables")
	}

	return &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "host=localhost user=klados password=klados dbname=klados port=5432 sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:      getEnv("JWT_SECRET", "change-me-in-production"),
		MinioEndpoint:  getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinioAccessKey: getEnvAny([]string{"MINIO_ACCESS_KEY", "MINIO_ROOT_USER"}, "minioadmin"),
		MinioSecretKey: getEnvAny([]string{"MINIO_SECRET_KEY", "MINIO_ROOT_PASSWORD"}, "minioadmin"),
		MinioBucket:    getEnv("MINIO_BUCKET", "klados-media"),
		MinioUseSSL:    getEnv("MINIO_USE_SSL", "false") == "true",
		AllowOrigins:   getEnv("ALLOW_ORIGINS", "http://localhost:3000"),
		Environment:    getEnv("ENVIRONMENT", "development"),
		GithubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GithubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),
		DiscordClientID:    getEnv("DISCORD_CLIENT_ID", ""),
		DiscordClientSecret: getEnv("DISCORD_CLIENT_SECRET", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvAny(keys []string, fallback string) string {
	for _, k := range keys {
		if v := os.Getenv(k); v != "" {
			return v
		}
	}
	return fallback
}