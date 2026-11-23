# 🧠 QUETTABYTE COIN (QBC) — MASTER AI CONTEXT BUNDLE
*Project: Quettabyte Coin [QBC] / Zero-Cost Serverless Cryptographic Ledger*  
*Owner: Aditya Gusain | Target Environment: Cloudflare Free Tier + GitHub + Bitcoin OTS*  
*Network State: Public Testnet-Alpha (`testnet-alpha-v1`)*  
*Purpose: Dedicated knowledge base for AI models (Claude, ChatGPT, Cursor, Gemini, DeepSeek, OpenCode, Copilot) to achieve instant 100% project understanding.*

---

## 📌 QUICK ORIENTATION (30-SECOND SUMMARY)

* **What is it?** A non-custodial digital micro-currency that runs at **strictly $0/month forever with no credit card required**. It functions as an experimental closed-loop utility/reputation point system across Web, Discord, Telegram, and IoT.
* **The Security Premise:** *"Don't trust the operator; verify the math."* A centralized Cloudflare Durable Object coordinates state, but an append-only SHA-256 hash chain, client-side Ed25519 signatures, and hourly Bitcoin OpenTimestamps (OTS) notarizations make operator fraud mathematically impossible to hide.
* **Zero-Cost Scaling Engine (QuettaBatch):** Instead of individual database writes that exhaust Cloudflare's 100,000 daily write quota, the system uses **Atomic Micro-Rollup Batching** (`/api/transfer/batch`) and **Lazy Merkle Claim Trees** (24 writes/day for mining payouts). 100,000 transfers consume only ~2,000 writes (2% of daily quota).
* **Live Deployment:**
  * **Core API & Edge Worker:** `https://quettabyte-core.circuitminds.workers.dev`
  * **Public Ledger & Witness Repository:** `https://github.com/circuitminds-labs/quettabyte-network`

---

## 📚 CONTEXT READING ORDER FOR AIS

When ingesting this project, read the files in this directory in the following order:

1. **[`ARCHITECTURE.md`](ARCHITECTURE.md)**  
   *Detailed 3-layer system design, SQLite Durable Object actor model, QuettaBatch micro-rollup engine, Cuckoo Cycle mining, and asymmetric identity tiers.*
2. **[`CRYPTOGRAPHY.md`](CRYPTOGRAPHY.md)**  
   *Canonical length-prefixed packaging (`MYCOIN_TX_V1:`), native WebCrypto Ed25519 signing, BIP-39 / RFC 8410 derivation, and Merkle tree proofs.*
3. **[`API-REFERENCE.md`](API-REFERENCE.md)**  
   *Complete REST API documentation, request/response JSON schemas, batch transfer payloads, rate limits, and error codes.*
4. **[`PROJECT-STATUS.md`](PROJECT-STATUS.md)**  
   *Changelog of what has been built and verified so far (Milestones 1, 2, 3, 4, 6, 7), live verified testnet vitals, and pending tasks (Milestone 5 bots).*

---

## 🚨 CARDINAL INVARIANTS FOR ANY AI ASSISTANT

Any AI modifying or extending this codebase MUST strictly adhere to these non-negotiable rules:

| Invariant | Enforcement Rule | Why it Exists |
| :--- | :--- | :--- |
| **100% $0 Forever** | NEVER introduce paid databases (Supabase paid, AWS RDS, Redis) or paid APIs. | The project must run permanently at $0 cost on free tiers. |
| **Strict Integer Math** | NEVER use floating-point numbers for currency math. Always use `BigInt` micro-units (`1 QBC = 1,000,000 micro-units`). Safe ceiling capped at $2^{50}$. | Floats introduce rounding errors and financial exploits. |
| **Sub-10ms CPU Wall** | NEVER use pure-JS cryptographic hashing libraries in Workers. Always use native WebCrypto (`crypto.subtle`). | Cloudflare free Workers have a strict 10ms CPU execution cap. |
| **Non-Custodial Design** | NEVER send or store private keys on the server. Keys are generated and stored exclusively in client memory / localStorage. | Eliminates custodial liability, Indian VDA/PMLA, and server hack risks. |
| **Pure Professional Naming**| Enforce clean **kebab-case** (`quettabyte-core`, `quettabyte-network`). Zero random underscores, zero informal slang, zero amateur version suffixes (`-v2`, `-final`). | Institutional software standard across all repositories. |
| **Testnet-Alpha Safeguards**| Always preserve Testnet-Alpha badges and disclaimers. Tokens have $0.00 monetary value. | Prevents real-money confusion and legal liability during research testing. |
