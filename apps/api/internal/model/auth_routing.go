package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AuthConfig struct {
	ID                       string    `gorm:"primaryKey;default:'default'" json:"id"`
	RequireEmailVerification bool      `gorm:"default:false" json:"require_email_verification"`
	AllowEmailRegistration   bool      `gorm:"default:true" json:"allow_email_registration"`   // メールアドレスによる新規登録を許可
	EnableEmailLogin         bool      `gorm:"default:true" json:"enable_email_login"`         // メール・パスワード認証（ログイン/登録）
	EnableGithubLogin        bool      `gorm:"default:true" json:"enable_github_login"`        // GitHub OAuthログイン
	EnableDiscordLogin       bool      `gorm:"default:true" json:"enable_discord_login"`       // Discord OAuthログイン
	EnableGoogleLogin        bool      `gorm:"default:true" json:"enable_google_login"`        // Google OAuthログイン
	EnableDemoLogin          bool      `gorm:"default:true" json:"enable_demo_login"`          // ワンクリックかんたんログイン（デモ）
	OnlyRootCanCreateSites   bool      `gorm:"default:true" json:"only_root_can_create_sites"` // サイト新規作成をrootユーザーのみに限定
	DefaultRole              string    `gorm:"default:'viewer'" json:"default_role"`
	AllowedDomains           string    `json:"allowed_domains"`                        // カンマ区切りの許可ドメイン (空欄なら全ドメイン許可)
	RestrictToRules          bool      `gorm:"default:false" json:"restrict_to_rules"` // 振り分けルールに合致しないユーザーのログインを拒否
	GithubClientID           string    `json:"github_client_id"`
	GithubClientSecret       string    `json:"github_client_secret,omitempty"`
	DiscordClientID          string    `json:"discord_client_id"`
	DiscordClientSecret      string    `json:"discord_client_secret,omitempty"`
	UpdatedAt                time.Time `json:"updated_at"`
}

func (c *AuthConfig) BeforeCreate(tx *gorm.DB) error {
	if c.ID == "" {
		c.ID = "default"
	}
	return nil
}

type AuthRoutingRule struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Name         string     `gorm:"not null" json:"name"`
	Enabled      bool       `gorm:"default:true" json:"enabled"`
	Provider     string     `gorm:"default:'all'" json:"provider"`                 // "all", "github", "discord", "google", "email"
	RuleType     string     `gorm:"not null" json:"rule_type"`                     // "github_org", "discord_guild", "email_domain", "email_list"
	MatchValue   string     `gorm:"not null" json:"match_value"`                   // e.g. "azisaba-network", "1234567890", "@company.com"
	ActionType   string     `gorm:"default:'assign_site_role'" json:"action_type"` // "assign_site_role", "allow_only"
	TargetSiteID *uuid.UUID `gorm:"type:uuid;index" json:"target_site_id"`
	TargetRole   SiteRole   `gorm:"type:varchar(30);default:'editor'" json:"target_role"` // "admin", "editor", "viewer"
	AutoVerify   bool       `gorm:"default:true" json:"auto_verify"`                      // 自動でメール認証済みにする
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	TargetSite *Site `gorm:"foreignKey:TargetSiteID" json:"target_site,omitempty"`
}

func (r *AuthRoutingRule) BeforeCreate(tx *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}
