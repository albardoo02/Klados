package database

import (
	"log"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// InitRootUser checks environment variables ROOT_PASSWORD, ROOT_EMAIL, ROOT_USERNAME
// If ROOT_PASSWORD is provided, it sets/resets the root user's password so administrators
// cannot be locked out of self-hosted environments.
func InitRootUser(db *gorm.DB) {
	rootPass := strings.TrimSpace(os.Getenv("ROOT_PASSWORD"))
	rootEmail := strings.TrimSpace(os.Getenv("ROOT_EMAIL"))
	rootUsername := strings.TrimSpace(os.Getenv("ROOT_USERNAME"))

	if rootPass == "" && rootEmail == "" && rootUsername == "" {
		return
	}

	var user model.User
	found := false

	if rootEmail != "" {
		if err := db.Where("LOWER(email) = ?", strings.ToLower(rootEmail)).First(&user).Error; err == nil {
			found = true
		}
	}
	if !found && rootUsername != "" {
		if err := db.Where("LOWER(username) = ?", strings.ToLower(rootUsername)).First(&user).Error; err == nil {
			found = true
		}
	}
	if !found {
		// Try finding the first root user in the system
		if err := db.Where("is_root = ?", true).First(&user).Error; err == nil {
			found = true
		}
	}

	if found {
		user.IsRoot = true
		user.EmailVerified = true
		if rootPass != "" {
			hashed, err := bcrypt.GenerateFromPassword([]byte(rootPass), bcrypt.DefaultCost)
			if err == nil {
				passStr := string(hashed)
				user.Password = &passStr
			}
		}
		if err := db.Save(&user).Error; err == nil {
			log.Printf("[InitRootUser] Root user '%s' (%s) synchronized from environment variables", user.Username, user.Email)
		}
	} else if rootPass != "" {
		// If user doesn't exist yet, create initial root account
		if rootEmail == "" {
			rootEmail = "admin@klados.app"
		}
		if rootUsername == "" {
			rootUsername = "admin"
		}
		hashed, err := bcrypt.GenerateFromPassword([]byte(rootPass), bcrypt.DefaultCost)
		if err == nil {
			passStr := string(hashed)
			newUser := model.User{
				ID:            uuid.New(),
				Email:         rootEmail,
				Username:      rootUsername,
				DisplayName:   "Administrator",
				Password:      &passStr,
				IsRoot:        true,
				EmailVerified: true,
			}
			if err := db.Create(&newUser).Error; err == nil {
				log.Printf("[InitRootUser] Created initial root administrator: %s (%s)", newUser.Username, newUser.Email)
			}
		}
	}
}
