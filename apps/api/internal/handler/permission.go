package handler

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"gorm.io/gorm"
)

// SitePerm はサイト単位の操作権限を表す
type SitePerm string

const (
	PermView           SitePerm = "view"                // 下書き・管理画面の閲覧
	PermEditPages      SitePerm = "can_edit_pages"      // ページの作成・編集
	PermPublishPages   SitePerm = "can_publish_pages"   // ページの公開・非公開
	PermDeletePages    SitePerm = "can_delete_pages"    // ページのゴミ箱移動・復元
	PermManageSettings SitePerm = "can_manage_settings" // サイト設定（サイドバー・ドメイン等）
	PermInviteMembers  SitePerm = "can_invite_members"  // メンバーの追加・権限変更
	PermManageMedia    SitePerm = "can_manage_media"    // メディアのアップロード・削除
)

// roleRank は複数のメンバーレコードが存在する場合に最も強い権限を採用するための序列
var roleRank = map[model.SiteRole]int{
	model.RoleViewer: 1,
	model.RoleCustom: 2,
	model.RoleEditor: 3,
	model.RoleAdmin:  4,
	model.RoleOwner:  5,
}

// SiteAccess はあるユーザーのサイトに対する解決済みアクセス権
type SiteAccess struct {
	UserID      uuid.UUID
	Role        model.SiteRole // 空文字 = アクセス権なし
	IsRoot      bool
	IsOwner     bool
	IsMember    bool // site_members に実レコードがある
	Permissions model.SitePermissions
}

// HasAccess はサイトに何らかのロールを持つか
func (a *SiteAccess) HasAccess() bool {
	return a != nil && a.Role != ""
}

// Can は指定された権限を持つか判定する
func (a *SiteAccess) Can(p SitePerm) bool {
	if !a.HasAccess() {
		return false
	}
	switch p {
	case PermView:
		return true
	case PermEditPages:
		return a.Permissions.CanEditPages
	case PermPublishPages:
		return a.Permissions.CanPublishPages
	case PermDeletePages:
		return a.Permissions.CanDeletePages
	case PermManageSettings:
		return a.Permissions.CanManageSettings
	case PermInviteMembers:
		return a.Permissions.CanInviteMembers
	case PermManageMedia:
		return a.Permissions.CanManageMedia
	}
	return false
}

// RolePermissions はロールごとの既定権限を返す（custom は個別フラグ）
func RolePermissions(role model.SiteRole, custom []byte) model.SitePermissions {
	switch role {
	case model.RoleOwner, model.RoleAdmin:
		return model.SitePermissions{
			CanEditPages:      true,
			CanPublishPages:   true,
			CanDeletePages:    true,
			CanManageSettings: true,
			CanInviteMembers:  true,
			CanManageMedia:    true,
		}
	case model.RoleEditor:
		return model.SitePermissions{
			CanEditPages:    true,
			CanPublishPages: true,
			CanManageMedia:  true,
		}
	case model.RoleCustom:
		var perms model.SitePermissions
		if len(custom) > 0 {
			_ = json.Unmarshal(custom, &perms)
		}
		return perms
	}
	return model.SitePermissions{}
}

// ResolveSiteAccess はユーザーのサイトに対するロールと権限を一元的に解決する。
//
// 優先順位: root > オーナー > site_members (複数あれば最上位) > Azisaba 自動承認ポリシー
func ResolveSiteAccess(db *gorm.DB, site *model.Site, userID uuid.UUID) *SiteAccess {
	access := &SiteAccess{UserID: userID}
	if db == nil || site == nil || userID == uuid.Nil {
		return access
	}

	var user model.User
	if err := db.Where("id = ?", userID).First(&user).Error; err == nil && user.IsRoot {
		access.IsRoot = true
	}

	switch {
	case site.UserID == userID:
		access.IsOwner = true
		access.Role = model.RoleOwner
	case access.IsRoot:
		access.Role = model.RoleAdmin
	default:
		var members []model.SiteMember
		db.Where("site_id = ? AND user_id = ?", site.ID, userID).Find(&members)
		var best *model.SiteMember
		for i := range members {
			if best == nil || roleRank[members[i].Role] > roleRank[best.Role] {
				best = &members[i]
			}
		}
		if best != nil {
			access.IsMember = true
			access.Role = best.Role
			access.Permissions = RolePermissions(best.Role, best.Permissions)
			return access
		}

		// Azisaba ポリシーで「全登録ユーザーを許可」している場合は仮想ロールを付与
		policy := ExtractSiteAzisabaPolicy(site)
		if policy.Enabled && policy.AllowAnyRegisteredUser {
			role := model.SiteRole(policy.TargetRole)
			if role != model.RoleAdmin && role != model.RoleEditor && role != model.RoleViewer {
				role = model.RoleEditor
			}
			access.Role = role
		}
	}

	if access.Role == model.RoleOwner || access.IsRoot {
		access.Permissions = RolePermissions(model.RoleOwner, nil)
	} else if access.Role != "" {
		access.Permissions = RolePermissions(access.Role, nil)
	}
	return access
}

// findSiteByRef は UUID / slug / custom_domain のいずれかでサイトを取得する
func findSiteByRef(db *gorm.DB, ref string) (*model.Site, error) {
	var site model.Site
	if id, err := uuid.Parse(ref); err == nil {
		if err := db.Where("id = ?", id).First(&site).Error; err != nil {
			return nil, err
		}
		return &site, nil
	}
	if err := db.Where("LOWER(slug) = LOWER(?) OR LOWER(custom_domain) = LOWER(?)", ref, ref).First(&site).Error; err != nil {
		return nil, err
	}
	return &site, nil
}

func currentUserID(c *gin.Context) uuid.UUID {
	uid, _ := uuid.Parse(c.GetString("user_id"))
	return uid
}

// requireSitePerm はサイトを解決し、権限がなければ 404/403 を返して false を返す
func requireSitePerm(c *gin.Context, db *gorm.DB, siteRef string, perm SitePerm) (*model.Site, *SiteAccess, bool) {
	if siteRef == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return nil, nil, false
	}
	site, err := findSiteByRef(db, siteRef)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return nil, nil, false
	}
	access := ResolveSiteAccess(db, site, currentUserID(c))
	if !access.HasAccess() {
		c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return nil, nil, false
	}
	if !access.Can(perm) {
		c.JSON(http.StatusForbidden, gin.H{"error": "この操作を行う権限がありません", "required_permission": perm})
		return nil, nil, false
	}
	return site, access, true
}

// requirePagePerm はページ（とその所属サイト）を解決し、権限を検証する
func requirePagePerm(c *gin.Context, db *gorm.DB, pageID string, perm SitePerm, includeDeleted bool) (*model.Page, *SiteAccess, bool) {
	var page model.Page
	q := db.Where("id = ?", pageID)
	if !includeDeleted {
		q = q.Where("deleted_at IS NULL")
	}
	if err := q.First(&page).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return nil, nil, false
	}
	_, access, ok := requireSitePerm(c, db, page.SiteID.String(), perm)
	if !ok {
		return nil, nil, false
	}
	return &page, access, true
}
