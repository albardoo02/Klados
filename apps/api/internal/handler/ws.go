package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for WebSocket connections
	},
}

type WSMessage struct {
	Type      string          `json:"type"` // "join", "leave", "edit", "cursor", "ping", "pong"
	PageID    string          `json:"page_id,omitempty"`
	UserID    string          `json:"user_id,omitempty"`
	UserName  string          `json:"user_name,omitempty"`
	Content   string          `json:"content,omitempty"`
	Cursor    interface{}     `json:"cursor,omitempty"`
	Version   int             `json:"version,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
	Timestamp int64           `json:"timestamp,omitempty"`
	Count     int             `json:"count,omitempty"`
}

type WSClient struct {
	Hub      *WSHub
	Conn     *websocket.Conn
	Send     chan []byte
	PageID   string
	UserID   string
	UserName string
}

type wsRoomMessage struct {
	pageID       string
	sender       *WSClient
	message      []byte
	excludeSender bool
}

type WSHub struct {
	rooms      map[string]map[*WSClient]bool
	register   chan *WSClient
	unregister chan *WSClient
	broadcast  chan wsRoomMessage
	mu         sync.RWMutex
}

func NewWSHub() *WSHub {
	return &WSHub{
		rooms:      make(map[string]map[*WSClient]bool),
		register:   make(chan *WSClient),
		unregister: make(chan *WSClient),
		broadcast:  make(chan wsRoomMessage, 256),
	}
}

func (h *WSHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if _, ok := h.rooms[client.PageID]; !ok {
				h.rooms[client.PageID] = make(map[*WSClient]bool)
			}
			h.rooms[client.PageID][client] = true
			count := len(h.rooms[client.PageID])
			h.mu.Unlock()

			// Broadcast user join event to everyone in the room
			joinMsg, _ := json.Marshal(WSMessage{
				Type:      "join",
				PageID:    client.PageID,
				UserID:    client.UserID,
				UserName:  client.UserName,
				Timestamp: time.Now().UnixMilli(),
				Count:     count,
			})
			h.broadcastMessage(client.PageID, client, joinMsg, false)

		case client := <-h.unregister:
			h.mu.Lock()
			if clients, ok := h.rooms[client.PageID]; ok {
				if _, exists := clients[client]; exists {
					delete(clients, client)
					close(client.Send)
					count := len(clients)
					if count == 0 {
						delete(h.rooms, client.PageID)
					}
					h.mu.Unlock()

					// Broadcast user leave event to remaining clients in the room
					leaveMsg, _ := json.Marshal(WSMessage{
						Type:      "leave",
						PageID:    client.PageID,
						UserID:    client.UserID,
						UserName:  client.UserName,
						Timestamp: time.Now().UnixMilli(),
						Count:     count,
					})
					h.broadcastMessage(client.PageID, nil, leaveMsg, false)
					continue
				}
			}
			h.mu.Unlock()

		case msg := <-h.broadcast:
			h.broadcastMessage(msg.pageID, msg.sender, msg.message, msg.excludeSender)
		}
	}
}

func (h *WSHub) broadcastMessage(pageID string, sender *WSClient, msg []byte, excludeSender bool) {
	h.mu.RLock()
	clients, ok := h.rooms[pageID]
	if !ok {
		h.mu.RUnlock()
		return
	}
	// Copy slice of clients to avoid holding lock during send
	clientList := make([]*WSClient, 0, len(clients))
	for c := range clients {
		if excludeSender && c == sender {
			continue
		}
		clientList = append(clientList, c)
	}
	h.mu.RUnlock()

	for _, client := range clientList {
		select {
		case client.Send <- msg:
		default:
			h.mu.Lock()
			delete(h.rooms[pageID], client)
			close(client.Send)
			h.mu.Unlock()
		}
	}
}

func (h *WSHub) GetRoomClientCount(pageID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if clients, ok := h.rooms[pageID]; ok {
		return len(clients)
	}
	return 0
}

func (h *WSHub) BroadcastToRoom(pageID string, msg WSMessage) {
	data, err := json.Marshal(msg)
	if err == nil {
		h.broadcast <- wsRoomMessage{
			pageID:        pageID,
			sender:        nil,
			message:       data,
			excludeSender: false,
		}
	}
}

func (c *WSClient) ReadPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(65536)
	_ = c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		_ = c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("websocket read error: %v", err)
			}
			break
		}

		var wsMsg WSMessage
		if err := json.Unmarshal(message, &wsMsg); err != nil {
			continue
		}

		// Ensure identity & room
		wsMsg.PageID = c.PageID
		if wsMsg.UserID == "" {
			wsMsg.UserID = c.UserID
		}
		if wsMsg.UserName == "" {
			wsMsg.UserName = c.UserName
		}
		if wsMsg.Timestamp == 0 {
			wsMsg.Timestamp = time.Now().UnixMilli()
		}

		encoded, err := json.Marshal(wsMsg)
		if err != nil {
			continue
		}

		// Broadcast edits and cursor movements to other clients on the same page
		c.Hub.broadcast <- wsRoomMessage{
			pageID:        c.PageID,
			sender:        c,
			message:       encoded,
			excludeSender: true,
		}
	}
}

func (c *WSClient) WritePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			if _, err := w.Write(message); err != nil {
				return
			}
			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

type WSHandler struct {
	Hub *WSHub
}

func NewWSHandler(hub *WSHub) *WSHandler {
	return &WSHandler{Hub: hub}
}

func (h *WSHandler) HandlePageWS(c *gin.Context) {
	pageID := c.Param("id")
	if pageID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "page id required"})
		return
	}

	userID := c.Query("user_id")
	if userID == "" {
		// Try from context if authenticated
		if uid := c.GetString("user_id"); uid != "" {
			userID = uid
		} else {
			userID = uuid.New().String()
		}
	}

	userName := c.Query("user_name")
	if userName == "" {
		userName = "Anonymous"
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("failed to upgrade websocket: %v", err)
		return
	}

	client := &WSClient{
		Hub:      h.Hub,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		PageID:   pageID,
		UserID:   userID,
		UserName: userName,
	}

	h.Hub.register <- client

	go client.WritePump()
	go client.ReadPump()
}
