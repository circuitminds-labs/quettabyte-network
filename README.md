# 🌌 Quettabyte Coin (QBC): Zero-Cost Serverless Cryptographic Ledger
### 🔬 Experimental Public Testnet-Alpha (`testnet-alpha-v1`)

> ⚠️ **IMPORTANT RESEARCH & TESTNET NOTICE**  
> This repository, the live Cloudflare Worker deployment, and the public Web Wallet are operating strictly in **Public Testnet-Alpha** for cryptographic peer review, stress testing, and open-source verification.
> * **Zero Monetary Value:** All QBC coins, faucet mints, mining rewards, and wallet balances are experimental test units with **$0.00 monetary value**. There is no ICO, no real-money trading, and no fiat redemption.
> * **Testing & Audit State:** The network state, parameter thresholds, and SQLite Durable Object schemas may undergo planned testnet resets during active protocol security audits prior to any future mainnet genesis.
> * **Research Blueprint:** The code is provided for developers and cryptographic researchers to inspect the zero-cost architecture, run independent ledger audits (`scripts/audit_and_replay.py`), and test native WebCrypto Ed25519 signing.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Network: Testnet--Alpha](https://img.shields.io/badge/Network-Public%20Testnet--Alpha-yellow.svg)](https://github.com/circuitminds-labs/quettabyte-network)
[![Cloudflare: Free Tier](https://img.shields.io/badge/Cloudflare-100%25%20Free%20Tier-orange.svg)](https://workers.cloudflare.com)
[![TypeScript: Strict](https://img.shields.io/badge/TypeScript-Strict%20Mode-blue.svg)](tsconfig.json)
[![Bitcoin: OpenTimestamps](https://img.shields.io/badge/Bitcoin-OpenTimestamps%20Anchored-gold.svg)](https://opentimestamps.org)
[![Runtime: workerd](https://img.shields.io/badge/Engine-Cloudflare%20Durable%20Objects-purple.svg)](wrangler.toml)

---

## 🌟 Overview

**Quettabyte Coin (QBC)** bridges the gap between centralized bot economies (OwO, Dank Memer) and heavy Layer-1 blockchains (Bitcoin, Ethereum):
* **Scale of Value:** Just as Bitcoin represents the fundamental unit of information (the bit, $2^0$), Quettabyte Coin scales digital value to the quetta ($10^{30}$ bytes), the largest SI magnitude prefix recognized in science.
* **Trust Model:** *"Don't trust the operator; verify the math."* The operator runs the database, but cryptographic hash chaining, client-side digital signatures, and hourly anchoring to Bitcoin make tampering mathematically impossible to hide.
* **$0 Forever:** Designed strictly within the free tiers of Cloudflare (`workerd` + SQLite Durable Object), GitHub Pages, and Bitcoin OpenTimestamps.
* **Non-Custodial:** Private keys never touch the server. Key generation and signing happen client-side via native WebCrypto (`Ed25519`).
* **Human-Friendly Fees:** Everyday community members enjoy **5 feeless transfers per day** and **token-bucket burst capacity** (no annoying cooldowns or punitive gas fees).
* **Asymmetric Tiers:** Anyone can receive coins with 0-KYC into a friction-free Ghost Wallet; sending and mining are protected by stacked Zero-PII trust scores (Google, Discord, Telegram carrier phone verification).

---

## 🏛️ System Architecture

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

## 📁 Repository Structure

```
MyCoin/
├── README.md                      📖 High-level project documentation & quickstart
├── AGENTS.md                      🧠 Project brain & AI context anchor
├── wrangler.toml                  ⚡ Cloudflare Worker & SQLite Durable Object config
├── package.json                   📦 Node.js dependencies & scripts
├── tsconfig.json                  ⚙️ Strict TypeScript configuration
│
├── src/                           💻 Production TypeScript source code
│   ├── index.ts                   🌐 Layer 1: Stateless Edge Gate & CORS Router
│   ├── sequencer.ts               🗄️ Layer 2: Atomic SQLite Durable Object Sequencer
│   ├── crypto.ts                  🔐 Native WebCrypto Ed25519 & canonical serializer
│   ├── merkle.ts                  🌳 Merkle tree calculation & inclusion branch verifier
│   └── types.ts                   📐 Core protocol types (Wallets, Txs, Epochs)
│
├── public/                        📱 Client-side frontends & Web UIs
│   ├── index.html                 💳 Standalone Web Wallet & Live Public Ledger Explorer
│   └── testbench.html             🧪 Interactive visual cryptographic testbench
│
├── docs/                          📚 Whitepaper & formal specifications
│   ├── MyCoin.pdf                 📄 Modern executive PDF whitepaper (Compiled)
│   ├── MyCoin_Modern.html         🌐 Interactive HTML whitepaper
│   └── MyCoin_Whitepaper_v4.md    📝 Master Markdown whitepaper specification
│
├── scripts/                       🛠️ Build & utility scripts
│   └── build_paper.py             🖨️ Headless Edge PDF compilation script
│
└── prototypes/                    🔬 Early prototypes & test vectors
    └── python/
        ├── crypto.py              🐍 Python reference cryptographic core
        └── test_crypto.py         🧪 Python test suite (Canonical packaging & Ed25519)
```

---

## ⚡ Quickstart: Running Locally

### 1. Prerequisites
- **Node.js** (v18 or newer; v24 recommended)
- **npm** (v9 or newer)

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Local Cloudflare Emulator
To launch the Cloudflare Worker and embedded SQLite Durable Object locally:
```bash
npm run dev
```
The server will boot on `http://127.0.0.1:8787`.

### 4. Launch the Web Wallet & Explorer
Open [`public/index.html`](public/index.html) in any modern web browser (Edge, Chrome, Safari, Firefox).
* 🔄 **Generate Wallet:** Instantly generates an Ed25519 keypair in browser memory.
* 🚰 **Test Faucet:** Click the Faucet button to mint 10 test coins.
* ✍️ **Send Payments:** Transfer coins to any 64-character public address with instant client-side signing.
* 🌐 **Live Explorer:** View block height, chain head, and recent transactions updated in real time.

---

## 🔐 Core Cryptographic Specifications

* **Digital Signatures:** Ed25519 over Curve25519 generated and verified via native `crypto.subtle` (sub-millisecond CPU).
* **Canonical Packaging:** All transactions are serialized with length-prefix tags (`MYCOIN_TX_V1:`) to eliminate delimiter injection and length-extension attacks.
* **Integer Micro-Units:** Strictly integer arithmetic (`1 Coin = 1,000,000 Micro-Units`). Floating-point math is prohibited across the protocol.
* **Lazy Merkle Claims:** Epoch miner rewards are committed as a single 32-byte Merkle root per hour (strictly 24 writes/day), solving Cloudflare's 100,000 daily write quota.

---

## 📄 Documentation

For in-depth mathematical proofs, economic models, and security audits, read the full whitepaper:
- **PDF Version:** [`docs/MyCoin.pdf`](docs/MyCoin.pdf)
- **Markdown Version:** [`docs/MyCoin_Whitepaper_v4.md`](docs/MyCoin_Whitepaper_v4.md)
- **Interactive HTML:** [`docs/MyCoin_Modern.html`](docs/MyCoin_Modern.html)
