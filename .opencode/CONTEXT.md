# 🧠 QUETTABYTE COIN (QBC) — CONTEXT CHEAT SHEET

## 1. Protocol Identity & Units
- **Name:** Quettabyte Coin [QBC]
- **SI Prefix:** Quetta ($10^{30}$), scaling digital value from bit ($2^0$) to quetta.
- **Base Unit:** 1 QBC = 1,000,000 micro-units (integer only, `BigInt`).
- **Genesis Supply:** 0. Fair launch, zero pre-mine.

## 2. Architecture Layout
- **Layer 1: Edge Gate (`src/index.ts`)**
  - Cloudflare Worker entry point.
  - Sub-millisecond routing to singleton `QUETTABYTE_PRIMARY_SEQUENCER` Durable Object.
  - Stateless IP rate limiting (60 req/min/IP).
  - OpenTimestamps proxy (`POST /api/ots/submit`).
- **Layer 2: Atomic State Sequencer (`src/sequencer.ts`)**
  - Durable Object with persistent SQLite storage.
  - Tables: `wallets`, `identities`, `transactions`, `epochs`.
  - Enforces monotonic nonces, balance constraints, and token-bucket burst limits.
  - Hourly Bitcoin OpenTimestamps Merkle notarization (`0 * * * *`).
- **Layer 3: Browser Web Wallet (`public/index.html` & `src/ui.ts`)**
  - Client-side WebCrypto Ed25519 key generation & PKCS#8 import/export.
  - 12-word BIP-39 recovery phrase derivation.
  - Responsive layout: Mobile Cash App style + Desktop institutional 3-column.
- **Verification & Replay (`scripts/audit_and_replay.py`)**
  - Verifies cryptographic signatures, rebuilds SQLite DAG from `/api/ledger/export`.

## 3. Core Coding Rules
- TypeScript: strict mode, `BigInt` for all ledger math.
- Never add external npm dependencies without Architect approval.
- Keep Cloudflare Worker bundle lightweight (<1MB).
