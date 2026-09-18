package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type PageStatus string

const (
	PageStatusDraft     PageStatus = "draft"
	PageStatusPublished PageStatus = "published"
	PageStatusTrashed   PageStatus = "trashed"
)

type Page struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	SiteID      uuid.UUID      `gorm:"type:uuid;index" json:"site_id"`
	ParentID    *uuid.UUID     `gorm:"type:uuid;index" json:"parent_id"`
	Slug        string         `gorm:"not null" json:"slug"`
	Title       string         `gorm:"not null" json:"title"`
	Content     string         `gorm:"type:text" json:"content"`
	Frontmatter datatypes.JSON `json:"frontmatter"`
	Status      PageStatus     `gorm:"default:draft" json:"status"`
	Position    int            `gorm:"default:0" json:"position"`
	PublishedAt *time.Time     `json:"published_at"`
	DeletedAt   *time.Time     `json:"deleted_at"`
	Site        Site           `gorm:"foreignKey:SiteID" json:"-"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

func (p *Page) BeforeCreate(tx *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}

type PageVersion struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	PageID    uuid.UUID `gorm:"type:uuid;index" json:"page_id"`
	UserID    uuid.UUID `gorm:"type:uuid" json:"user_id"`
	Content   string    `gorm:"type:text" json:"content"`
	Version   int       `json:"version"`
	CreatedAt time.Time `json:"created_at"`
}

func (pv *PageVersion) BeforeCreate(tx *gorm.DB) error {
	if pv.ID == uuid.Nil {
		pv.ID = uuid.New()
	}
	return nil
}