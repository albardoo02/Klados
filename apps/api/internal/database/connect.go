package database

import (
	"database/sql"
	"log"
	"time"

	"github.com/klados/api/internal/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(cfg *config.Config) (*gorm.DB, error) {
	logLevel := logger.Silent
	if cfg.Environment == "development" {
		logLevel = logger.Info
	}

	var db *gorm.DB
	var err error

	for attempt := 1; attempt <= 15; attempt++ {
		db, err = gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
			Logger: logger.Default.LogMode(logLevel),
		})
		if err == nil {
			var sqlDB *sql.DB
			sqlDB, err = db.DB()
			if err == nil {
				if err = sqlDB.Ping(); err == nil {
					sqlDB.SetMaxOpenConns(25)
					sqlDB.SetMaxIdleConns(5)
					return db, nil
				}
			}
		}

		if attempt < 15 {
			log.Printf("Waiting for database connection (attempt %d/15)...: %v", attempt, err)
			time.Sleep(2 * time.Second)
		}
	}

	return nil, err
}