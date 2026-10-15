package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
)

const DefaultAzisabaAPIBaseURL = "https://api-ktor.azisaba.net"

type AzisabaPlayerProfile struct {
	UUID    string                            `json:"uuid"`
	Name    string                            `json:"name"`
	Groups  []string                          `json:"groups"`
	Servers map[string]map[string]interface{} `json:"servers"`
}

type AzisabaPunishment struct {
	ID     int64  `json:"id"`
	Type   string `json:"type"`
	Reason string `json:"reason"`
	Server string `json:"server"`
	Active bool   `json:"active"`
}

type AzisabaEditorPolicy struct {
	Enabled                   bool     `json:"enabled"`
	AllowAnyRegisteredUser    bool     `json:"allow_any_registered_user"`
	ApiBaseURL                string   `json:"api_base_url"`
	ServerApiKey              string   `json:"server_api_key,omitempty"`
	TargetRole                string   `json:"target_role"`
	ConditionLogic            string   `json:"condition_logic"` // "AND" (デフォルト) または "OR"
	MinLifePlayTimeMinutes    int64    `json:"min_life_play_time_minutes"`
	MinLifeRank               int      `json:"min_life_rank"`
	MinLifeBalance            float64  `json:"min_life_balance"`
	RequiredGroups            []string `json:"required_groups"`
	RequiredServerRoles       []string `json:"required_server_roles"`
	RequireNoActivePunishment bool     `json:"require_no_active_punishment"`
}

type AzisabaEvaluationResult struct {
	SiteID                 uuid.UUID              `json:"site_id"`
	SiteSlug               string                 `json:"site_slug"`
	SiteTitle              string                 `json:"site_title"`
	Approved               bool                   `json:"approved"`
	GrantedRole            string                 `json:"granted_role,omitempty"`
	Reasons                []string               `json:"reasons"`
	FailedReasons          []string               `json:"failed_reasons,omitempty"`
	PlayerStats            map[string]interface{} `json:"player_stats,omitempty"`
}

func ExtractSiteAzisabaPolicy(site *model.Site) AzisabaEditorPolicy {
	policy := AzisabaEditorPolicy{
		Enabled:        false,
		ApiBaseURL:     DefaultAzisabaAPIBaseURL,
		TargetRole:     string(model.RoleEditor),
		ConditionLogic: "AND",
	}
	if envURL := strings.TrimSpace(os.Getenv("AZISABA_API_URL")); envURL != "" {
		policy.ApiBaseURL = strings.TrimRight(envURL, "/")
	}
	if envKey := strings.TrimSpace(os.Getenv("AZISABA_API_KEY")); envKey != "" {
		policy.ServerApiKey = envKey
	}
	if site == nil || len(site.Settings) == 0 {
		return policy
	}

	var settingsMap map[string]interface{}
	if err := json.Unmarshal(site.Settings, &settingsMap); err != nil {
		return policy
	}

	rawPolicy, ok := settingsMap["azisaba_editor_policy"]
	if !ok || rawPolicy == nil {
		return policy
	}

	if b, err := json.Marshal(rawPolicy); err == nil {
		_ = json.Unmarshal(b, &policy)
	}
	if strings.TrimSpace(policy.ApiBaseURL) == "" {
		policy.ApiBaseURL = DefaultAzisabaAPIBaseURL
	}
	policy.ApiBaseURL = strings.TrimRight(strings.TrimSpace(policy.ApiBaseURL), "/")
	if policy.TargetRole == "" {
		policy.TargetRole = string(model.RoleEditor)
	}
	if strings.TrimSpace(policy.ConditionLogic) == "" {
		policy.ConditionLogic = "AND"
	}
	return policy
}

func toInt64(v interface{}) int64 {
	switch val := v.(type) {
	case float64:
		return int64(val)
	case float32:
		return int64(val)
	case int:
		return int64(val)
	case int64:
		return val
	case json.Number:
		i, _ := val.Int64()
		return i
	default:
		return 0
	}
}

func toFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case json.Number:
		f, _ := val.Float64()
		return f
	default:
		return 0
	}
}

func toBool(v interface{}) bool {
	if b, ok := v.(bool); ok {
		return b
	}
	return false
}

// EvaluateAzisabaPolicy checks whether a player profile satisfies a site's AzisabaEditorPolicy.
func EvaluateAzisabaPolicy(site *model.Site, policy AzisabaEditorPolicy, profile *AzisabaPlayerProfile, punishments []AzisabaPunishment) AzisabaEvaluationResult {
	res := AzisabaEvaluationResult{
		Approved:      false,
		Reasons:       make([]string, 0),
		FailedReasons: make([]string, 0),
		PlayerStats:   make(map[string]interface{}),
	}
	if site != nil {
		res.SiteID = site.ID
		res.SiteSlug = site.Slug
		res.SiteTitle = site.Title
	}

	if !policy.Enabled {
		res.FailedReasons = append(res.FailedReasons, "このサイトでは外部共同編集者の自動承認が無効になっています")
		return res
	}

	if policy.AllowAnyRegisteredUser && profile == nil {
		res.Approved = true
		res.GrantedRole = policy.TargetRole
		res.Reasons = append(res.Reasons, "オープン共同編集モードにより自動承認されました")
		return res
	}

	if profile == nil {
		res.FailedReasons = append(res.FailedReasons, "アジ鯖プレイヤー情報が取得できませんでした")
		return res
	}

	var lifePlayTime int64
	var lifeRank int
	var lifeBalance float64

	if lifeData, ok := profile.Servers["life"]; ok && lifeData != nil {
		lifePlayTime = toInt64(lifeData["total_play_time"])
		lifeRank = int(toInt64(lifeData["rank"]))
		lifeBalance = toFloat64(lifeData["balance"])
	}

	res.PlayerStats["uuid"] = profile.UUID
	res.PlayerStats["name"] = profile.Name
	res.PlayerStats["groups"] = profile.Groups
	res.PlayerStats["life_play_time_minutes"] = lifePlayTime
	res.PlayerStats["life_rank"] = lifeRank
	res.PlayerStats["life_balance"] = lifeBalance

	// 1. Minimum Life play time (minutes)
	if policy.MinLifePlayTimeMinutes > 0 {
		if lifePlayTime >= policy.MinLifePlayTimeMinutes {
			res.Reasons = append(res.Reasons, fmt.Sprintf("Lifeプレイ時間条件クリア (%d分 >= %d分)", lifePlayTime, policy.MinLifePlayTimeMinutes))
		} else {
			res.FailedReasons = append(res.FailedReasons, fmt.Sprintf("Lifeプレイ時間が不足しています (現在: %d分 / 必要: %d分以上)", lifePlayTime, policy.MinLifePlayTimeMinutes))
		}
	}

	// 2. Minimum Life rank
	if policy.MinLifeRank > 0 {
		if lifeRank >= policy.MinLifeRank {
			res.Reasons = append(res.Reasons, fmt.Sprintf("Lifeランク条件クリア (Rank %d >= %d)", lifeRank, policy.MinLifeRank))
		} else {
			res.FailedReasons = append(res.FailedReasons, fmt.Sprintf("Lifeランクが不足しています (現在: Rank %d / 必要: Rank %d以上)", lifeRank, policy.MinLifeRank))
		}
	}

	// 3. Minimum Life balance
	if policy.MinLifeBalance > 0 {
		if lifeBalance >= policy.MinLifeBalance {
			res.Reasons = append(res.Reasons, fmt.Sprintf("Life所持金条件クリア (%.0f >= %.0f)", lifeBalance, policy.MinLifeBalance))
		} else {
			res.FailedReasons = append(res.FailedReasons, fmt.Sprintf("Life所持金が不足しています (現在: %.0f / 必要: %.0f以上)", lifeBalance, policy.MinLifeBalance))
		}
	}

	// 4. Required Global Groups (at least one match if specified)
	cleanGroups := make([]string, 0)
	for _, g := range policy.RequiredGroups {
		if trimmed := strings.TrimSpace(g); trimmed != "" {
			cleanGroups = append(cleanGroups, trimmed)
		}
	}
	if len(cleanGroups) > 0 {
		matchedGroup := ""
		for _, reqG := range cleanGroups {
			for _, playerG := range profile.Groups {
				if strings.EqualFold(reqG, playerG) {
					matchedGroup = playerG
					break
				}
			}
			if matchedGroup != "" {
				break
			}
		}
		if matchedGroup != "" {
			res.Reasons = append(res.Reasons, fmt.Sprintf("グループ条件クリア (%s)", matchedGroup))
		} else {
			res.FailedReasons = append(res.FailedReasons, fmt.Sprintf("必要なグループ権限がありません (必要: %s のいずれか)", strings.Join(cleanGroups, ", ")))
		}
	}

	// 5. Required Server Roles (e.g. "any:moderator", "any:builder", "life:builder", "lgw:vip")
	cleanRoles := make([]string, 0)
	for _, r := range policy.RequiredServerRoles {
		if trimmed := strings.TrimSpace(r); trimmed != "" {
			cleanRoles = append(cleanRoles, trimmed)
		}
	}
	if len(cleanRoles) > 0 {
		matchedRole := ""
		for _, spec := range cleanRoles {
			parts := strings.SplitN(strings.ToLower(spec), ":", 2)
			targetSrv := "any"
			targetRoleKey := parts[0]
			if len(parts) == 2 {
				targetSrv = parts[0]
				targetRoleKey = parts[1]
			}
			for srvName, srvData := range profile.Servers {
				if targetSrv != "any" && targetSrv != "*" && !strings.EqualFold(targetSrv, srvName) {
					continue
				}
				if toBool(srvData[targetRoleKey]) {
					matchedRole = fmt.Sprintf("%s:%s", srvName, targetRoleKey)
					break
				}
			}
			if matchedRole != "" {
				break
			}
		}
		if matchedRole != "" {
			res.Reasons = append(res.Reasons, fmt.Sprintf("サーバー役職条件クリア (%s)", matchedRole))
		} else {
			res.FailedReasons = append(res.FailedReasons, fmt.Sprintf("必要なサーバー役職がありません (必要: %s のいずれか)", strings.Join(cleanRoles, ", ")))
		}
	}

	// 6. Active Punishment check
	hasActivePunishment := false
	if policy.RequireNoActivePunishment && punishments != nil {
		activeCount := 0
		for _, p := range punishments {
			if p.Active {
				activeCount++
			}
		}
		if activeCount == 0 {
			res.Reasons = append(res.Reasons, "有効な処罰(BAN/Mute等)なし")
		} else {
			hasActivePunishment = true
			res.FailedReasons = append(res.FailedReasons, fmt.Sprintf("現在有効な処罰が %d 件あるため承認できません", activeCount))
		}
	}

	isOrLogic := strings.EqualFold(strings.TrimSpace(policy.ConditionLogic), "OR")

	if hasActivePunishment {
		// 有効な処罰がある場合は AND/OR 問わず承認不可
		res.Approved = false
	} else if isOrLogic {
		// OR 条件: 設定された条件のうち、いずれか1つでもクリアしていれば承認
		hasSatisfiedCondition := false
		for _, r := range res.Reasons {
			if strings.Contains(r, "条件クリア") {
				hasSatisfiedCondition = true
				break
			}
		}
		if hasSatisfiedCondition {
			res.Approved = true
			res.GrantedRole = policy.TargetRole
		} else {
			res.Approved = false
		}
	} else {
		// AND 条件: すべての条件を満たすこと (FailedReasons が空であること)
		if len(res.FailedReasons) == 0 {
			res.Approved = true
			res.GrantedRole = policy.TargetRole
			if len(res.Reasons) == 0 {
				res.Reasons = append(res.Reasons, "アジ鯖プレイヤー認証クリア")
			}
		}
	}

	return res
}

func fetchAzisabaJSON(endpoint, apiKey string, target interface{}) (int, error) {
	client := &http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return 0, err
	}
	if strings.TrimSpace(apiKey) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, err
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errResp struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(body, &errResp)
		if errResp.Error != "" {
			return resp.StatusCode, fmt.Errorf("%s (HTTP %d)", errResp.Error, resp.StatusCode)
		}
		return resp.StatusCode, fmt.Errorf("Azisaba API returned HTTP %d", resp.StatusCode)
	}

	if err := json.Unmarshal(body, target); err != nil {
		return resp.StatusCode, err
	}
	return resp.StatusCode, nil
}

// POST /v1/auth/azisaba
// Authenticates a player via Azisaba API (/players/me) or evaluates auto-approval for a site.
func (h *AuthHandler) AzisabaAuth(c *gin.Context) {
	var req struct {
		APIKey     string `json:"api_key"`
		PlayerName string `json:"player_name"`
		SiteID     string `json:"site_id"`
		SiteSlug   string `json:"site_slug"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "リクエスト形式が正しくありません"})
		return
	}

	// Check if user is already logged in via Klados JWT
	var currentUser *model.User
	authHeader := c.GetHeader("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		rawToken := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if rawToken != "" {
			tok, err := jwt.Parse(rawToken, func(t *jwt.Token) (interface{}, error) {
				return []byte(h.JWTSecret), nil
			})
			if err == nil && tok.Valid {
				if claims, ok := tok.Claims.(jwt.MapClaims); ok {
					if sub, ok := claims["sub"].(string); ok {
						var u model.User
						if h.DB.Where("id = ?", sub).First(&u).Error == nil {
							currentUser = &u
						}
					}
				}
			}
		}
	}

	// Locate target site if specified
	var targetSite *model.Site
	if strings.TrimSpace(req.SiteID) != "" {
		var s model.Site
		if h.DB.Where("id = ?", strings.TrimSpace(req.SiteID)).First(&s).Error == nil {
			targetSite = &s
		}
	} else if strings.TrimSpace(req.SiteSlug) != "" {
		slug := strings.TrimSpace(req.SiteSlug)
		var s model.Site
		if h.DB.Where("LOWER(slug) = LOWER(?) OR LOWER(custom_domain) = LOWER(?)", slug, slug).First(&s).Error == nil {
			targetSite = &s
		}
	}

	apiBaseURL := DefaultAzisabaAPIBaseURL
	if envURL := strings.TrimSpace(os.Getenv("AZISABA_API_URL")); envURL != "" {
		apiBaseURL = strings.TrimRight(envURL, "/")
	}
	if targetSite != nil {
		p := ExtractSiteAzisabaPolicy(targetSite)
		if p.ApiBaseURL != "" {
			apiBaseURL = p.ApiBaseURL
		}
	}

	var profile *AzisabaPlayerProfile
	var punishments []AzisabaPunishment
	apiKey := strings.TrimSpace(req.APIKey)

	if apiKey != "" {
		var fetched AzisabaPlayerProfile
		_, err := fetchAzisabaJSON(apiBaseURL+"/players/me", apiKey, &fetched)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": fmt.Sprintf("アジ鯖APIキーでの認証に失敗しました: %v", err),
			})
			return
		}
		profile = &fetched

		// Optionally fetch punishments if possible
		var puns []AzisabaPunishment
		punKey := apiKey
		if targetSite != nil {
			tp := ExtractSiteAzisabaPolicy(targetSite)
			if tp.ServerApiKey != "" {
				punKey = tp.ServerApiKey
			}
		}
		if _, pErr := fetchAzisabaJSON(apiBaseURL+"/players/"+url.PathEscape(profile.UUID)+"/punishments", punKey, &puns); pErr == nil {
			punishments = puns
		}
	} else if currentUser != nil {
		srvKey := strings.TrimSpace(os.Getenv("AZISABA_API_KEY"))
		if targetSite != nil {
			tp := ExtractSiteAzisabaPolicy(targetSite)
			if tp.ServerApiKey != "" {
				srvKey = tp.ServerApiKey
			}
		}
		if srvKey != "" {
			lookupTarget := strings.TrimSpace(req.PlayerName)
			if lookupTarget == "" {
				var oa model.OAuthAccount
				if h.DB.Where("user_id = ? AND provider = ?", currentUser.ID, "azisaba").First(&oa).Error == nil && oa.ProviderID != "" {
					lookupTarget = oa.ProviderID
				}
			}
			if lookupTarget != "" {
				var fetched AzisabaPlayerProfile
				var endpoint string
				if _, err := uuid.Parse(lookupTarget); err == nil {
					endpoint = apiBaseURL + "/players/" + url.PathEscape(lookupTarget)
				} else {
					endpoint = apiBaseURL + "/players/by-name/" + url.PathEscape(lookupTarget)
				}
				if _, err := fetchAzisabaJSON(endpoint, srvKey, &fetched); err == nil {
					profile = &fetched
					var puns []AzisabaPunishment
					if _, pErr := fetchAzisabaJSON(apiBaseURL+"/players/"+url.PathEscape(profile.UUID)+"/punishments", srvKey, &puns); pErr == nil {
						punishments = puns
					}
				}
			}
		}
	}

	if profile == nil && currentUser == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "アジ鯖APIキーを入力してください"})
		return
	}

	// Find or create Klados User from Azisaba profile
	avatarURL := ""
	if profile != nil && profile.UUID != "" {
		cleanUUID := strings.ReplaceAll(profile.UUID, "-", "")
		avatarURL = fmt.Sprintf("https://mc-heads.net/avatar/%s/128", cleanUUID)
	}

	if profile != nil {
		if currentUser != nil {
			// Link Azisaba OAuthAccount to currentUser
			var oa model.OAuthAccount
			if h.DB.Where("provider = ? AND provider_id = ?", "azisaba", profile.UUID).First(&oa).Error != nil {
				h.DB.Create(&model.OAuthAccount{
					UserID:     currentUser.ID,
					Provider:   "azisaba",
					ProviderID: profile.UUID,
				})
			}
			updated := false
			if currentUser.AvatarURL == "" && avatarURL != "" {
				currentUser.AvatarURL = avatarURL
				updated = true
			}
			if currentUser.DisplayName == "" && profile.Name != "" {
				currentUser.DisplayName = profile.Name
				updated = true
			}
			if updated {
				h.DB.Save(currentUser)
			}
		} else {
			// Look up existing user by OAuthAccount(azisaba, uuid)
			var oa model.OAuthAccount
			if h.DB.Where("provider = ? AND provider_id = ?", "azisaba", profile.UUID).First(&oa).Error == nil {
				var u model.User
				if h.DB.Where("id = ?", oa.UserID).First(&u).Error == nil {
					currentUser = &u
					if currentUser.AvatarURL == "" && avatarURL != "" {
						currentUser.AvatarURL = avatarURL
						h.DB.Save(currentUser)
					}
				}
			}
			if currentUser == nil {
				// Create or find user for this Minecraft player
				cleanUUID := strings.ReplaceAll(profile.UUID, "-", "")
				synthEmail := fmt.Sprintf("%s@mc.azisaba.net", cleanUUID)
				var existing model.User
				if h.DB.Where("email = ?", synthEmail).First(&existing).Error == nil {
					currentUser = &existing
				} else {
					username := profile.Name
					if username == "" {
						username = "mc_" + cleanUUID[:8]
					}
					var nameConflict int64
					h.DB.Model(&model.User{}).Where("LOWER(username) = LOWER(?)", username).Count(&nameConflict)
					if nameConflict > 0 {
						username = fmt.Sprintf("%s_%s", username, cleanUUID[:4])
					}
					newUser := model.User{
						Email:         synthEmail,
						Username:      username,
						DisplayName:   profile.Name,
						AvatarURL:     avatarURL,
						Plan:          model.PlanFree,
						EmailVerified: true,
					}
					if err := h.DB.Create(&newUser).Error; err != nil {
						c.JSON(http.StatusInternalServerError, gin.H{"error": "ユーザー作成に失敗しました: " + err.Error()})
						return
					}
					currentUser = &newUser
				}
				h.DB.Create(&model.OAuthAccount{
					UserID:     currentUser.ID,
					Provider:   "azisaba",
					ProviderID: profile.UUID,
				})
			}
		}
	}

	// Evaluate sites for auto-approval
	var candidateSites []model.Site
	if targetSite != nil {
		candidateSites = append(candidateSites, *targetSite)
	} else {
		h.DB.Find(&candidateSites)
	}

	evaluations := make([]AzisabaEvaluationResult, 0)
	approvedSites := make([]AzisabaEvaluationResult, 0)

	for i := range candidateSites {
		s := &candidateSites[i]
		policy := ExtractSiteAzisabaPolicy(s)
		if !policy.Enabled && (targetSite == nil || s.ID != targetSite.ID) {
			continue
		}
		eval := EvaluateAzisabaPolicy(s, policy, profile, punishments)
		if eval.Approved && currentUser != nil {
			// Grant SiteMember role if not already owner/admin
			if s.UserID != currentUser.ID {
				role := model.SiteRole(policy.TargetRole)
				if role != model.RoleAdmin && role != model.RoleEditor && role != model.RoleViewer {
					role = model.RoleEditor
				}
				var member model.SiteMember
				if h.DB.Where("site_id = ? AND user_id = ?", s.ID, currentUser.ID).First(&member).Error != nil {
					member = model.SiteMember{
						SiteID: s.ID,
						UserID: currentUser.ID,
						Role:   role,
					}
					h.DB.Create(&member)
				} else if member.Role == model.RoleViewer && (role == model.RoleEditor || role == model.RoleAdmin) {
					member.Role = role
					h.DB.Save(&member)
				}
			}
			approvedSites = append(approvedSites, eval)
		}
		evaluations = append(evaluations, eval)
	}

	token, err := h.generateToken(currentUser.ID.String(), 30*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "トークン生成に失敗しました"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"token":          token,
			"user":           currentUser,
			"player":         profile,
			"approved_sites": approvedSites,
			"evaluations":    evaluations,
		},
	})
}

// POST /v1/sites/:id/azisaba-test
// Allows site admins to test a player's MCID or UUID against the site's AzisabaEditorPolicy.
func (h *SiteHandler) TestAzisabaPlayer(c *gin.Context) {
	siteID := c.Param("id")
	site, err := h.resolveSite(siteID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	var req struct {
		Identifier string               `json:"identifier" binding:"required"` // MCID, UUID, or player API key
		APIKey     string               `json:"api_key"`
		Policy     *AzisabaEditorPolicy `json:"policy"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "プレイヤー名(MCID)またはUUIDを入力してください"})
		return
	}

	policy := ExtractSiteAzisabaPolicy(&site)
	if req.Policy != nil {
		policy = *req.Policy
		if strings.TrimSpace(policy.ApiBaseURL) == "" {
			policy.ApiBaseURL = DefaultAzisabaAPIBaseURL
		}
		policy.ApiBaseURL = strings.TrimRight(strings.TrimSpace(policy.ApiBaseURL), "/")
	}

	apiKey := strings.TrimSpace(req.APIKey)
	if apiKey == "" {
		apiKey = strings.TrimSpace(policy.ServerApiKey)
	}
	if apiKey == "" {
		apiKey = strings.TrimSpace(os.Getenv("AZISABA_API_KEY"))
	}

	identifier := strings.TrimSpace(req.Identifier)
	var profile AzisabaPlayerProfile
	var endpoint string
	if _, err := uuid.Parse(identifier); err == nil {
		endpoint = policy.ApiBaseURL + "/players/" + url.PathEscape(identifier)
	} else {
		endpoint = policy.ApiBaseURL + "/players/by-name/" + url.PathEscape(identifier)
	}

	if _, err := fetchAzisabaJSON(endpoint, apiKey, &profile); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("アジ鯖APIからプレイヤー情報を取得できませんでした (%v)。APIキーの設定を確認してください。", err),
		})
		return
	}

	var punishments []AzisabaPunishment
	_ = func() error {
		_, err := fetchAzisabaJSON(policy.ApiBaseURL+"/players/"+url.PathEscape(profile.UUID)+"/punishments", apiKey, &punishments)
		return err
	}()

	eval := EvaluateAzisabaPolicy(&site, policy, &profile, punishments)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"player":     profile,
			"evaluation": eval,
		},
	})
}
