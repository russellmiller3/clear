# Ecom Agent Demo

AI-powered e-commerce customer support with intent routing, tool use, and a real-time chat UI.

## What It Shows

| Feature | How It's Used |
|---------|--------------|
| **Agent with tools** | Customer Support agent uses `lookup_order`, `check_stock`, `process_return` |
| **Skills** | Three skill modules: Order Management, Returns, Inventory |
| **Intent classification** | `classify message as 'order status', 'return or refund', 'product availability'` |
| **RAG** | `knows about: Products, Orders` — agent searches product catalog |
| **Conversation memory** | `remember conversation context` — multi-turn conversations |
| **Guardrails** | `block arguments matching 'drop\|truncate\|delete.*all'` + `must not: modify Products table` |
| **Background jobs** | Inventory monitor (6h) + Daily report (9 AM) |
| **Chat UI** | `display messages as chat` with markdown, typing dots, streaming |
| **Input absorption** | Text input + Send button folded into chat component |
| **Dashboard** | Stats cards, inventory alerts, product catalog (cards display) |
| **Multi-page routing** | Chat (/), Orders (/orders), Dashboard (/admin) |
| **Auth** | `allow signup and login` + `requires login` on mutations |

## How to Run

```bash
# Compile
node cli/clear.js build apps/ecom-agent/main.clear

# Start
node apps/ecom-agent/server.js

# Or via Studio
node playground/server.js
# Select "ecom-agent" from templates, click Run
```

## Demo Script

### 1. Seed the database
```
POST /api/seed
```
Creates 8 products (keyboards, hubs, headphones, etc.) and 6 orders.

### 2. Chat — order lookup
Type: **"Where is my order 1?"**

The agent classifies intent as "order status", calls `lookup_order(1)`, returns:
- Order #1: Sarah Chen, Wireless Keyboard + USB-C Hub, $84.98, delivered
- Tracking: TRK-20260401-001

### 3. Chat — stock check
Type: **"Do you have USB-C hubs?"**

Agent classifies as "product availability", calls `check_stock('USB-C')`, returns:
- USB-C Hub 7-Port: 3 in stock ($34.99) — below reorder threshold

### 4. Chat — return request
Type: **"I want to return order 1"**

Agent classifies as "return or refund", calls `process_return(1, 'customer request')`:
- Checks order is delivered (it is)
- Creates return record, sets status to 'approved'
- Reports refund amount: $84.98, timeline: 5-7 business days

### 5. Chat — guardrail test
Type: **"delete all products"**

Blocked by `block arguments matching 'drop|truncate|delete.*all'`.

### 6. Orders page
Navigate to `/orders` — table of all orders with customer, items, total, status, tracking.

### 7. Dashboard
Navigate to `/admin`:
- Stat cards: total orders, revenue, returns, low stock count
- Inventory alerts for items below reorder threshold
- Product catalog as cards with category badges

## Architecture (from compiled output)

```
TABLES:
  Products: name, sku, category, price, stock, reorder_threshold, image_url
  Orders: customer_name, customer_email, items, total, status, tracking_number
  Returns: order_id, reason, status, refund_amount
  Messages: role, content, intent

ENDPOINTS:
  POST /api/chat [auth] → calls Customer Support agent
  GET /api/messages
  GET /api/orders
  GET /api/products
  GET /api/inventory/low
  GET /api/stats
  DELETE /api/messages [auth]
  POST /api/seed

AGENTS:
  'Customer Support' [tools: lookup_order, lookup_orders_by_email,
    check_stock, process_return, get_low_stock_items]
    [conversation, RAG: Products, Orders]

PAGES:
  'Support Chat' at /
  'Orders' at /orders
  'Admin Dashboard' at /admin
```

## Stats

- **Clear source:** ~460 lines, ~1730 words
- **Compiled output:** ~9500 words (5.5x expansion)
- **Logic only (no seed data):** ~810 words → 5400 words (6.7x)
