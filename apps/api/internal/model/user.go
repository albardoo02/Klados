package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Plan string

const (
	PlanFree Plan = "free"
	PlanPro  Plan = "pro"
	PlanTeam Plan = "team"
)

type User struct {
	ID                    uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Email                 string     `gorm:"uniqueIndex;not null" json:"email"`
	Username              string     `gorm:"uniqueIndex;not null" json:"username"`
	Password              *string    `json:"-"`
	DisplayName           string     `json:"display_name"`
	AvatarURL             string     `json:"avatar_url"`
	Plan                  Plan       `gorm:"default:free" json:"plan"`
	IsRoot                bool       `gorm:"default:false" json:"is_root"`
	EmailVerified         bool       `gorm:"default:false" json:"email_verified"`
	VerificationToken     *string    `gorm:"type:varchar(255);index" json:"-"`
	VerificationExpiresAt *time.Time `json:"-"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

type OAuthAccount struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID     uuid.UUID `gorm:"type:uuid;index" json:"user_id"`
	Provider   string    `json:"provider"`
	ProviderID string    `json:"provider_id"`
	User       User      `gorm:"foreignKey:UserID" json:"-"`
}

func (o *OAuthAccount) BeforeCreate(tx *gorm.DB) error {
	if o.ID == uuid.Nil {
		o.ID = uuid.New()
	}
	return nil
}
