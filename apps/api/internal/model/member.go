package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type SiteRole string

const (
	RoleOwner  SiteRole = "owner"  // サイトオーナー（全権限・サイト削除可能）
	RoleAdmin  SiteRole = "admin"  // 管理者（設定変更・メンバー招待・全ページ管理）
	RoleEditor SiteRole = "editor" // 編集者（ページ作成・編集・メディア管理）
	RoleViewer SiteRole = "viewer" // 閲覧者（下書き・解析の閲覧のみ）
	RoleCustom SiteRole = "custom" // 自由設定ユーザー（個別権限フラグでカスタム）
)

type SitePermissions struct {
	CanEditPages      bool `json:"can_edit_pages"`      // ページの作成・編集
	CanPublishPages   bool `json:"can_publish_pages"`   // ページの公開・非公開
	CanDeletePages    bool `json:"can_delete_pages"`    // ページのゴミ箱移動・削除
	CanManageSettings bool `json:"can_manage_settings"` // サイト設定・カスタムドメイン変更
	CanInviteMembers  bool `json:"can_invite_members"`  // メンバーの追加・権限変更
	CanManageMedia    bool `json:"can_manage_media"`    // メディアのアップロード・削除
}

type SiteMember struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	SiteID      uuid.UUID      `gorm:"type:uuid;index;not null" json:"site_id"`
	UserID      uuid.UUID      `gorm:"type:uuid;index;not null" json:"user_id"`
	Role        SiteRole       `gorm:"type:varchar(30);default:editor" json:"role"`
	Permissions datatypes.JSON `json:"permissions"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`

	User        User           `gorm:"foreignKey:UserID" json:"user"`
	Site        Site           `gorm:"foreignKey:SiteID" json:"-"`
}

func (sm *SiteMember) BeforeCreate(tx *gorm.DB) error {
	if sm.ID == uuid.Nil {
		sm.ID = uuid.New()
	}
	return nil
}
