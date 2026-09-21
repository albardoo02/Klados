package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// OAuthRelayTicket represents a short-lived (60s), single-use token for cross-domain OAuth relay.
type OAuthRelayTicket struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID       uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	TargetDomain string    `gorm:"not null" json:"target_domain"`
	Token        string    `gorm:"type:text;not null" json:"token"`
	ExpiresAt    time.Time `gorm:"not null;index" json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
}

func (t *OAuthRelayTicket) BeforeCreate(tx *gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return nil
}
