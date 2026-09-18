package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type APIKey struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	UserID     uuid.UUID  `gorm:"type:uuid;index;not null" json:"user_id"`
	Name       string     `gorm:"not null" json:"name"`
	KeyHash    string     `gorm:"uniqueIndex;not null" json:"-"`
	KeyPrefix  string     `gorm:"not null" json:"key_prefix"`
	LastUsedAt *time.Time `json:"last_used_at"`
	CreatedAt  time.Time  `json:"created_at"`
	User       User       `gorm:"foreignKey:UserID" json:"-"`
}

func (k *APIKey) BeforeCreate(tx *gorm.DB) error {
	if k.ID == uuid.Nil {
		k.ID = uuid.New()
	}
	return nil
}
