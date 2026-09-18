package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type MemberHandler struct {
	DB *gorm.DB
}

// ユーザーがサイトのオーナーまたは権限を持っているかチェックするヘルパー
func (h *MemberHandler) checkPermission(siteID uuid.UUID, userID uuid.UUID, requiredPerm string) (bool, model.SiteRole, error) {
	var site model.Site
	if err := h.DB.Where("id = ?", siteID).First(&site).Error; err != nil {
		return false, "", err
	}

	// オーナーは無条件で全権限
	if site.UserID == userID {
		return true, model.RoleOwner, nil
	}

	var member model.SiteMember
	if err := h.DB.Where("site_id = ? AND user_id = ?", siteID, userID).First(&member).Error; err != nil {
		return false, "", err
	}

	// 管理者は全権限
	if member.Role == model.RoleAdmin {
		return true, model.RoleAdmin, nil
	}

	// 編集者デフォルト権限
	if member.Role == model.RoleEditor {
		if requiredPerm == "can_edit_pages" || requiredPerm == "can_publish_pages" || requiredPerm == "can_manage_media" {
			return true, model.RoleEditor, nil
		}
		return false, model.RoleEditor, nil
	}

	// 閲覧者
	if member.Role == model.RoleViewer {
		if requiredPerm == "view" {
			return true, model.RoleViewer, nil
		}
		return false, model.RoleViewer, nil
	}

	// カスタム（自由設定）権限
	if member.Role == model.RoleCustom {
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
				case "view":
					return true, model.RoleCustom, nil
				}
			}
		}
	}

	return false, member.Role, nil
}

// メンバー一覧取得 (オーナー＋招待メンバー)
func (h *MemberHandler) List(c *gin.Context) {
	siteIDStr := c.Param("id")
	siteID, err := uuid.Parse(siteIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無効なサイトIDです"})
		return
	}

	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	// 閲覧権限チェック
	hasPerm, _, err := h.checkPermission(siteID, userID, "view")
	if err != nil || !hasPerm {
		c.JSON(http.StatusForbidden, gin.H{"error": "このサイトのメンバー一覧を閲覧する権限がありません"})
		return
	}

	var site model.Site
	if err := h.DB.Preload("User").Where("id = ?", siteID).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "サイトが見つかりません"})
		return
	}

	var members []model.SiteMember
	h.DB.Preload("User").Where("site_id = ?", siteID).Order("created_at asc").Find(&members)

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
	siteIDStr := c.Param("id")
	siteID, err := uuid.Parse(siteIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無効なサイトIDです"})
		return
	}

	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	// 招待権限チェック（オーナー、管理者、または can_invite_members 権限保有者）
	hasPerm, _, err := h.checkPermission(siteID, userID, "can_invite_members")
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

	// サイト情報取得
	var site model.Site
	if err := h.DB.Where("id = ?", siteID).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "サイトが見つかりません"})
		return
	}

	// オーナー自身は追加不可
	if site.UserID == targetUser.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "サイトオーナーは既にすべての権限を持っています"})
		return
	}

	// すでにメンバーか確認
	var existing model.SiteMember
	if err := h.DB.Where("site_id = ? AND user_id = ?", siteID, targetUser.ID).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "このユーザーは既にメンバーとして登録されています"})
		return
	}

	// 権限JSONの生成
	permsJSON := datatypes.JSON([]byte("{}"))
	if req.Role == model.RoleCustom && req.Permissions != nil {
		if bytes, err := json.Marshal(req.Permissions); err == nil {
			permsJSON = datatypes.JSON(bytes)
		}
	} else {
		// プリセットロールごとのデフォルト権限を展開
		var defaultPerms model.SitePermissions
		switch req.Role {
		case model.RoleAdmin:
			defaultPerms = model.SitePermissions{
				CanEditPages:      true,
				CanPublishPages:   true,
				CanDeletePages:    true,
				CanManageSettings: true,
				CanInviteMembers:  true,
				CanManageMedia:    true,
			}
		case model.RoleEditor:
			defaultPerms = model.SitePermissions{
				CanEditPages:      true,
				CanPublishPages:   true,
				CanDeletePages:    false,
				CanManageSettings: false,
				CanInviteMembers:  false,
				CanManageMedia:    true,
			}
		case model.RoleViewer:
			defaultPerms = model.SitePermissions{}
		}
		if bytes, err := json.Marshal(defaultPerms); err == nil {
			permsJSON = datatypes.JSON(bytes)
		}
	}

	member := model.SiteMember{
		SiteID:      siteID,
		UserID:      targetUser.ID,
		Role:        req.Role,
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
	siteIDStr := c.Param("id")
	siteID, err := uuid.Parse(siteIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無効なサイトIDです"})
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
	hasPerm, role, err := h.checkPermission(siteID, userID, "can_invite_members")
	if err != nil || !hasPerm || (role != model.RoleOwner && role != model.RoleAdmin) {
		c.JSON(http.StatusForbidden, gin.H{"error": "メンバー権限を変更する権限がありません"})
		return
	}

	var member model.SiteMember
	if err := h.DB.Where("id = ? AND site_id = ?", memberID, siteID).First(&member).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "メンバーが見つかりません"})
		return
	}

	var req updateMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "入力内容が正しくありません"})
		return
	}

	if req.Role != "" {
		member.Role = req.Role
	}

	if req.Role == model.RoleCustom && req.Permissions != nil {
		if bytes, err := json.Marshal(req.Permissions); err == nil {
			member.Permissions = datatypes.JSON(bytes)
		}
	} else if req.Role != "" {
		// プリセットロールごとのデフォルト権限
		var defaultPerms model.SitePermissions
		switch req.Role {
		case model.RoleAdmin:
			defaultPerms = model.SitePermissions{
				CanEditPages:      true,
				CanPublishPages:   true,
				CanDeletePages:    true,
				CanManageSettings: true,
				CanInviteMembers:  true,
				CanManageMedia:    true,
			}
		case model.RoleEditor:
			defaultPerms = model.SitePermissions{
				CanEditPages:      true,
				CanPublishPages:   true,
				CanDeletePages:    false,
				CanManageSettings: false,
				CanInviteMembers:  false,
				CanManageMedia:    true,
			}
		case model.RoleViewer:
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
	siteIDStr := c.Param("id")
	siteID, err := uuid.Parse(siteIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "無効なサイトIDです"})
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
	if err := h.DB.Where("id = ? AND site_id = ?", memberID, siteID).First(&member).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "メンバーが見つかりません"})
		return
	}

	// 権限チェック: オーナー、管理者、または自分自身の退会
	isSelf := member.UserID == userID
	hasPerm, role, _ := h.checkPermission(siteID, userID, "can_invite_members")
	if !isSelf && (!hasPerm || (role != model.RoleOwner && role != model.RoleAdmin)) {
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
