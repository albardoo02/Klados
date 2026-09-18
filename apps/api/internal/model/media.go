package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type MediaFile struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	SiteID       uuid.UUID `gorm:"type:uuid;index" json:"site_id"`
	UserID       uuid.UUID `gorm:"type:uuid" json:"user_id"`
	Filename     string    `json:"filename"`
	OriginalName string    `json:"original_name"`
	MimeType     string    `json:"mime_type"`
	Size         int64     `json:"size"`
	StorageKey   string    `json:"storage_key"`
	CDNURL       string    `json:"cdn_url"`
	Width        int       `json:"width"`
	Height       int       `json:"height"`
	CreatedAt    time.Time `json:"created_at"`
}

func (m *MediaFile) BeforeCreate(tx *gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}