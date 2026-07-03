package ws

import (
	"encoding/json"
	"sync"

	"github.com/gofiber/contrib/websocket"
	"go.uber.org/zap"
)

type TxEvent struct {
	Type      string  `json:"type"`
	TxHash    string  `json:"tx_hash"`
	Timestamp int64   `json:"timestamp"`
	TxType    string  `json:"tx_type"`
	PoolID    string  `json:"pool_id"`
	Sender    string  `json:"sender"`
	Amount0   string  `json:"amount0"`
	Amount1   string  `json:"amount1"`
	USDValue  float64 `json:"usd_value"`
}

type Client struct {
	conn    *websocket.Conn
	address string
	send    chan []byte
}

type Hub struct {
	mu         sync.RWMutex
	clients    map[string]map[*Client]bool
	broadcast  chan TxEvent
	register   chan *Client
	unregister chan *Client
}

var defaultHub = &Hub{
	clients:    make(map[string]map[*Client]bool),
	broadcast:  make(chan TxEvent, 256),
	register:   make(chan *Client),
	unregister: make(chan *Client),
}

func GetHub() *Hub {
	return defaultHub
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if h.clients[client.address] == nil {
				h.clients[client.address] = make(map[*Client]bool)
			}
			h.clients[client.address][client] = true
			h.mu.Unlock()
			zap.L().Info("WebSocket client connected", zap.String("address", client.address))

		case client := <-h.unregister:
			h.mu.Lock()
			if clients, ok := h.clients[client.address]; ok {
				delete(clients, client)
				if len(clients) == 0 {
					delete(h.clients, client.address)
				}
			}
			close(client.send)
			h.mu.Unlock()
			zap.L().Info("WebSocket client disconnected", zap.String("address", client.address))

		case event := <-h.broadcast:
			data, err := json.Marshal(event)
			if err != nil {
				zap.L().Error("Failed to marshal tx event", zap.Error(err))
				continue
			}

			h.mu.RLock()
			for _, clients := range h.clients {
				for client := range clients {
					select {
					case client.send <- data:
					default:
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) BroadcastEvent(txHash, sender, txType, poolID, amount0, amount1 string, usdValue float64, timestamp int64) {
	event := TxEvent{
		Type:      "tx",
		TxHash:    txHash,
		Timestamp: timestamp,
		TxType:    txType,
		PoolID:    poolID,
		Sender:    sender,
		Amount0:   amount0,
		Amount1:   amount1,
		USDValue:  usdValue,
	}
	select {
	case h.broadcast <- event:
	default:
		zap.L().Warn("WebSocket broadcast channel full, dropping event")
	}
}

func (h *Hub) HandleWebSocket(c *websocket.Conn) {
	address := c.Query("address")
	if address == "" {
		c.Close()
		return
	}

	client := &Client{
		conn:    c,
		address: address,
		send:    make(chan []byte, 128),
	}

	h.register <- client

	go func() {
		for msg := range client.send {
			if err := c.WriteMessage(websocket.TextMessage, msg); err != nil {
				break
			}
		}
	}()

	for {
		_, _, err := c.ReadMessage()
		if err != nil {
			break
		}
	}

	h.unregister <- client
}
