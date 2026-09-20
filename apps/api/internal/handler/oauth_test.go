package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/klados/api/internal/config"
	"github.com/klados/api/internal/handler"
)

func TestOAuthURLGeneration(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Case 1: Client ID 未設定時は分かりやすい 400 エラーを返すこと
	{
		cfg := &config.Config{
			GithubClientID:  "",
			DiscordClientID: "",
		}
		authH := &handler.AuthHandler{
			JWTSecret: "test-secret",
			Cfg:       cfg,
		}

		r := gin.New()
		r.GET("/v1/auth/:provider/url", authH.GetOAuthURL)

		// GitHub test
		req, _ := http.NewRequest("GET", "/v1/auth/github/url?redirect_uri=http://localhost:3000/auth/callback", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request when GitHub client ID is missing, got %d", rec.Code)
		}

		var res map[string]interface{}
		json.NewDecoder(rec.Body).Decode(&res)
		if !strings.Contains(res["error"].(string), "GitHub OAuth の Client ID") {
			t.Errorf("expected error message mentioning missing Client ID, got: %v", res["error"])
		}

		// Discord test
		reqDc, _ := http.NewRequest("GET", "/v1/auth/discord/url?redirect_uri=http://localhost:3000/auth/callback", nil)
		recDc := httptest.NewRecorder()
		r.ServeHTTP(recDc, reqDc)

		if recDc.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request when Discord client ID is missing, got %d", recDc.Code)
		}
	}

	// Case 2: Client ID 設定時はスコープ・コールバック・ステートを含む認可URLを返すこと
	{
		cfg := &config.Config{
			GithubClientID:  "test-github-client-id",
			DiscordClientID: "test-discord-client-id",
		}
		authH := &handler.AuthHandler{
			JWTSecret: "test-secret",
			Cfg:       cfg,
		}

		r := gin.New()
		r.GET("/v1/auth/:provider/url", authH.GetOAuthURL)

		// GitHub URL test
		req, _ := http.NewRequest("GET", "/v1/auth/github/url?redirect_uri=https://cms.azisaba.net/auth/callback", nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}

		var res map[string]interface{}
		json.NewDecoder(rec.Body).Decode(&res)
		data := res["data"].(map[string]interface{})
		authURL := data["url"].(string)

		if !strings.HasPrefix(authURL, "https://github.com/login/oauth/authorize") {
			t.Errorf("expected GitHub authorize URL, got: %s", authURL)
		}
		if !strings.Contains(authURL, "client_id=test-github-client-id") {
			t.Errorf("expected client_id in URL, got: %s", authURL)
		}
		if !strings.Contains(authURL, "read%3Auser") || !strings.Contains(authURL, "read%3Aorg") {
			t.Errorf("expected read:user and read:org in scope, got: %s", authURL)
		}

		// Discord URL test
		reqDc, _ := http.NewRequest("GET", "/v1/auth/discord/url?redirect_uri=https://cms.azisaba.net/auth/callback", nil)
		recDc := httptest.NewRecorder()
		r.ServeHTTP(recDc, reqDc)

		if recDc.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for Discord, got %d: %s", recDc.Code, recDc.Body.String())
		}

		var resDc map[string]interface{}
		json.NewDecoder(recDc.Body).Decode(&resDc)
		dataDc := resDc["data"].(map[string]interface{})
		authURLDc := dataDc["url"].(string)

		if !strings.HasPrefix(authURLDc, "https://discord.com/api/oauth2/authorize") {
			t.Errorf("expected Discord authorize URL, got: %s", authURLDc)
		}
		if !strings.Contains(authURLDc, "client_id=test-discord-client-id") {
			t.Errorf("expected client_id in URL, got: %s", authURLDc)
		}
		if !strings.Contains(authURLDc, "guilds") {
			t.Errorf("expected guilds scope in Discord URL, got: %s", authURLDc)
		}
	}
}
