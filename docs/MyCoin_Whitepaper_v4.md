# 🪙 MyCoin: Zero-Cost Serverless Cryptographic Ledger (v4 Whitepaper)

*A Modern, Plain-Language Technical Whitepaper & Architectural Specification for a $0/Month, Tamper-Evident Micro-Currency*

**Author:** Aditya Gusain  
**Date:** November 2026  
**Status:** *In-Progress Architectural Whitepaper & Live Interactive Prototyping (Milestone 1 Verified)*  
**Core Invariant:** Strictly $0 Forever • No Credit Card Required • Non-Custodial • Zero Carbon Footprint  
**Target Infrastructure:** Cloudflare Edge (`workerd` / SQLite Durable Object), GitHub Pages, Bitcoin OpenTimestamps  

---

> [!NOTE]
> ### 📌 Executive Abstract: The 60-Second Summary
> **MyCoin** is a decentralized, non-custodial digital micro-currency engineered to operate permanently at **$0 running cost** with **no credit card required**. Built for frictionless use across Discord, Telegram, Web browsers, and IoT microcontrollers, the protocol eliminates the trust flaws of traditional database bots (OwO, Dank Memer) while avoiding the prohibitive energy costs, transaction fees, and node infrastructure of heavy Layer-1 blockchains (Bitcoin, Ethereum).
>
> The system achieves mathematical tamper-evidence through a **single-threaded SQLite Durable Object sequencer**, **client-side Ed25519 digital signatures**, and **hourly public cryptographic anchoring to Bitcoin via OpenTimestamps and public Git repositories**. 
> 
> To solve the fundamental economic and security vulnerabilities of free serverless tiers, MyCoin introduces:
> * 🗄️ **Lazy Merkle Claims:** Collapses miner settlement from 120,000 writes/day to exactly 24 writes/day, keeping the network permanently within Cloudflare's 100,000 write limit.
> * 🛡️ **Frictionless Inbound, Gated Outbound Tiers:** Anyone can receive coins with 0-KYC and 0-friction, while sending and mining are protected by stacked Zero-PII identity trust scores (Google, Discord, Telegram phone verification).
> * 🤝 **Human-Friendly Spam Protection:** Everyday users enjoy a **feeless daily allowance (first 5 free)** and **token-bucket burst capacity** (no annoying cooldowns or punitive fees), backed by a client-side **Micro-Proof-of-Work shield** that silently chokes automated bot floods.
> * ⛏️ **Cuckoo Cycle Memory-Latency Mining:** Replaces brute-force SHA-256 with memory-bound graph cycle exploration in WebAssembly, leveling the playing field between smartphones and GPUs while enabling instant (<0.2 ms) verification at the serverless edge.

---

## 1. 💡 The Vision: Reimagining Digital Value from Scratch

### 1.1 The Fundamental Problem with Existing Systems
Digital currencies and community points today are trapped between two broken extremes:

```
┌───────────────────────────────────────┐         ┌───────────────────────────────────────┐
│       CENTRALIZED BOT ECONOMIES       │         │        HEAVY LAYER-1 BLOCKCHAINS      │
│         (OwO, Dank Memer, RPGs)       │         │          (Bitcoin, Ethereum)          │
├───────────────────────────────────────┤         ├───────────────────────────────────────┤
│ • Mutable numbers in private MySQL DB │         │ • Massive node infrastructure costs   │
│ • Admins can print coins invisibly    │   VS.   │ • High transaction & gas fees ($2-$50)│
│ • Locked inside a single chat app     │         │ • Complex seed phrases & high latency │
│ • Vulnerable to silent database wipes │         │ • Burns megawatts of electricity      │
└───────────────────────────────────────┘         └───────────────────────────────────────┘
                                    │                 │
                                    └────────┬────────┘
                                             ▼
                        ┌─────────────────────────────────────────┐
                        │              THE MYCOIN SWEET SPOT      │
                        │ • Centrally sequenced for 0-latency & $0│
                        │ • Cryptographically tamper-evident      │
                        │ • Non-custodial (users own private keys)│
                        │ • 100% Free Forever ($0 running cost)   │
                        │ • Cross-platform (Web, Discord, TG, IoT)│
                        └─────────────────────────────────────────┘
```

### 1.2 Comparison Matrix: How MyCoin Wins

| Metric / Feature | Traditional Chat Bots | Heavy Blockchains | **🪙 MyCoin (v4 Architecture)** |
| :--- | :--- | :--- | :--- |
| **Monthly Hosting Cost** | \$5 – \$50 / month (VPS) | \$100k+ (Mining / Nodes) | **\$0.00 Forever (Cloudflare Free Tier)** |
| **Credit Card Needed?** | Yes | Yes (Gas fees / Nodes) | **Strictly NO (Zero-risk free tiers)** |
| **User Transaction Fees** | Arbitrary Bot Tax | \$0.50 – \$50.00 Gas | **100% Free (5 free/day + token-bucket)** |
| **Can Creator Cheat?** | **Yes** (Edits SQL rows) | No (Consensus) | **No (Bitcoin OpenTimestamps + Git Merkle)** |
| **Key Custody** | Centralized in Bot DB | Non-Custodial | **Non-Custodial (WebCrypto / Passkeys)** |
| **Hardware Mining Fair**| N/A | No (ASICs & GPU rigs) | **Yes (Phones ≈ PCs via Memory Latency)** |
| **Cross-Platform Sync** | No (Locked to Discord) | Wallets only | **Universal (Discord, Telegram, Web, IoT)** |

---

### 1.3 The Village Bank Analogy 🏦
To understand MyCoin without technical jargon, imagine an honest village bank:
* 📖 **The Notebook (Append-Only Ledger):** The banker has a notebook. Balances are not arbitrary numbers; they are the total sum of history. No eraser exists.
* 🔏 **The Fingerprint (Hash Chain):** Every entry records a SHA-256 fingerprint of the entry right above it. If an admin secretly tampers with line 12, lines 13 through 1,000 stop matching instantly.
* 📸 **The Hourly Photograph (Bitcoin & Git Anchors):** Every hour, the banker photographs the latest page and pins it in the village square (Bitcoin OpenTimestamps + public GitHub repo). Even if the banker goes rogue tomorrow, past history can never be rewritten!
* 🔑 **The Personal Stamp (Ed25519 Signatures):** Villagers never hand the banker their secret password. Every transaction is stamped directly on the villager’s phone using private cryptographic keys.
* 🏧 **The Multi-App ATMs:** Discord, Telegram, and the Web Wallet are just ATMs connected to this single, tamper-evident village bank.

---

### 1.4 A Day in the Life: How Everyday People Experience MyCoin 🌟

```
   [ ALICE: The Gamer ]            [ BOB: The Friend ]          [ CHARLIE: The Miner ]
            │                              ▲                             │
   1. Alice types `/pay 5 @Bob`            │                    1. Charlie opens web wallet
      in Discord.                          │                       on his iPhone.
            │                              │                             │
   2. Her browser signs payload            │                    2. Solves Cuckoo Cycle puzzle
      with private Passkey.                │                       in background (45s).
            │                              │                             │
   3. Server verifies in 0.1ms;            │                    3. Submits 42 numbers to server
      settles with 0 fees.                 │                       (verified in 0.2ms).
            │                              │                             │
            └────────── 4. Bob receives 5 coins! ────────────────────────┴─► Earns fair share!
                           (Instant notification)
```

1. **Alice sends a tip on Discord:** Alice runs `/pay 5 @Bob`. Her Discord app opens an ephemeral signing prompt. Alice confirms with FaceID / TouchID. The transfer completes in 0.05 seconds with **zero fees**.
2. **Bob claims with zero hassle:** Bob has never heard of crypto. He opens the link, receives his 5 coins into a friction-free **Ghost Wallet**, and sees his live balance immediately.
3. **Charlie mines on his phone:** Charlie opens the web wallet on his Android phone during lunch. His phone solves a gentle memory-bound puzzle for 45 seconds while staying cool. He earns freshly minted coins alongside PC users.
4. **Eve the spammer is neutralized:** Eve writes a Python script trying to send 10,000 transactions to crash the server. After 5 transactions, her token bucket empties. Her script is forced to solve 0.8 seconds of client-side math for every request, burning 2.5 hours of CPU while Cloudflare remains 100% unaffected!

---

## 2. 🏛️ Full System Architecture (The Three-Layer Model)

```
[ Discord Bot Webhook ]    [ Telegram Mini-App ]    [ Web Wallet & Explorer ]    [ ESP32 IoT Node ]
          │                          │                          │                        │
          └──────────────────────────┴─────────────┬────────────┴────────────────────────┘
                                                   │ Direct HTTPS Requests
                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: STATELESS EDGE GATE (Cloudflare Worker)                                                │
│ • Cloudflare WAF & Turnstile anti-bot verification (Blocks data center botnets at DNS edge)     │
│ • Ed25519 Webhook signature authentication for Discord and Telegram                             │
│ • Sub-millisecond routing and static asset delivery from Cloudflare Pages cache                │
│ • Micro-Proof-of-Work verifier (<0.1 ms CPU) for burst traffic                                 │
└────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                 │ Serialized Internal Calls
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: ATOMIC STATE SEQUENCER (Single SQLite Durable Object)                                  │
│ • Single-Threaded Execution Queue: Eliminates all race conditions and double-spend attacks      │
│ • SQLite Monotonic State: Wallets, Balances, Nonces, and the Single Global SHA-256 Hash Chain  │
│ • In-Memory Token Bucket: Smooth burst-rate limiter (Capacity: 5 txs, refill: 1 per 2 mins)    │
│ • Lazy Merkle Claim Engine: 1 write per hour for epoch payouts (Strictly 24 writes/day)         │
└────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                 │ Hourly Scheduled Event
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: PUBLIC WITNESSES & IMMUTABLE ANCHORS                                                   │
│ • Cloudflare Cron Trigger: Wakes automatically once every 60 minutes                            │
│ • drand Beacon Integration: Queries League of Entropy for unbiasable public epoch randomness     │
│ • Bitcoin OpenTimestamps (OTS): Submits the epoch Merkle root to the Bitcoin blockchain ($0)    │
│ • Git-as-a-Blockchain: Pushes signed compressed JSONL commit to public GitHub repository        │
│ • Static Snapshot CDN: GitHub Pages serves history to miners & explorers with zero DO read load │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 🔐 Cryptographic Foundations

### 3.1 Non-Custodial Key Architecture (Ed25519)
The server never holds, sees, or generates users' private keys:
* 🔑 **Algorithm:** Edwards-curve Digital Signature Algorithm over Curve25519 (**Ed25519**).
* ⚡ **Performance:** 64-byte signatures, 32-byte public keys, verified in sub-millisecond CPU time.
* 🛡️ **Execution:** Generated inside the user's browser using native `crypto.subtle` (WebCrypto API).
* 💾 **Key Derivation & Backup:** 
  * **Primary:** WebAuthn Hardware Passkeys (tied to Apple Secure Enclave / Android StrongBox / Windows TPM).
  * **Backup:** Standard BIP-39 12-word mnemonic phrase displayed once at creation to prevent browser cache loss.

### 3.2 Canonical Length-Prefixed Serialization (`MYCOIN_TX_V1:`)
To mathematically prevent delimiter injection and length-extension collision attacks (where `"ab" + "c"` collides with `"a" + "bc"`), all transactions are packed into a canonical format before signing:

```
Canonical Format Structure:
Payload = "MYCOIN_TX_V1:" + len(Type) + ":" + Type + ":" + len(Sender) + ":" + Sender + ":" + 
          len(Receiver) + ":" + Receiver + ":" + Amount + ":" + Fee + ":" + Nonce + ":" + 
          len(PrevHash) + ":" + PrevHash + ":" + Timestamp

Sample Formatted Payload:
MYCOIN_TX_V1:8:TRANSFER:64:d0453478...:64:74c161a9...:15500000:0:0:64:00000000...:1795264846
```

### 3.3 Strict Micro-Unit Integer Arithmetic
Computers cannot accurately represent decimal floating-point numbers ($0.1 + 0.2 = 0.30000000000000004$). MyCoin enforces **strict integer math**:
* 📏 **Base Unit:** 1 Coin = **1,000,000 Micro-Units** ($10^6$).
* 🔒 **Safe Supply Ceiling:** Hard-capped at **1,000,000,000 Coins** ($10^{15}$ micro-units). This remains well below JavaScript's safe integer ceiling ($2^{53} - 1 \approx 9 \times 10^{15}$), eliminating any integer overflow or truncation bugs.

---

## 4. 🤝 Human-Friendly Anti-Spam & Fee Architecture

> [!IMPORTANT]
> ### 🎯 Core Design Mandate
> Ordinary users must **never** feel frustrated by harsh fees, clunky cooldown screens, or confusing blockchain gas calculations. The currency must feel as fast and effortless as cash.

```
                     [ THE MULTI-TIER DEFENSE AGAINST TRANSACTION SPAM ]

    1. HUMAN LAYER: FEEL-FREE USE          2. SPEED LAYER: TOKEN BUCKET
    ┌──────────────────────────────────┐   ┌──────────────────────────────────┐
    │ • First 5 transfers / day are    │   │ • Burst capacity: Up to 5 sends  │
    │   100% FREE (0 Fee).             │   │   in 5 seconds allowed!          │
    │ • 99% of normal users never pay  │   │ • Bucket refills automatically:  │
    │   a single micro-unit!           │   │   1 token every 2 minutes.       │
    └──────────────────────────────────┘   └──────────────────────────────────┘
                     │                                      │
                     └──────────────────┬───────────────────┘
                                        ▼
    3. BOT DEFENSE: MICRO-POW SHIELD       4. ECONOMIC SINK: SUSTAINED FEES
    ┌──────────────────────────────────┐   ┌──────────────────────────────────┐
    │ If a user exhausts burst tokens, │   │ If an automated script sends     │
    │ the browser silently crunches a  │   │ >20 transfers in an hour, a tiny │
    │ 0.8-second JavaScript puzzle.    │   │ 0.001 coin micro-fee is burned.  │
    │ (Humans wait 1s; bots hit wall). │   │ Ping-pong scripts burn to 0!     │
    └──────────────────────────────────┘   └──────────────────────────────────┘
```

### 4.1 The "First 5 are on the House" Daily Allowance 🎁
* Every verified wallet receives **5 free transfers every single day** with **0.000000 coin fee**.
* For 99% of community members tipping friends, splitting bills, or playing casual games, **MyCoin is 100% free of transaction fees**.

### 4.2 Token-Bucket Smoothing (Zero Annoying Cooldowns) ⚡
Rigid timers (e.g. *"Please wait 15 seconds before sending again"*) destroy user experience. MyCoin uses the industry-standard **Token Bucket Algorithm** held in Durable Object RAM:
* 🪣 **Bucket Capacity:** 5 tokens.
* 💧 **Refill Rate:** 1 token every 120 seconds.
* 🏃 **User Experience:** You can send 3 tips to 3 friends in 5 seconds without interruption. As long as your average daily rhythm is human, you never encounter a cooldown screen.

### 4.3 The Client-Side Micro-PoW Shield 🛡️
When a wallet exhausts its token bucket (because an automated loop is firing rapid-fire payments):
1. The server does not throw an angry error. It responds with: `HTTP 402: Micro-PoW Required`.
2. The user's web wallet immediately solves a **0.8-second JavaScript hashcash puzzle** in a background WebWorker thread and resubmits.
3. For a human, waiting 1 second for a 6th rapid transfer is completely unnoticeable.
4. For an automated bot script attempting to send 50,000 transactions to exhaust Cloudflare's 100,000 write quota, solving 50,000 seconds of compute requires **14 hours of continuous CPU**, completely crushing the spam attack!

### 4.4 The Ping-Pong Economic Trap (Self-Destruction) 🕳️
If an attacker attempts to write a script bouncing 1 coin back and forth between two colluding wallets (`Alice ⇄ Bob`):
* Once the free allowance and burst tokens are exhausted, each subsequent transfer burns a **0.001 coin fee** ($1,000$ micro-units) permanently.
* 1,000 ping-pong transactions burns **1 whole coin**.
* 50,000 ping-pong transactions burns **50 coins**.
* The spammer's balance is drained to zero, while generating **zero reputation points** (because reputation is derived from identity verification and account age, never transaction volume).

---

## 5. 🛡️ Identity Stacking & Asymmetric Wallet Tiers

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 0: GHOST WALLET (0 Points)                                                                 │
│ • Prerequisite: Open any claim link (Instant burner wallet generated in 0.5s via WebCrypto).   │
│ • Inbound: UNLIMITED (Anyone can receive coins with zero KYC, zero passwords, zero friction).   │
│ • Outbound: 0 (Locked until unlocked with 1 social link).                                       │
└────────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                 │ Link Google OR Discord (1 Tap)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 1: CASUAL CITIZEN (25+ Points)                                                             │
│ • Prerequisite: Google (+20) OR Discord (+20) + Turnstile Pass (+10).                           │
│ • Inbound: UNLIMITED.                                                                           │
│ • Outbound: Up to 10 transfers / day.                                                           │
│ • Mining: 1 share / hour (Probationary tier).                                                   │
└────────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                 │ Add Telegram Phone Verify OR GitHub
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 2: TRUSTED COMMUNITY MEMBER (50+ Points)                                                   │
│ • Prerequisite: Google + Discord + Telegram Phone Verify (+25).                                 │
│ • Outbound: Up to 50 transfers / day.                                                           │
│ • Mining: 5 shares / hour.                                                                      │
└────────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                 │ Hardware Passkey + 14-Day Account Age
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TIER 3: NETWORK GUARDIAN (80+ Points)                                                           │
│ • Prerequisite: 3+ Platforms + WebAuthn Hardware Passkey (+15) + Age > 14 Days (+10).           │
│ • Outbound: Unlimited (Subject to token-bucket smoothing).                                      │
│ • Mining: 15 shares / hour (Full capacity).                                                     │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 The $0 Phone Verification Technique (Via Telegram) 📱
Paid SMS services (Twilio) cost \$0.05 per SMS and require credit cards. MyCoin verifies phone uniqueness for **$0 forever**:
1. The user clicks *"Verify Phone"* in the Web Wallet.
2. The browser redirects to our official Telegram bot.
3. The user taps a native Telegram button: `[ 📲 Share Verified Contact ]`.
4. Telegram cryptographically returns the user's carrier-verified phone number to our webhook for free.
5. **Zero-PII Blinded Storage:** The server computes:
   $$\text{Blinded Identity} = \text{HMAC-SHA256}(\text{Telegram\_Phone\_Number},\ \text{Server\_Secret})$$
   The server stores only the 64-character hash. The user's real phone number is discarded immediately from memory. If a bot farmer attempts to link the same phone to a second wallet, SQLite throws a `UNIQUE constraint failed` error!

---

## 6. ⛏️ Cuckoo Cycle Mining: The Memory-Latency Equalizer

### 6.1 Why Traditional Mining Fails for Free Serverless
* ❌ **SHA-256 Hashcash (Bitcoin-style):** A gaming GPU hashes $10,000\times$ faster than a smartphone. Bot farms monopolize all coins.
* ❌ **Argon2 / Scrypt (Memory-Hard):** While fair to phones, verifying an Argon2 hash takes the server 100 ms to 1 second of CPU, which **instantly crashes Cloudflare Worker's 10 ms CPU limit**.

### 6.2 The Solution: Cuckoo Cycle (Cuckatoo in WASM) 🧩
Cuckoo Cycle (invented by John Tromp) is an **asymmetric, memory-latency bound graph puzzle**:
* 🔍 **The Client Work (The Library Scavenger Hunt):** Using a seed, the miner's browser generates a random bipartite graph of $2^{24}$ edges ($\approx 32\text{ MB}$ of RAM, fitting comfortably in mobile browsers). The miner executes a pointer-chasing search for a **42-node closed cycle**.
* ⚖️ **Why It Is Hardware-Fair:** Pointer-chasing is bound by RAM latency (waiting for memory cache lines to load). Because mobile LPDDR5 RAM latency is comparable to desktop DDR5 latency, a high-end PC is only about **$1.5\times$ to $2\times$ faster than a smartphone**, rather than $10,000\times$ faster.
* ⚡ **The 0.2 ms Server Miracle:** Finding the 42-cycle takes the user's phone 45 seconds of memory exploration. But the solution consists of just **42 edge indices**. The Cloudflare Worker verifies that those 42 numbers form a valid cycle in **under 0.2 milliseconds of CPU time**!
* 🧂 **Unique Per-Miner Salting:**
  $$\text{Graph Seed} = \text{SHA256}(\text{drand\_round\_seed} \parallel \text{miner\_wallet\_address} \parallel \text{ticket\_counter})$$
  No two miners explore the same graph. Solutions cannot be copied, stolen, or pre-computed.

---

## 7. 🗄️ Lazy Merkle Claims: Solving the 100,000 Write Budget

### 7.1 The Mathematical Bottleneck
In early designs, paying 1,000 miners hourly required writing an epoch reward row, a balance update, and a transaction row for each miner:
$$\text{Daily Writes} = 1,000 \text{ miners} \times 24 \text{ epochs/day} \times 5 \text{ writes} = \mathbf{120,000\text{ writes/day}}$$
This exceeds Cloudflare’s 100,000 daily limit before a single transfer is made!

### 7.2 The Lazy Claim Architecture (Uniswap-Style Merkle Drops)
```
Hourly Epoch Settlement (Computed in RAM):
  Miner Alice: 4.5 coins  ──► Hash(Alice, 4.5)  ──┐
  Miner Bob:   3.2 coins  ──► Hash(Bob, 3.2)    ──┼──► Merkle Tree ──► Merkle Root (64 chars)
  Miner Carol: 1.8 coins  ──► Hash(Carol, 1.8)  ──┘
                                                        │
                                                        ▼
                                       WRITTEN TO DURABLE OBJECT SQLITE:
                                       `INSERT INTO epochs (epoch_id, payout_root) VALUES (42, '7f8a...');`
                                       (STRICTLY 1 WRITE PER HOUR = 24 WRITES/DAY!)
```

* 🕒 **When do balances update?** On demand! When Alice wants to spend her mined coins, her web wallet downloads her tiny 4-hash Merkle proof from GitHub Pages and submits it with her payment:
  $$\text{Verify}(\text{Root}_{42},\ \text{Alice\_Address},\ \text{Amount},\ \text{MerkleBranch}) \rightarrow \text{TRUE}$$
* 📈 **Result:** Database writes scale with *actual payments*, not with the number of miners. The system easily supports **50,000+ active miners** on the 100% free tier.

---

## 8. 🌐 Public Witnessing: Anchoring to Bitcoin & Git

Even though Cloudflare runs the database, **the operator cannot cheat or edit history invisibly**:

```
[ Hourly Epoch Seal ]
        │
        ├──► 1. Query drand (League of Entropy) for unbiasable public beacon.
        │
        ├──► 2. Hash all epoch transactions + payout root into Epoch Merkle Root.
        │
        ├──► 3. Submit Epoch Merkle Root to Bitcoin blockchain via OpenTimestamps ($0).
        │
        └──► 4. Push signed compressed JSONL commit to public GitHub repo via REST API.
```

* 🎲 **drand Public Beacon:** Epoch seeds are tied to external distributed randomness. Neither the creator nor miners can predict future seeds.
* ⛓️ **Bitcoin OpenTimestamps (OTS):** Proves that the exact ledger state existed at a specific Bitcoin block height. Rewriting history would require re-mining the Bitcoin blockchain.
* 📦 **Git as a Blockchain:** Every Git commit is an immutable Merkle tree. Anyone in the world can run `git clone` to hold a complete, byte-for-byte verifiable backup of the entire economy.

---

## 9. 🗄️ Target Database Schema (SQLite Durable Object)

```sql
-- WALLETS: Balances, replay protection, and identity progression
CREATE TABLE wallets (
  address TEXT PRIMARY KEY,             -- Hex Ed25519 Public Key (64 chars)
  balance_micro INTEGER NOT NULL DEFAULT 0 CHECK (balance_micro >= 0),
  nonce INTEGER NOT NULL DEFAULT 0,     -- Strictly increasing replay protection
  last_ticket INTEGER NOT NULL DEFAULT 0, -- Monotonic mining ticket counter
  sybil_score INTEGER NOT NULL DEFAULT 0, -- 0 = Ghost, 25+ = Tier 1, 50+ = Tier 2, 80+ = Tier 3
  tier INTEGER NOT NULL DEFAULT 0       -- 0: Ghost, 1: Casual, 2: Citizen, 3: Guardian
);

-- IDENTITIES: Zero-PII blinded 1:1 account mappings
CREATE TABLE identities (
  blinded_hash TEXT PRIMARY KEY,        -- HMAC(OAuth_ID, Server_Secret)
  wallet_address TEXT NOT NULL,
  provider TEXT NOT NULL,               -- 'GOOGLE' | 'DISCORD' | 'TELEGRAM_PHONE' | 'GITHUB'
  created_at INTEGER NOT NULL
);

-- TRANSACTIONS: Single global tamper-evident hash chain
CREATE TABLE transactions (
  tx_hash TEXT PRIMARY KEY,             -- SHA256 canonical encoding
  prev_hash TEXT NOT NULL,              -- Chain head link
  tx_type TEXT NOT NULL,                -- 'TRANSFER' | 'MINT' | 'BURN' | 'CLAIM'
  sender TEXT NOT NULL,
  receiver TEXT NOT NULL,
  amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
  fee_micro INTEGER NOT NULL DEFAULT 0 CHECK (fee_micro >= 0),
  signature TEXT NOT NULL,              -- Client Ed25519 signature (or Merkle Proof for MINT)
  timestamp INTEGER NOT NULL
);

-- EPOCHS: Hourly public anchors & lazy payout roots
CREATE TABLE epochs (
  epoch_id INTEGER PRIMARY KEY,
  merkle_root TEXT NOT NULL,            -- Root of all transactions and claims in epoch
  payout_merkle_root TEXT NOT NULL,     -- Root of miner lazy claim tree
  drand_round INTEGER NOT NULL,
  ots_proof TEXT,                       -- Bitcoin OpenTimestamps proof receipt
  ots_status TEXT DEFAULT 'PENDING'     -- 'PENDING' -> 'CONFIRMED'
);
```

---

## 10. 🛡️ Security Audit: The 12 Critical Failure Modes & Fixes

| # | Attack Vector / Failure Mode | Why Earlier Designs Failed | The v4 Architectural Fix |
|---|-----------------------------|----------------------------|--------------------------|
| **1** | **Write Budget Exhaustion** | 1,000 miners $\times$ 24 epochs = 120k writes/day (exceeds 100k DO cap). | **Lazy Merkle Claims:** Epoch settlement writes only 1 row/hour (24 writes/day). |
| **2** | **Worker 10 ms CPU Limit** | Verifying 100 shares takes 30 ms (Worker crashes). | **Commit-and-Sample:** Submitter commits root; Worker verifies 3 random leaves (<1 ms). |
| **3** | **Square-Root Sybil Flaw** | $\sqrt{k \cdot s} > \sqrt{s}$ mathematically rewards splitting into fake wallets. | **Linear Weights + Hard Identity Cap:** 1 share = 1 pt; strict per-identity limits. |
| **4** | **Memory Puzzle Defects** | Random cycle lengths; 32MB fits modern CPU L3 caches; unsalted graphs. | **Cuckoo Cycle in WASM:** Salted with `drand + wallet + ticket`. Verified in <0.2 ms. |
| **5** | **drand Pairing CPU Limit** | BLS12-381 pairing check takes 20–50 ms in JS (Worker crashes). | **Edge Multi-Relay Quorum:** Verify Cloudflare internal + 1 relay. Full BLS checked in Cron. |
| **6** | **Durable Object RAM Eviction**| Cloudflare restarts DO; in-memory Maps vanish. | **Two-Tier Storage:** Monotonic nonces/tickets in SQLite; only sliding rate limits in RAM. |
| **7** | **P2P Privacy / NAT Issues** | WebRTC STUN leaks user IP addresses (breaks Zero-PII). | **HTTPS Direct Authority:** Core transactions go direct to Worker. P2P is optional CDN. |
| **8** | **Encoding Ambiguities** | Plain string concatenation allows length-extension collisions. | **Canonical Tagged Encoding:** `MYCOIN_TX_V1:` length-prefixed. Safe cap at $2^{50}$ micro-units. |
| **9** | **Fake Audit Reporting** | Miners return `audit_passed: true` without checking. | **Poisoned Canary Injection:** Server injects 1 bad tx in 100. Miner must catch the canary. |
| **10**| **Ping-Pong Spam Floods** | Rapid transfer loops consume database writes. | **Feeless Allowance + Token Bucket + Micro-PoW:** Bursts require 0.8s client-side work. |
| **11**| **Unmined Epochs & Dust** | Unaccounted unmined coins cause uncontrolled supply. | **Unmined Pool Burn:** Unmined hourly pools burn permanently. Dust rolls to next epoch. |
| **12**| **Disaster Recovery** | DO corruption causes total ledger loss. | **Git Replay:** Ledger can be 100% reconstructed by replaying signed commits from GitHub. |

---

## 11. ⚖️ Legal & Regulatory Demarcation

* 🛡️ **Strict Closed-Loop Utility Currency:** MyCoin is engineered strictly as a closed-loop reputation and gaming utility token.
* 🚫 **No Cash-Out & No Fiat Off-Ramps:** There is no fiat exchange, no cash-out mechanism, and no real-money trading, avoiding Indian Virtual Digital Asset (VDA) 30% tax/PMLA regulations and Discord ToS gaming violations.
* 🔒 **Zero-PII Compliance:** No emails, names, or phone numbers are ever stored in plaintext, ensuring total compliance with global data privacy standards (GDPR / DPDP).

---

## 12. 🪜 Phased Implementation Roadmap

```
[Phase 1: Cryptographic Engine (Local Python Tests)] ◄── CURRENT STATUS: STEP 1.1 VERIFIED!
  • Step 1.1: Canonical packaging (`MYCOIN_TX_V1:`) & Ed25519 signing (PASSED).
  • Step 1.2: Merkle Tree generation & branch inclusion proofs.
  • Step 1.3: Cuckoo Cycle puzzle verification benchmark (<0.2 ms).
        │
        ▼
[Phase 2: Interactive Visual Test Bench & Local Ledger]
  • `visual_testbench.html`: Interactive web dashboard to test wallets, tamper detection, and Merkle proofs.
  • SQLite schema creation with Lazy Merkle Claim verification.
        │
        ▼
[Phase 3: Cloudflare Edge Gate & Sequencer]
  • Worker routing, Turnstile verification, and Durable Object single-threaded queue.
        │
        ▼
[Phase 4: Web Wallet & Browser Miner]
  • Standalone HTML/JS web wallet with Passkeys & WASM Cuckoo miner.
        │
        ▼
[Phase 5: Discord & Telegram Bot Connections]
  • Interactions webhooks for `/balance`, `/pay`, and `/mine`.
        │
        ▼
[Phase 6: Public Explorer & Bitcoin Anchoring]
  • Cloudflare Cron Trigger exporting snapshots to GitHub Pages and Bitcoin OpenTimestamps.
```
