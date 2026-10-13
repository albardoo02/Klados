package model

import (
	"encoding/json"
	"strings"
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
	Categories  []string       `gorm:"-" json:"categories"`
	Status      PageStatus     `gorm:"default:draft" json:"status"`
	Position    int            `gorm:"default:0" json:"position"`
	PublishedAt *time.Time     `json:"published_at"`
	DeletedAt   *time.Time     `json:"deleted_at"`
	Site        Site           `gorm:"foreignKey:SiteID" json:"-"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}

func (p *Page) GetFrontmatterCategories() []string {
	if len(p.Frontmatter) == 0 {
		return nil
	}
	var fm map[string]interface{}
	if err := json.Unmarshal(p.Frontmatter, &fm); err != nil {
		return nil
	}
	raw, ok := fm["categories"]
	if !ok || raw == nil {
		return nil
	}
	var result []string
	seen := make(map[string]bool)
	switch v := raw.(type) {
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok {
				trimmed := strings.TrimSpace(s)
				lower := strings.ToLower(trimmed)
				if trimmed != "" && !seen[lower] {
					seen[lower] = true
					result = append(result, trimmed)
				}
			}
		}
	case []string:
		for _, s := range v {
			trimmed := strings.TrimSpace(s)
			lower := strings.ToLower(trimmed)
			if trimmed != "" && !seen[lower] {
				seen[lower] = true
				result = append(result, trimmed)
			}
		}
	}
	return result
}

func (p *Page) SetFrontmatterCategories(cats []string) {
	var fm map[string]interface{}
	if len(p.Frontmatter) > 0 {
		_ = json.Unmarshal(p.Frontmatter, &fm)
	}
	if fm == nil {
		fm = make(map[string]interface{})
	}
	clean := make([]string, 0, len(cats))
	seen := make(map[string]bool)
	for _, c := range cats {
		trimmed := strings.TrimSpace(c)
		lower := strings.ToLower(trimmed)
		if trimmed != "" && !seen[lower] {
			seen[lower] = true
			clean = append(clean, trimmed)
		}
	}
	fm["categories"] = clean
	if b, err := json.Marshal(fm); err == nil {
		p.Frontmatter = datatypes.JSON(b)
	}
	p.Categories = clean
}

func (p *Page) AfterFind(tx *gorm.DB) error {
	p.Categories = p.GetFrontmatterCategories()
	if p.Categories == nil {
		p.Categories = []string{}
	}
	return nil
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
