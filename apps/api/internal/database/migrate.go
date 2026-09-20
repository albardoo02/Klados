package database

import (
	"github.com/klados/api/internal/model"
	"gorm.io/gorm"
)

func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&model.User{},
		&model.OAuthAccount{},
		&model.Site{},
		&model.Page{},
		&model.PageVersion{},
		&model.MediaFile{},
		&model.PageView{},
		&model.Comment{},
		&model.APIKey{},
		&model.SiteMember{},
		&model.PageCategory{},
	)
}
