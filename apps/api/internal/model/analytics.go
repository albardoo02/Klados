package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PageView struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	SiteID    uuid.UUID  `gorm:"type:uuid;index;not null" json:"site_id"`
	PageID    *uuid.UUID `gorm:"type:uuid;index" json:"page_id"`
	Path      string     `gorm:"not null" json:"path"`
	Referrer  string     `json:"referrer"`
	UserAgent string     `json:"user_agent"`
	IP        string     `gorm:"size:64;index" json:"ip"`
	CreatedAt time.Time  `gorm:"index" json:"created_at"`
}

func (pv *PageView) BeforeCreate(tx *gorm.DB) error {
	if pv.ID == uuid.Nil {
		pv.ID = uuid.New()
	}
	return nil
}
