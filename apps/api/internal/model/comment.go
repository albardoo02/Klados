package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Comment struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	PageID     uuid.UUID  `gorm:"type:uuid;index;not null" json:"page_id"`
	UserID     *uuid.UUID `gorm:"type:uuid;index" json:"user_id"`
	AuthorName string     `gorm:"not null" json:"author_name"`
	Content    string     `gorm:"type:text;not null" json:"content"`
	CreatedAt  time.Time  `json:"created_at"`
	Page       Page       `gorm:"foreignKey:PageID" json:"-"`
	User       *User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (c *Comment) BeforeCreate(tx *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}
