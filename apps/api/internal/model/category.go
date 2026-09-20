package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PageCategory struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	SiteID       uuid.UUID `gorm:"type:uuid;index;not null" json:"site_id"`
	PageID       uuid.UUID `gorm:"type:uuid;index;not null" json:"page_id"`
	CategoryName string    `gorm:"type:varchar(255);index;not null" json:"category_name"`
	SortKey      string    `gorm:"type:varchar(255);not null" json:"sort_key"`
	CreatedAt    time.Time `json:"created_at"`
}

func (pc *PageCategory) BeforeCreate(tx *gorm.DB) error {
	if pc.ID == uuid.Nil {
		pc.ID = uuid.New()
	}
	return nil
}
