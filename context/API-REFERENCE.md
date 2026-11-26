# 🔌 QUETTABYTE COIN (QBC) — REST API SPECIFICATION
*Production API Reference for AI Assistants, Bots, and Client Integrations*

**Base URL (Live Testnet):** `https://quettabyte-core.circuitminds.workers.dev`  
**Protocol Version:** `QUETTABYTE_CANONICAL_DAG_V1`

---

## 1. PUBLIC LEDGER & NODE VITALS

### `GET /health`
Returns the operational status of the stateless Edge Gate.
* **Response (200 OK):**
```json
{
  "status": "online",
  "service": "Quettabyte Coin (QBC) Stateless Edge Gate (Layer 1)",
  "timestamp": 1795404470
}
```

### `GET /api/stats`
Returns global network telemetry, active wallets, total transactions, and chain head.
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "total_wallets": 4,
    "total_transactions": 2,
    "total_volume_micro": "20000000",
    "block_height": 2,
    "chain_head": "80f5bf1e15cc48151d75e7a9b0aa7abb8ea390970eb7c849c436f2f9f0db8dda",
    "last_settled_epoch": 12,
    "active_tickets_in_epoch": 0
  }
}
```

### `GET /api/ledger/latest`
Returns the recent 50 transactions, current block height, and current chain head.

### `GET /api/ledger/export`
Exports the entire canonical DAG history (wallets, transactions, epochs, Bitcoin OTS proofs) for independent cryptographic audit and disaster recovery replay.

---

## 2. WALLET & BALANCE ENDPOINTS

### `GET /api/wallet/:address`
Returns balance, monotonic nonce, last mining ticket, and Sybil trust tier.
* **Parameters:** `:address` (64-char lowercase hex Ed25519 public key)
* **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "address": "bd8c6e4554c635aefa8758949f7e37d139487b713be93f1dc8e565a29cece5c1",
    "balance_micro": "10000000",
    "nonce": 1,
    "last_ticket": 0,
    "sybil_score": 25,
    "tier": 1
  }
}
```

### `GET /api/history/:address`
Returns all incoming and outgoing transactions for a specified wallet.

---

## 3. TRANSACTION & BATCH ROLLUP ENDPOINTS

### `POST /api/tx`
Submits a single signed transfer.
* **Headers:** `Content-Type: application/json`
* **Request Body:**
```json
{
  "payload": {
    "type": "TRANSFER",
    "sender": "64_char_hex_public_key",
    "receiver": "64_char_hex_public_key",
    "amount_micro": "5000000",
    "fee_micro": "0",
    "nonce": 0,
    "prev_hash": "64_char_hex_current_chain_head",
    "timestamp": 1795405000
  },
  "signature": "128_char_hex_ed25519_signature",
  "micro_pow": {
    "salt": "optional_hex_salt",
    "nonce": 142
  }
}
```
* **Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "tx_hash": "80f5bf1e...",
    "prev_hash": "current_head",
    "block_height": 3,
    "sender": "sender_address",
    "new_balance_micro": "5000000",
    "tokens_remaining": 4
  }
}
```
* **Concurrency Collision (`409 Conflict`):**
```json
{
  "success": false,
  "error": "Stale prev_hash. Chain head has moved. Current head: abc123...",
  "current_head": "abc123..."
}
```
*(Clients automatically re-sign with `current_head` and retry).*

* **Rate Limit Burst Exhausted (`429 Too Many Requests`):**
```json
{
  "success": false,
  "error": "Rate limit burst exhausted. Micro-PoW challenge required.",
  "requires_micro_pow": true,
  "challenge": {
    "salt": "a4f8b91c...",
    "difficulty": "0000"
  }
}
```

---

### `POST /api/transfer/batch` (or `POST /api/tx/batch`)
Executes an atomic micro-rollup of up to 100 signed transactions in a single SQLite disk write.
* **Request Body:**
```json
{
  "transactions": [
    {
      "payload": { ... },
      "signature": "..."
    },
    {
      "payload": { ... },
      "signature": "..."
    }
  ]
}
```
* **Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "total_in_batch": 2,
    "processed": 2,
    "new_chain_head": "def456...",
    "new_block_height": 5,
    "results": [
      { "tx_hash": "...", "success": true },
      { "tx_hash": "...", "success": true }
    ]
  }
}
```

---

## 4. MINING & IDENTITY

### `POST /api/mine/submit`
Submits a proof-of-work ticket or a Cuckoo Cycle graph solution.
* **Cuckoo Cycle Submission:**
```json
{
  "address": "64_char_hex_public_key",
  "ticket": 1,
  "nonce": 4209,
  "cycle": [12, 45, 98, 120, 240, 310, 480, 612, 790, 840, 920, 1011]
}
```

### `POST /api/faucet`
Developer testnet faucet providing 10 test coins (24-hour rate limit per address).
```json
{
  "address": "64_char_hex_public_key",
  "amount_micro": 10000000
}
```

---

### `POST /api/identity/link`
Links a cryptographically verified human or developer identity to advance the wallet's Sybil Trust Score (0-100) and unlock daily transfer tiers without storing any PII.
* **Supported Providers:**
  * `TURNSTILE`: Cloudflare Turnstile token (`token: "..."`) -> **+25 pts**
  * `PASSKEY`: WebAuthn hardware credential ID (`credential_id: "..."`) -> **+30 pts**
  * `GOOGLE`: Google Identity Services ID Token JWT (`token: "..."`) -> **+25 pts**
  * `GITHUB`: 0-scope GitHub token (`token: "..."`) OR Public Gist (`username: "...", gist_id: "..."`) -> **+25 pts**
  * `DISCORD`: Discord OAuth2 access token (`token: "..."`) -> **+25 pts**
  * `TELEGRAM`: Telegram Bot verification token / auth data -> **+25 pts**

* **Request Example (Google JWT):**
```json
{
  "address": "64_char_hex_public_key",
  "provider": "GOOGLE",
  "token": "eyJhbGciOiJSUzI1NiIs..."
}
```

* **Success Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "address": "64_char_hex_public_key",
    "provider": "GOOGLE",
    "points_added": 25,
    "sybil_score": 55,
    "tier": 2,
    "tier_name": "Verified Citizen (Tier 2)",
    "daily_limit": "50 transfers/day",
    "verifications": ["TURNSTILE", "PASSKEY", "GOOGLE"]
  }
}
```

* **1 Device / 1 Account = 1 Wallet Rejection (`409 Conflict`):**
```json
{
  "success": false,
  "error": "This device / identity is already bound to a wallet. 1 device/account = 1 wallet."
}
```
