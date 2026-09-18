package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/klados/api/internal/model"
	"gorm.io/gorm"
)

type CommentHandler struct {
	DB *gorm.DB
}

type createCommentRequest struct {
	Content    string `json:"content" binding:"required"`
	AuthorName string `json:"author_name"`
}

type createPublicCommentRequest struct {
	Content    string `json:"content" binding:"required"`
	AuthorName string `json:"author_name"`
}

// List comments for a page (authenticated)
func (h *CommentHandler) List(c *gin.Context) {
	pageID := c.Param("id")

	var page model.Page
	if err := h.DB.Where("id = ? AND deleted_at IS NULL", pageID).First(&page).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	var comments []model.Comment
	if err := h.DB.Where("page_id = ?", page.ID).Order("created_at asc").Find(&comments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": comments})
}

// Create comment for a page as authenticated user
func (h *CommentHandler) Create(c *gin.Context) {
	pageID := c.Param("id")
	userIDStr := c.GetString("user_id")
	userUID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var page model.Page
	if err := h.DB.Where("id = ? AND deleted_at IS NULL", pageID).First(&page).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return
	}

	var req createCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	authorName := strings.TrimSpace(req.AuthorName)
	if authorName == "" {
		var user model.User
		if err := h.DB.Where("id = ?", userUID).First(&user).Error; err == nil {
			if user.DisplayName != "" {
				authorName = user.DisplayName
			} else {
				authorName = user.Username
			}
		} else {
			authorName = "Authenticated User"
		}
	}

	comment := &model.Comment{
		PageID:     page.ID,
		UserID:     &userUID,
		AuthorName: authorName,
		Content:    strings.TrimSpace(req.Content),
	}

	if err := h.DB.Create(comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": comment})
}

// Delete comment (authenticated user: author or site owner)
func (h *CommentHandler) Delete(c *gin.Context) {
	commentID := c.Param("id")
	userIDStr := c.GetString("user_id")
	userUID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var comment model.Comment
	if err := h.DB.Where("id = ?", commentID).First(&comment).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "comment not found"})
		return
	}

	// Check if user is author
	isAuthor := comment.UserID != nil && *comment.UserID == userUID

	// Check if user is owner of the site where this page is hosted
	isSiteOwner := false
	if !isAuthor {
		var page model.Page
		if err := h.DB.Where("id = ?", comment.PageID).First(&page).Error; err == nil {
			var site model.Site
			if err := h.DB.Where("id = ? AND user_id = ?", page.SiteID, userUID).First(&site).Error; err == nil {
				isSiteOwner = true
			}
		}
	}

	if !isAuthor && !isSiteOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to delete this comment"})
		return
	}

	if err := h.DB.Delete(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// Helper to resolve public page from slug & pageSlug
func (h *CommentHandler) resolvePublicPage(c *gin.Context) (*model.Site, *model.Page, bool) {
	siteSlug := c.Param("slug")
	rawPageSlug := c.Param("pageSlug")

	// Strip trailing "/comments" or "comments" if present in route catch-all
	clean := strings.Trim(rawPageSlug, "/")
	clean = strings.TrimSuffix(clean, "/comments")
	if clean == "comments" {
		clean = ""
	}

	var site model.Site
	if err := h.DB.Where("slug = ? AND is_public = ?", siteSlug, true).First(&site).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return nil, nil, false
	}

	// Verify site password if protected
	if !CheckSiteAccess(c, &site) {
		return nil, nil, false
	}

	var page model.Page
	var err error
	if clean == "" || clean == "index" {
		err = h.DB.Where("site_id = ? AND slug IN ('index', 'home', '') AND status = ? AND deleted_at IS NULL",
			site.ID, model.PageStatusPublished).Order("position asc, created_at asc").First(&page).Error
		if err != nil {
			err = h.DB.Where("site_id = ? AND status = ? AND deleted_at IS NULL", site.ID, model.PageStatusPublished).
				Order("position asc, created_at asc").First(&page).Error
		}
	} else {
		err = h.DB.Where("site_id = ? AND (slug = ? OR slug = ?) AND status = ? AND deleted_at IS NULL",
			site.ID, clean, "/"+clean, model.PageStatusPublished).First(&page).Error
	}

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "page not found"})
		return nil, nil, false
	}

	return &site, &page, true
}

// List public comments for a page
func (h *CommentHandler) ListPublic(c *gin.Context) {
	_, page, ok := h.resolvePublicPage(c)
	if !ok {
		return
	}

	var comments []model.Comment
	if err := h.DB.Where("page_id = ?", page.ID).Order("created_at asc").Find(&comments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": comments})
}

// Submit public comment for a page
func (h *CommentHandler) CreatePublic(c *gin.Context) {
	_, page, ok := h.resolvePublicPage(c)
	if !ok {
		return
	}

	var req createPublicCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	authorName := strings.TrimSpace(req.AuthorName)
	if authorName == "" {
		authorName = "Guest"
	}

	var userUID *uuid.UUID
	if uidStr := c.GetString("user_id"); uidStr != "" {
		if uid, err := uuid.Parse(uidStr); err == nil {
			userUID = &uid
		}
	}

	comment := &model.Comment{
		PageID:     page.ID,
		UserID:     userUID,
		AuthorName: authorName,
		Content:    strings.TrimSpace(req.Content),
	}

	if err := h.DB.Create(comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true, "data": comment})
}
