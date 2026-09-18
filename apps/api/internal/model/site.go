package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/datatypes"
)

type Site struct {
	ID           uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	UserID       uuid.UUID      `gorm:"type:uuid;index" json:"user_id"`
	Slug         string         `gorm:"uniqueIndex;not null" json:"slug"`
	CustomDomain string         `json:"custom_domain"`
	Title        string         `gorm:"not null" json:"title"`
	Description  string         `json:"description"`
	Theme        string         `gorm:"default:minimal" json:"theme"`
	IsPublic     bool           `gorm:"default:true" json:"is_public"`
	PasswordHash *string        `gorm:"type:text" json:"-"`
	IsProtected  bool           `gorm:"-" json:"is_protected"`
	Settings     datatypes.JSON `json:"settings"`
	User         User           `gorm:"foreignKey:UserID" json:"-"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
}

func (s *Site) AfterFind(tx *gorm.DB) error {
	if s.PasswordHash != nil && *s.PasswordHash != "" {
		s.IsProtected = true
	}
	return nil
}

func (s *Site) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}