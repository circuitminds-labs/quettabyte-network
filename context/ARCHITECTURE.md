# 🏛️ QUETTABYTE COIN (QBC) — SYSTEM ARCHITECTURE
*Comprehensive Technical Blueprint for AI Models & Protocol Engineers*

---

## 1. 🌐 HIGH-LEVEL ARCHITECTURAL DIAGRAM

```
[ Discord Bot Webhook ]    [ Telegram Mini-App ]    [ Web Wallet & Explorer ]    [ Community Miners ]
          │                          │                          │                        │
          └──────────────────────────┴─────────────┬────────────┴────────────────────────┘
                                                   │ Direct HTTPS Requests
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: STATELESS EDGE GATE (Cloudflare Worker: `quettabyte-core`)                              │
│ • Cloudflare WAF & IP Rate Limiting (60 req/min per IP to prevent DDoS)                          │
│ • Cloudflare Turnstile human verification gate (anti-bot challenge)                             │
│ • Ed25519 Webhook signature authentication for Discord / Telegram interactions                  │
│ • Automated Client Micro-Proof-of-Work verifier (<0.1 ms CPU) for burst traffic bypass          │
│ • Static UI Delivery: In-memory compiled HTML/JS delivery (`/`, `/wallet`, `/explorer`)          │
└────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                 │ Internal Serialized DO RPC
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: ATOMIC STATE SEQUENCER (Single SQLite Durable Object: `SequencerDO`)                   │
│ • Single-Threaded Actor Model: Eliminates all race conditions, locks, and double-spend attacks  │
│ • SQLite Monotonic State: Wallets, Balances, Nonces, and the Canonical SHA-256 Hash Chain       │
│ • QuettaBatch Micro-Rollup Engine: Multi-tx atomic commits (`/api/transfer/batch`)               │
│   (Commits up to 100 txs in 1 disk sync -> allows millions of txs under 100k DO write cap)      │
│ • In-Memory Sliding Token Bucket: 5 feeless txs burst per user; refill: 1 per 2 minutes         │
│ • Asymmetric Tier Engine: Tier 0 Ghost Wallets (outbound locked) -> Tiers 1-3 daily velocity cap│
│ • Lazy Merkle Claim Engine: Hourly mining rewards stored as 1 root/hour (strictly 24 writes/day)│
└────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                 │ Hourly Scheduled Event (`0 * * * *`)
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: PUBLIC WITNESSES & IMMUTABLE ANCHORS                                                   │
│ • Cloudflare Cron Trigger: Wakes automatically once every 60 minutes                            │
│ • Bitcoin OpenTimestamps (OTS): Submits epoch Merkle root to Bitcoin calendar servers ($0)      │
│ • GitHub Actions CI Witness: Runs independent Python audit and commits verified JSONL snapshot   │
│ • Git-as-a-Blockchain: Public GitHub repo acts as cloneable, immutable ledger mirror            │
│ • Instant Disaster Recovery: 100% of SQLite state can be replayed from Git DAG commits          │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. ⚡ LAYER 1: STATELESS EDGE GATE (`src/index.ts`)

The Edge Worker acts as the first line of defense before requests reach the stateful Durable Object:
1. **Sub-Millisecond Routing:** Routes public endpoints (`/health`, `/api/*`) and serves the embedded Web Wallet UI (`src/ui.ts`).
2. **Stateless Edge WAF:** Tracks IP request rates in worker RAM (`edgeIpBuckets`) and blocks spam bursts exceeding 60 POSTs/min per IP before they burn database compute.
3. **Turnstile Human Shield:** Optionally intercepts sensitive endpoints (`/api/faucet`, `/api/tx`) to verify Cloudflare Turnstile tokens, filtering out headless botnets at the DNS edge.
4. **Single-Threaded Forwarding:** Forwards all ledger operations to a global singleton Durable Object (`env.SEQUENCER.idFromName('QUETTABYTE_PRIMARY_SEQUENCER')`).

---

## 3. 🗄️ LAYER 2: ATOMIC STATE SEQUENCER (`src/sequencer.ts`)

State is managed by a single Cloudflare SQLite-backed Durable Object. Because Durable Objects process messages sequentially in a single-threaded queue:
* **Zero Race Conditions:** Two transactions cannot execute simultaneously.
* **Zero Mutex Locks Required:** Nonce increments and balance deductions are strictly atomic.
* **Instant Finality:** Transactions achieve consensus the moment they are appended to the SQLite hash chain (<15ms latency).

### SQLite Schema:
```sql
CREATE TABLE IF NOT EXISTS wallets (
  address TEXT PRIMARY KEY,             -- Hex Ed25519 Public Key (64 chars)
  balance_micro INTEGER NOT NULL DEFAULT 0 CHECK (balance_micro >= 0),
  nonce INTEGER NOT NULL DEFAULT 0,     -- Replay protection counter
  last_ticket INTEGER NOT NULL DEFAULT 0, -- Monotonic mining ticket counter
  sybil_score INTEGER NOT NULL DEFAULT 0, -- Stacked trust score (0 to 100)
  tier INTEGER NOT NULL DEFAULT 0       -- 0: Ghost, 1: Casual, 2: Citizen, 3: Guardian
);

CREATE TABLE IF NOT EXISTS transactions (
  tx_hash TEXT PRIMARY KEY,             -- SHA-256 of canonical payload
  prev_hash TEXT NOT NULL,              -- Link to preceding transaction or genesis
  tx_type TEXT NOT NULL,                -- 'TRANSFER' | 'MINT' | 'BURN' | 'CLAIM'
  sender TEXT NOT NULL,
  receiver TEXT NOT NULL,
  amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
  fee_micro INTEGER NOT NULL DEFAULT 0,
  signature TEXT NOT NULL,              -- Ed25519 signature
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS epochs (
  epoch_id INTEGER PRIMARY KEY,
  merkle_root TEXT NOT NULL,            -- Root of all transactions and claims in epoch
  payout_merkle_root TEXT NOT NULL,     -- Root of miner lazy claim tree
  drand_round INTEGER NOT NULL,
  ots_proof TEXT,                       -- Bitcoin OpenTimestamps binary hex
  ots_status TEXT DEFAULT 'PENDING'     -- 'PENDING' -> 'CONFIRMED'
);

CREATE TABLE IF NOT EXISTS system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## 4. 🚀 THE QUETTABATCH ROLLUP ENGINE (SCALING TO LAKHS OF TRANSACTIONS)

### The Cloudflare Write Budget Constraint:
* Cloudflare Durable Object Free Tier provides **100,000 write operations per day**.
* A single transfer updating sender balance, receiver balance, transaction log, and chain head takes 4–6 SQL statements.
* If 100,000 transfers occur individually, 400,000 writes are attempted, crashing the system with quota errors.

### The QuettaBatch Solution:
1. **Atomic Multi-Tx Rollup (`POST /api/transfer/batch`):**
   * Accepts up to 100 signed transactions in a single payload.
   * Executes validation in WebCrypto memory (<0.05ms per tx).
   * Commits all balance transfers and transaction insertions inside a single atomic SQLite block:
     ```sql
     BEGIN TRANSACTION;
     -- Batch updates for all transfers...
     UPDATE system_state SET value = ? WHERE key = 'chain_head';
     COMMIT;
     ```
   * **100 transactions = 1 SQLite disk sync.**
   * 100,000 transactions require only **1,000 to 2,000 SQLite writes** (~2% of the daily allowance)!

2. **Concurrency Relinking (`HTTP 409` Auto-Retry):**
   * If two users submit payments at the exact same millisecond, the first transaction updates `chain_head`.
   * The second transaction receives `HTTP 409 Conflict` with `{ current_head: "..." }`.
   * The client Web Wallet catches this error, updates `prev_hash`, re-signs in 0.05ms with WebCrypto, and resubmits automatically up to 3 times. Users never experience failed payments due to network collisions.

---

## 5. 🛡️ ASYMMETRIC IDENTITY TIERS & GHOST WALLETS

To prevent botnet sybil floods while preserving frictionless user onboarding:

| Tier | Name | How to Unlock | Receiving Rules | Sending Rules | Daily Transfer Limit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **0** | **Ghost Wallet** | Default on key generation (0-KYC) | **Unrestricted** (Can receive unlimited payments) | **Locked** (Outbound transfers blocked) | 0 transfers/day |
| **1** | **Casual Citizen**| Cloudflare Turnstile human pass | Unrestricted | Feeless transfers enabled | 10 transfers/day |
| **2** | **Verified Citizen**| Link Discord or Telegram (Carrier Phone HMAC) | Unrestricted | Feeless transfers enabled | 50 transfers/day |
| **3** | **Guardian** | WebAuthn Passkey (Hardware Biometrics) | Unrestricted | Feeless transfers enabled | **Unlimited** |

---

## 6. ⛏️ CUCKOO CYCLE MINING ENGINE (`src/cuckoo.ts`)

Instead of energy-wasteful SHA-256 hash grinding, Quettabyte Coin uses **Cuckoo Cycle (Cuckatoo-style)** memory-bound graph cycle detection:
* **Algorithm:** SipHash-2-4 edge generation over a bipartite graph ($N = 2^{12} = 4096$ nodes, 12-edge cycles).
* **Salted Graph:** Salted with `wallet_address + ticket_counter`.
* **Sub-Millisecond Verification:** Verification on Cloudflare Worker takes `<0.15ms CPU`, well within the 10ms limit.
* **Reward:** Successfully finding a 12-edge cycle awards 1.0 QBC (vs 0.5 QBC for basic proof-of-work).

---

## 7. 🤖 SERVERLESS BOT ARCHITECTURE (DISCORD & TELEGRAM)

* **Zero Hosting Cost:** Bots run as stateless webhooks on Cloudflare Workers (0 CPU when idle).
* **Discord Integration:** Handled via Discord Interactions API (`/api/discord/interactions`) with Ed25519 signature verification.
* **Telegram Integration:** Handled via Telegram Webhooks (`/api/telegram/webhook`) with `HMAC-SHA256(phone, secret)` zero-PII verification.
* **Off-Chain Tipping Vouchers:** For high-volume server chat tipping, bots aggregate user-signed vouchers and flush them in 60-second batch rollups via `/api/transfer/batch`, consuming almost zero database writes.
