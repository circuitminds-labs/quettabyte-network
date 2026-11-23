# 🧠 PROJECT BRAIN & AI AGENT CONTEXT ANCHOR (AGENTS.md)
*Project: Quettabyte Coin (QBC) / Zero-Cost Serverless Cryptographic Ledger (v4 Production)*  
*Owner: Aditya Gusain | Last Updated: November 2026*  
*Brand Identity: Quettabyte Coin [QBC] — Just as Bitcoin represents the fundamental unit of information (the bit, 2⁰), Quettabyte Coin scales digital value to the quetta (10³⁰ bytes), the largest SI magnitude prefix recognized in science.*
*Purpose: Single source of truth for any AI agent (Antigravity, Cursor, Claude Code, Windsurf etc) to prevent hallucination, context drift, or loss of state.*

---

## 1. 🎯 PROJECT VISION & CORE INVARIANTS
- **What is it?** A free-to-run, tamper-evident, non-custodial digital micro-currency operating across Discord, Telegram, Web, and IoT.
- **The Core Constraint:** **100% $0 FOREVER / NO CREDIT CARD REQUIRED**. 
  - Runs entirely on Cloudflare free tier (`workerd`), GitHub (public repo + Pages), and Bitcoin OpenTimestamps.
  - Zero running cost when idle ($0/mo, zero CPU burned). Workers sleep until a request arrives.
- **The Security Premise:** *Tamper-evident, not fully decentralized.* A single operator coordinates state, but a public SHA-256 hash chain, client-side Ed25519 signatures, and hourly Bitcoin OTS Merkle proofs make operator fraud mathematically impossible to hide.
- **Legal Demarcation:** Strictly a **closed-loop utility and reputation point system**. Zero fiat exchange, no cash-out, no real-money trading, avoiding India VDA/PMLA and Discord ToS issues.
- **Fair Launch:** Zero pre-mine. Genesis supply = 0. All coins enter through mining and network contribution.
- **Institutional Naming Standard:** All repositories, packages, cloud services, and files strictly follow clean professional kebab-case (`quettabyte-network`, `quettabyte-core`, `quettabyte-ledger`). Zero random underscores, zero informal slang, zero amateur version suffixes.

---

## 2. 🏛️ ARCHITECTURE OVERVIEW (v4 TARGET)

```
[ Discord / Telegram / Web / IoT ]
                │
                ▼ (Direct HTTPS)
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: Stateless Edge Gate (Cloudflare Worker)            │
│ • Turnstile anti-bot challenge & DNS-layer WAF rate limits  │
│ • Ed25519 webhook signature validation                      │
│ • Commit-and-Sample proof-of-work verification (< 1 ms CPU) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2: Atomic State Sequencer (SQLite Durable Object)     │
│ • Single-threaded execution: eliminates race conditions     │
│ • Lazy Merkle Claims: Epoch payouts stored as 1 root/hour   │
│   (Settlement writes: strictly 24 writes/day, 100k cap safe)│
│ • Monotonic state (nonces, tickets, balances) in SQLite     │
│ • Volatile sliding rate limits in RAM                       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3: Public Witnesses & Anchors                         │
│ • Hourly Cloudflare Cron Trigger                            │
│ • Commits Merkle root to Bitcoin via OpenTimestamps (free)  │
│ • Pushes signed commit to public GitHub repo via REST API   │
│ • Git itself acts as the public, cloneable Merkle DAG ledger│
│ • Static snapshots served free via GitHub Pages CDN         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 🚨 UNRESOLVED CRITICAL ISSUES & APPROVED FIXES (AUDIT v4)

Any AI assisting on this project MUST follow these fixes:

| Issue Found in v3 | Why it Broke | Approved Target Fix (v4) |
| :--- | :--- | :--- |
| **Write Budget Explosion** | 1,000 miners × 24 epochs × 5 writes = 120k writes/day (exceeds 100k DO cap). | **Lazy Merkle Claims:** Epoch settlement writes only 1 Merkle root row/hour (24 writes/day). Balances update on-demand when claimed. |
| **10 ms CPU Wall on Batches** | Verifying 100 shares takes 30 ms (Worker times out). | **Commit-and-Sample:** Submitter commits Merkle root; Worker spot-checks 3 random leaves (< 1 ms CPU). Fraud forfeits batch and bans wallet. |
| **Square-Root Sybil Flaw** | $\sqrt{k \cdot s} > \sqrt{s}$ mathematically rewards splitting into fake wallets. | **Linear Weights + Hard Identity Cap:** 1 share = 1 point; strict cap per verified identity per hour + account maturation tiers. |
| **Memory-Walk Puzzle Defects** | Random cycle lengths; 32MB fits modern L3 caches; unsalted graphs. | **Cuckoo Cycle (Cuckatoo) in WASM:** Salted with `drand_seed + wallet_address + ticket_counter`. Verified in < 0.2 ms. |
| **drand Pairing CPU Limit** | BLS12-381 pairing check takes 20–50 ms in JS (Worker crash). | **Edge Multi-Relay Quorum:** Check Cloudflare internal drand + 1 relay. Full BLS signature verified asynchronously in Python/GitHub Cron. |
| **Durable Object RAM Eviction**| Cloudflare restarts DO; in-memory Maps vanish. | **Two-Tier Storage:** Monotonic state (nonces, balances, tickets) in SQLite; only ephemeral sliding rate limits in RAM. |
| **P2P Privacy / NAT Issues** | WebRTC STUN leaks user IP addresses (breaks Zero-PII). | **HTTPS Direct Authority:** All payments/claims go direct to Worker. P2P is strictly optional for static snapshot CDN distribution. |
| **Encoding Ambiguities** | Plain string concatenation allows length-extension collisions. | **Canonical Tagged Encoding:** `MYCOIN_TX_V1:` length-prefixed encoding. Safe integer ceiling capped at $2^{50}$ micro-units. |
| **Fake Audit Reporting** | Miners return `audit_passed: true` without checking. | **Poisoned Canary Injection:** Server injects 1 bad signature in 100 txs. Miner must identify the poisoned index to claim reward. |
| **Unmined Epochs & Dust** | Unaccounted unmined coins cause uncontrolled supply. | **Unmined Pool Burn:** If no one mines an hour, the 50-coin pool burns. Fractional dust rolls into the next epoch. |
| **Disaster Recovery** | DO corruption causes total ledger loss. | **Git Replay:** Ledger can be 100% reconstructed by replaying signed commits from GitHub. |
| **Frictionless Inbound / Sybil Flood** | Requiring KYC on signup kills virality; 0-KYC allows bot swarms. | **Asymmetric Tiers (Inbound Frictionless, Outbound Gated):** Anyone can receive coins with 0-KYC. Sending/Mining requires stacked Sybil Score (Google/Discord/Telegram phone verify) + Passkey. |

---

## 4. 🗄️ DATABASE SCHEMA (SQLITE DURABLE OBJECT)

```sql
CREATE TABLE wallets (
  address TEXT PRIMARY KEY,             -- Hex Ed25519 Public Key
  balance_micro INTEGER NOT NULL DEFAULT 0 CHECK (balance_micro >= 0),
  nonce INTEGER NOT NULL DEFAULT 0,     -- Replay protection
  last_ticket INTEGER NOT NULL DEFAULT 0, -- Monotonic mining ticket counter
  sybil_score INTEGER NOT NULL DEFAULT 0, -- 0 = Inbound only, 25+ = Tier 1, 50+ = Tier 2, 80+ = Tier 3
  tier INTEGER NOT NULL DEFAULT 0       -- 0: Ghost, 1: Casual, 2: Citizen, 3: Guardian
);

CREATE TABLE identities (
  blinded_hash TEXT PRIMARY KEY,        -- HMAC(OAuth_ID, Server_Secret) -> 1:1 account mapping
  wallet_address TEXT NOT NULL,
  provider TEXT NOT NULL,               -- 'GOOGLE' | 'DISCORD' | 'TELEGRAM_PHONE' | 'GITHUB'
  created_at INTEGER NOT NULL
);

CREATE TABLE transactions (
  tx_hash TEXT PRIMARY KEY,             -- SHA256 canonical encoding
  prev_hash TEXT NOT NULL,              -- Chain head link
  tx_type TEXT NOT NULL,                -- 'TRANSFER' | 'MINT' | 'BURN' | 'CLAIM'
  sender TEXT NOT NULL,
  receiver TEXT NOT NULL,
  amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
  fee_micro INTEGER NOT NULL DEFAULT 0,
  signature TEXT NOT NULL,              -- Client Ed25519 sig OR Merkle proof for MINT
  timestamp INTEGER NOT NULL
);

CREATE TABLE epochs (
  epoch_id INTEGER PRIMARY KEY,
  merkle_root TEXT NOT NULL,            -- Root of all transactions and claims in epoch
  payout_merkle_root TEXT NOT NULL,     -- Root of miner lazy claim tree
  drand_round INTEGER NOT NULL,
  ots_proof TEXT,                       -- Bitcoin OpenTimestamps proof
  ots_status TEXT DEFAULT 'PENDING'     -- 'PENDING' -> 'CONFIRMED'
);
```

---

## 5. 🪜 STEP-BY-STEP IMPLEMENTATION ROADMAP

- [x] **Milestone 1: Cryptographic Core (Local Python Prototypes)**
  - `prototypes/python/crypto.py` & `prototypes/python/test_crypto.py`: Canonical transaction packaging (`MYCOIN_TX_V1:`), Ed25519 keypair generation, signing, and verification. (COMPLETED & VERIFIED)
- [x] **Milestone 2: SQLite Ledger & Rules Engine (TypeScript & Cloudflare DO)**
  - `src/sequencer.ts`: SQLite schema initialization, monotonic nonces, balance verification, token-bucket burst rate-limiting, and lazy Merkle claim verification. (COMPLETED & VERIFIED)
- [x] **Milestone 3: Cloudflare Edge Gate & Sequencer (Wrangler & Native WebCrypto)**
  - `src/index.ts`: Stateless Edge Worker routing to singleton `SequencerDO`, CORS preflight, health checks, and sub-millisecond dispatch. (COMPLETED & VERIFIED)
- [x] **Milestone 4: Web Wallet & Browser Explorer (Public Web UI)**
  - `public/index.html` & `src/ui.ts`: Unified Pro Multi-Column Desktop + 100% Restored Mobile Web Wallet.
    - **Mobile (<900px):** 100% restored consumer mobile experience (top brand bar, Cash App/Spotify hero balance card, circular action buttons, Recent Activity stream, sliding bottom modals, and fixed bottom navigation bar).
    - **Desktop (>=900px):** Institutional 3-column pro trading layout (Twitter/Linear sticky left navigation rail with connected wallet chip; center stage crypto dashboard; right intelligence rail with live network vitals, Bitcoin OTS anchor status, background compute widget, and Sybil trust matrix).
    - **Wallet Persistence & BIP-39 Seed Suite:** Encrypted browser localStorage persistence, 12-word BIP-39 recovery phrase generation, RFC 8410 deterministic Ed25519 PKCS#8 derivation, visual 12-word backup sheet, and cross-device wallet import/restore sheet. (COMPLETED & VERIFIED)
    - Client-side WebCrypto Ed25519 key generation & signing, live background polling, test faucet, browser mining simulator, and full ledger inspection. (COMPLETED & VERIFIED)
- [ ] **Milestone 5: Discord & Telegram Bot Integrations**
  - Webhook handlers for `/balance`, `/pay`, and `/mine` issuing ephemeral signing deep-links.
- [x] **Milestone 6: Bitcoin OpenTimestamps Epoch Anchoring & Global Deployment**
  - `src/sequencer.ts`, `src/index.ts`, `wrangler.toml`: Hourly Cloudflare Cron Trigger settling epochs, computing Merkle roots, and notarizing directly into Bitcoin via OpenTimestamps (`a.pool.opentimestamps.org`). Live OTS receipt storage and explorer verification. (COMPLETED & VERIFIED)
  - **Live Global Production Deployment:** `https://quettabyte-core.circuitminds.workers.dev` (Active on Cloudflare Edge with SQLite DO & Hourly Cron `0 * * * *`).
  - **Disaster Recovery & Public Auditor (`scripts/audit_and_replay.py`):** Canonical DAG export endpoint (`/api/ledger/export`), mathematical Ed25519 signature auditor, Bitcoin OTS proof checker, and 100% SQLite reconstruction engine. (COMPLETED & VERIFIED)
  - **Edge Bot Shield & WAF:** Stateless edge rate-limiting (60 req/min/IP) and Cloudflare Turnstile bot verification protecting the sequencer against DDoS. (COMPLETED & VERIFIED)
- [x] **Milestone 7: Cuckoo Cycle Mining, Client Micro-PoW Shield & Asymmetric Identity Tiers**
  - `src/cuckoo.ts`: High-speed SipHash-2-4 engine & Cuckoo Cycle verifier (<0.2 ms CPU on Cloudflare Worker). (COMPLETED & VERIFIED)
  - `src/sequencer.ts`: Client Micro-PoW challenge bypass for token-bucket rate limits; Ghost Wallet (Tier 0) outbound gating with tiered daily velocity limits (Tier 1: 10/day, Tier 2: 50/day, Tier 3: unlimited); canonical BigInt/integer micro-unit bounds. (COMPLETED & VERIFIED)
  - `public/index.html`: Automatic client-side 0.8s Micro-PoW challenge solver on burst exhaustion; live Sybil Trust Matrix progression. (COMPLETED & VERIFIED)

---

## 6. ⚠️ AI AGENT OPERATING RULES
1. **Never introduce paid services:** No external paid databases (Supabase paid tiers, AWS, Redis). Everything must run on Cloudflare free tier, GitHub free tier, and browser client compute.
2. **Never use floating point math:** Currency math must strictly use integer micro-units (`1 coin = 1,000,000 micro-units`). In JS/TS, always use `BigInt`.
3. **Never exceed 10 ms CPU on Worker:** Always use native WebCrypto API (`crypto.subtle`); never use pure-JS hashing libraries.
4. **Never put private keys on the server:** The server is non-custodial. Private keys never leave the user's browser.
5. **Always update this file:** When a milestone is finished or an architectural decision is modified, update `AGENTS.md` to keep the context permanently fresh.

---

## 7. 🤝 DUAL-PROCESSING ARCHITECTURE (ANTIGRAVITY + OPENCODE)
To scale development and protocol testing without incurring API fees, a symbiotic dual-processing framework is established:
- **Lead Architect (Antigravity / Google DeepMind):**
  - Owns protocol design, cryptographic invariants, security audits, and code integration.
  - Crafts atomic task contracts with acceptance criteria and validates all outputs.
  - Controls the `opencode-agent` subagent and dispatches tasks via `scripts/opencode_bridge.py`.
- **Worker Subagent (Local OpenCode Engine):**
  - Runs locally on free, zero-cost models (`opencode/deepseek-v4.1-flash-free`, `glm-5.3-flash-free`).
  - Configured via `opencode.json` and `.opencode/agents/qbc-worker.md`.
  - Ingests `.opencode/CONTEXT.md` for strict guardrail compliance.
  - Executes file inspections, boilerplate generation, unit test writing, and localized refactoring.
  - Enforced by an automated TypeScript compilation gate (`npx tsc --noEmit`) before output handoff.

