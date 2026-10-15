package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type MemberHandler struct {
	DB *gorm.DB
}

// サイトID（UUID）またはスラッグ・カスタムドメインからSiteモデルを取得するヘルパー
func (h *MemberHandler) resolveSite(siteParam string) (*model.Site, error) {
	siteParam = strings.TrimSpace(siteParam)
	if siteParam == "" {
		return nil, gorm.ErrRecordNotFound
	}

	var site model.Site
	if siteUID, err := uuid.Parse(siteParam); err == nil {
		if err := h.DB.Preload("User").Where("id = ?", siteUID).First(&site).Error; err == nil {
			return &site, nil
		}
	}

	// スラッグまたはカスタムドメインによるフォールバック検索
	if err := h.DB.Preload("User").Where("LOWER(slug) = LOWER(?) OR LOWER(custom_domain) = LOWER(?)", siteParam, siteParam).First(&site).Error; err == nil {
		return &site, nil
	}

	return nil, gorm.ErrRecordNotFound
}

// ユーザーがサイトのオーナーまたは権限を持っているかチェックするヘルパー
func (h *MemberHandler) checkPermission(site *model.Site, userID uuid.UUID, requiredPerm string) (bool, model.SiteRole, error) {
	if site == nil {
		return false, "", gorm.ErrRecordNotFound
	}
	if userID == uuid.Nil {
		return false, "", nil
	}

	// 1. Root管理者は全サイトに対して全権限を持つ
	var u model.User
	if err := h.DB.Where("id = ?", userID).First(&u).Error; err == nil {
		if u.IsRoot || strings.EqualFold(u.Username, "admin") || strings.EqualFold(u.Email, "admin@klados.app") {
			return true, model.RoleAdmin, nil
		}
	}

	// 2. オーナーは無条件で全権限
	if site.UserID == userID {
		return true, model.RoleOwner, nil
	}

	// 3. サイトメンバー検索
	var member model.SiteMember
	if err := h.DB.Where("site_id = ? AND user_id = ?", site.ID, userID).First(&member).Error; err != nil {
		// メンバーレコード未登録の場合でも、ポリシーによる自動承認を判定
		policy := ExtractSiteAzisabaPolicy(site)
		if policy.Enabled && policy.AllowAnyRegisteredUser {
			if requiredPerm == "view" || requiredPerm == "can_edit_pages" || requiredPerm == "can_publish_pages" || requiredPerm == "can_manage_media" {
				return true, model.RoleEditor, nil
			}
		}
		return false, "", nil
	}

	roleLower := strings.ToLower(strings.TrimSpace(string(member.Role)))

	// 4. 管理者は全権限
	if roleLower == "admin" || roleLower == "owner" {
		return true, model.RoleAdmin, nil
	}

	// 5. サイトメンバーであれば「閲覧(view)」権限は無条件で付与
	if requiredPerm == "view" {
		return true, member.Role, nil
	}

	// 6. 編集者デフォルト権限
	if roleLower == "editor" {
		if requiredPerm == "can_edit_pages" || requiredPerm == "can_publish_pages" || requiredPerm == "can_manage_media" {
			return true, model.RoleEditor, nil
		}
		return false, model.RoleEditor, nil
	}

	// 7. 閲覧者
	if roleLower == "viewer" {
		return false, model.RoleViewer, nil
	}

	// 8. カスタム（自由設定）権限
	if roleLower == "custom" {
		if len(member.Permissions) > 0 {
			var perms model.SitePermissions
			if err := json.Unmarshal(member.Permissions, &perms); err == nil {
				switch requiredPerm {
				case "can_edit_pages":
					return perms.CanEditPages, model.RoleCustom, nil
				case "can_publish_pages":
					return perms.CanPublishPages, model.RoleCustom, nil
				case "can_delete_pages":
					return perms.CanDeletePages, model.RoleCustom, nil
				case "can_manage_settings":
					return perms.CanManageSettings, model.RoleCustom, nil
				case "can_invite_members":
					return perms.CanInviteMembers, model.RoleCustom, nil
				case "can_manage_media":
					return perms.CanManageMedia, model.RoleCustom, nil
				}
			}
		}
	}

	return false, member.Role, nil
}

// メンバー一覧取得 (オーナー＋招待メンバー)
func (h *MemberHandler) List(c *gin.Context) {
	siteParam := c.Param("id")
	site, err := h.resolveSite(siteParam)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "サイトが見つかりません"})
		return
	}

	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	// 閲覧権限チェック
	hasPerm, _, err := h.checkPermission(site, userID, "view")
	if err != nil || !hasPerm {
		c.JSON(http.StatusForbidden, gin.H{"error": "このサイトのメンバー一覧を閲覧する権限がありません"})
		return
	}

	var members []model.SiteMember
	h.DB.Preload("User").Where("site_id = ?", site.ID).Order("created_at asc").Find(&members)

	// オーナーを先頭にしたレスポンス用構造体を構築
	ownerPerms, _ := json.Marshal(model.SitePermissions{
		CanEditPages:      true,
		CanPublishPages:   true,
		CanDeletePages:    true,
		CanManageSettings: true,
		CanInviteMembers:  true,
		CanManageMedia:    true,
	})

	type MemberResponseItem struct {
		ID          string         `json:"id"`
		SiteID      string         `json:"site_id"`
		UserID      string         `json:"user_id"`
		Role        model.SiteRole `json:"role"`
		IsOwner     bool           `json:"is_owner"`
		Permissions datatypes.JSON `json:"permissions"`
		CreatedAt   string         `json:"created_at"`
		User        model.User     `json:"user"`
	}

	var result []MemberResponseItem

	// オーナー追加
	result = append(result, MemberResponseItem{
		ID:          "owner-" + site.UserID.String(),
		SiteID:      site.ID.String(),
		UserID:      site.UserID.String(),
		Role:        model.RoleOwner,
		IsOwner:     true,
		Permissions: ownerPerms,
		CreatedAt:   site.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		User:        site.User,
	})

	// 招待メンバー追加
	for _, m := range members {
		result = append(result, MemberResponseItem{
			ID:          m.ID.String(),
			SiteID:      m.SiteID.String(),
			UserID:      m.UserID.String(),
			Role:        m.Role,
			IsOwner:     false,
			Permissions: m.Permissions,
			CreatedAt:   m.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			User:        m.User,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

type addMemberRequest struct {
	Identifier  string                 `json:"identifier" binding:"required"` // メールアドレスまたはユーザー名
	Role        model.SiteRole         `json:"role" binding:"required"`
	Permissions *model.SitePermissions `json:"permissions"`
}

// メンバー招待・追加
func (h *MemberHandler) Add(c *gin.Context) {
	siteParam := c.Param("id")
	site, err := h.resolveSite(siteParam)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "サイトが見つかりません"})
		return
	}

	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	// 招待権限チェック（オーナー、管理者、または can_invite_members 権限保有者）
	hasPerm, _, err := h.checkPermission(site, userID, "can_invite_members")
	if err != nil || !hasPerm {
		c.JSON(http.StatusForbidden, gin.H{"error": "メンバーを招待・追加する権限がありません"})
		return
	}

	var req addMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "入力内容が正しくありません"})
		return
	}

	// 対象ユーザーを検索 (email または username)
	var targetUser model.User
	if err := h.DB.Where("email = ? OR username = ?", req.Identifier, req.Identifier).First(&targetUser).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "指定されたユーザー（メールアドレスまたはユーザー名）が見つかりません"})
		return
	}

	// オーナー自身は追加不可
	if site.UserID == targetUser.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "サイトオーナーは既にすべての権限を持っています"})
		return
	}

	// すでにメンバーか確認
	var existing model.SiteMember
	if err := h.DB.Where("site_id = ? AND user_id = ?", site.ID, targetUser.ID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "このユーザーは既にメンバーとして登録されています"})
		return
	}

	// 権限JSONの生成
	permsJSON := datatypes.JSON([]byte("{}"))
	targetRoleLower := strings.ToLower(string(req.Role))

	if targetRoleLower == "custom" && req.Permissions != nil {
		if bytes, err := json.Marshal(req.Permissions); err == nil {
			permsJSON = datatypes.JSON(bytes)
		}
	} else {
		// プリセットロールごとのデフォルト権限を展開
		var defaultPerms model.SitePermissions
		switch targetRoleLower {
		case "admin":
			defaultPerms = model.SitePermissions{
				CanEditPages:      true,
				CanPublishPages:   true,
				CanDeletePages:    true,
				CanManageSettings: true,
				CanInviteMembers:  true,
				CanManageMedia:    true,
			}
		case "editor":
			defaultPerms = model.SitePermissions{
				CanEditPages:      true,
				CanPublishPages:   true,
				CanDeletePages:    false,
				CanManageSettings: false,
				CanInviteMembers:  false,
				CanManageMedia:    true,
			}
		case "viewer":
			defaultPerms = model.SitePermissions{}
		}
		if bytes, err := json.Marshal(defaultPerms); err == nil {
			permsJSON = datatypes.JSON(bytes)
		}
	}

	normalizedRole := model.RoleEditor
	switch targetRoleLower {
	case "admin":
		normalizedRole = model.RoleAdmin
	case "viewer":
		normalizedRole = model.RoleViewer
	case "custom":
		normalizedRole = model.RoleCustom
	}

	member := model.SiteMember{
		SiteID:      site.ID,
		UserID:      targetUser.ID,
		Role:        normalizedRole,
		Permissions: permsJSON,
	}

	if err := h.DB.Create(&member).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "メンバーの登録に失敗しました"})
		return
	}

	member.User = targetUser

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"message": "メンバーを追加しました！",
		"data":    member,
	})
}

type updateMemberRequest struct {
	Role        model.SiteRole         `json:"role"`
	Permissions *model.SitePermissions `json:"permissions"`
}

// メンバー権限更新
func (h *MemberHandler) Update(c *gin.Context) {
	siteParam := c.Param("id")
	site, err := h.resolveSite(siteParam)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "サイトが見つかりません"})
		return
	}

	memberIDStr := c.Param("memberId")
	memberID, err := uuid.Parse(memberIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無効なメンバーIDです"})
		return
	}

	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	// 権限チェック: オーナーまたは管理者のみ変更可能
	hasPerm, role, err := h.checkPermission(site, userID, "can_invite_members")
	roleLower := strings.ToLower(string(role))
	if err != nil || !hasPerm || (roleLower != "owner" && roleLower != "admin") {
		c.JSON(http.StatusForbidden, gin.H{"error": "メンバー権限を変更する権限がありません"})
		return
	}

	var member model.SiteMember
	if err := h.DB.Where("id = ? AND site_id = ?", memberID, site.ID).First(&member).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "メンバーが見つかりません"})
		return
	}

	var req updateMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "入力内容が正しくありません"})
		return
	}

	if req.Role != "" {
		reqRoleLower := strings.ToLower(string(req.Role))
		switch reqRoleLower {
		case "admin":
			member.Role = model.RoleAdmin
		case "editor":
			member.Role = model.RoleEditor
		case "viewer":
			member.Role = model.RoleViewer
		case "custom":
			member.Role = model.RoleCustom
		default:
			member.Role = req.Role
		}
	}

	targetRoleLower := strings.ToLower(string(member.Role))
	if targetRoleLower == "custom" && req.Permissions != nil {
		if bytes, err := json.Marshal(req.Permissions); err == nil {
			member.Permissions = datatypes.JSON(bytes)
		}
	} else if req.Role != "" {
		// プリセットロールごとのデフォルト権限
		var defaultPerms model.SitePermissions
		switch targetRoleLower {
		case "admin":
			defaultPerms = model.SitePermissions{
				CanEditPages:      true,
				CanPublishPages:   true,
				CanDeletePages:    true,
				CanManageSettings: true,
				CanInviteMembers:  true,
				CanManageMedia:    true,
			}
		case "editor":
			defaultPerms = model.SitePermissions{
				CanEditPages:      true,
				CanPublishPages:   true,
				CanDeletePages:    false,
				CanManageSettings: false,
				CanInviteMembers:  false,
				CanManageMedia:    true,
			}
		case "viewer":
			defaultPerms = model.SitePermissions{}
		}
		if bytes, err := json.Marshal(defaultPerms); err == nil {
			member.Permissions = datatypes.JSON(bytes)
		}
	}

	if err := h.DB.Save(&member).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "メンバー情報の更新に失敗しました"})
		return
	}

	h.DB.Preload("User").First(&member, member.ID)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "メンバーの権限を更新しました",
		"data":    member,
	})
}

// メンバー削除（サイトから除外）
func (h *MemberHandler) Remove(c *gin.Context) {
	siteParam := c.Param("id")
	site, err := h.resolveSite(siteParam)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "サイトが見つかりません"})
		return
	}

	memberIDStr := c.Param("memberId")
	memberID, err := uuid.Parse(memberIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無効なメンバーIDです"})
		return
	}

	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	var member model.SiteMember
	if err := h.DB.Where("id = ? AND site_id = ?", memberID, site.ID).First(&member).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "メンバーが見つかりません"})
		return
	}

	// 権限チェック: オーナー、管理者、または自分自身の退会
	isSelf := member.UserID == userID
	hasPerm, role, _ := h.checkPermission(site, userID, "can_invite_members")
	roleLower := strings.ToLower(string(role))
	if !isSelf && (!hasPerm || (roleLower != "owner" && roleLower != "admin")) {
		c.JSON(http.StatusForbidden, gin.H{"error": "メンバーを削除する権限がありません"})
		return
	}

	if err := h.DB.Delete(&member).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "メンバーの削除に失敗しました"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "メンバーを削除しました",
	})
}
