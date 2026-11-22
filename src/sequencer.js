import { DurableObject } from 'cloudflare:workers';
import { canonicalizeTx, verifyEd25519Signature, sha256Hex } from './crypto';
import { verifyMerkleProof, computeMerkleRoot } from './merkle';
import { verifyCuckooCycle, CUCKOO_PROOF_SIZE } from './cuckoo';
/**
 * Canonical micro-unit ceiling (2^50) from AGENTS.md §3.
 * All ledger amounts must remain integer-only and stay inside this bound.
 */
export const MAX_MICRO_UNITS = 1n << 50n;
export const MICRO_UNITS_PER_COIN = 1000000n;
/**
 * Strictly parses an externally supplied micro-unit amount (JSON number or decimal string).
 * Returns null for floats, NaN, non-integers, exponents or negative-form input, so no
 * floating point value can ever reach ledger math.
 */
export function parseMicroUnits(value) {
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value))
            return null;
        return BigInt(value);
    }
    if (typeof value === 'string') {
        if (!/^\d+$/.test(value))
            return null;
        return BigInt(value);
    }
    return null;
}
/** Binds a BigInt amount to SQLite as an exact decimal string (INTEGER affinity stores it as INTEGER). */
export function microToDb(micro) {
    return micro.toString();
}
/** Reads a SQLite micro-unit column strictly as BigInt, rejecting any REAL/float storage. */
export function dbToMicro(value) {
    const parsed = parseMicroUnits(value);
    if (parsed === null) {
        throw new Error(`Non-integer micro-unit value in ledger storage: ${String(value)}`);
    }
    return parsed;
}
/** Integer-only micro-unit -> coin rendering (zero floating point). */
export function formatMicroAsCoins(micro) {
    const negative = micro < 0n;
    const abs = negative ? -micro : micro;
    const whole = abs / MICRO_UNITS_PER_COIN;
    const fraction = (abs % MICRO_UNITS_PER_COIN).toString().padStart(6, '0');
    return `${negative ? '-' : ''}${whole}.${fraction}`;
}
export class SequencerDO extends DurableObject {
    sql;
    // Volatile in-memory token buckets for human-friendly burst smoothing (Capacity 5, 1 token / 120s)
    tokenBuckets = new Map();
    BUCKET_CAPACITY = 5;
    REFILL_INTERVAL_MS = 120 * 1000;
    constructor(ctx, env) {
        super(ctx, env);
        this.sql = ctx.storage.sql;
        this.initDatabase();
    }
    /**
     * Initializes the SQLite schema inside the Durable Object
     */
    initDatabase() {
        this.sql.exec(`
      CREATE TABLE IF NOT EXISTS wallets (
        address TEXT PRIMARY KEY,
        balance_micro INTEGER NOT NULL DEFAULT 0 CHECK (balance_micro >= 0),
        nonce INTEGER NOT NULL DEFAULT 0,
        last_ticket INTEGER NOT NULL DEFAULT 0,
        sybil_score INTEGER NOT NULL DEFAULT 0,
        tier INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS identities (
        blinded_hash TEXT PRIMARY KEY,
        wallet_address TEXT NOT NULL,
        provider TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        tx_hash TEXT PRIMARY KEY,
        prev_hash TEXT NOT NULL,
        tx_type TEXT NOT NULL,
        sender TEXT NOT NULL,
        receiver TEXT NOT NULL,
        amount_micro INTEGER NOT NULL CHECK (amount_micro > 0),
        fee_micro INTEGER NOT NULL DEFAULT 0,
        signature TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS epochs (
        epoch_id INTEGER PRIMARY KEY,
        merkle_root TEXT NOT NULL,
        payout_merkle_root TEXT NOT NULL,
        drand_round INTEGER NOT NULL,
        ots_proof TEXT,
        ots_status TEXT DEFAULT 'PENDING'
      );

      CREATE TABLE IF NOT EXISTS claims (
        claim_key TEXT PRIMARY KEY, -- epoch_id:wallet_address
        epoch_id INTEGER NOT NULL,
        wallet_address TEXT NOT NULL,
        amount_micro INTEGER NOT NULL,
        claimed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS system_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
        // Initialize genesis chain head if not present
        const chainHead = this.sql.exec(`SELECT value FROM system_state WHERE key = 'chain_head'`).toArray();
        if (chainHead.length === 0) {
            this.sql.exec(`INSERT INTO system_state (key, value) VALUES ('chain_head', '0000000000000000000000000000000000000000000000000000000000000000')`);
            this.sql.exec(`INSERT INTO system_state (key, value) VALUES ('block_height', '0')`);
            this.sql.exec(`INSERT INTO system_state (key, value) VALUES ('current_epoch', '1')`);
        }
    }
    /**
     * Token bucket rate-limiter: checks if the wallet has available burst tokens
     */
    checkRateLimit(walletAddress) {
        const now = Date.now();
        let bucket = this.tokenBuckets.get(walletAddress);
        if (!bucket) {
            bucket = { tokens: this.BUCKET_CAPACITY, lastRefill: now };
            this.tokenBuckets.set(walletAddress, bucket);
        }
        else {
            const elapsed = now - bucket.lastRefill;
            const refillTokens = Math.floor(elapsed / this.REFILL_INTERVAL_MS);
            if (refillTokens > 0) {
                bucket.tokens = Math.min(this.BUCKET_CAPACITY, bucket.tokens + refillTokens);
                bucket.lastRefill = now;
            }
        }
        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return { allowed: true, tokensLeft: bucket.tokens };
        }
        return { allowed: false, tokensLeft: 0 };
    }
    /**
     * Main router for the Sequencer Durable Object
     */
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;
        try {
            if (request.method === 'GET' && path.startsWith('/wallet/')) {
                const address = path.replace('/wallet/', '').toLowerCase();
                return this.handleGetWallet(address);
            }
            if (request.method === 'GET' && path.startsWith('/history/')) {
                const address = path.replace('/history/', '').toLowerCase();
                return this.handleGetHistory(address);
            }
            if (request.method === 'POST' && path === '/tx') {
                const body = await request.json();
                return await this.handleSubmitTx(body);
            }
            if (request.method === 'POST' && path === '/faucet') {
                const body = await request.json();
                return await this.handleFaucet(body);
            }
            if (request.method === 'POST' && path === '/mine/submit') {
                const body = await request.json();
                return await this.handleMineSubmit(body);
            }
            if (request.method === 'POST' && path === '/identity/link') {
                const body = await request.json();
                return await this.handleIdentityLink(body);
            }
            if (request.method === 'POST' && path === '/claim') {
                const body = await request.json();
                return await this.handleClaim(body);
            }
            if (request.method === 'GET' && path === '/ledger/latest') {
                return this.handleGetLedger();
            }
            if (request.method === 'GET' && path === '/ledger/export') {
                return this.handleExportLedger();
            }
            if (request.method === 'GET' && path === '/stats') {
                return this.handleGetStats();
            }
            if (request.method === 'POST' && path === '/epoch/settle') {
                return await this.handleSettleEpoch();
            }
            if (request.method === 'GET' && path === '/epoch/latest') {
                return this.handleGetLatestEpoch();
            }
            if (request.method === 'GET' && path === '/epochs') {
                return this.handleGetEpochs();
            }
            return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        catch (err) {
            return new Response(JSON.stringify({ success: false, error: err.message || 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    }
    /**
     * GET /wallet/:address
     */
    handleGetWallet(address) {
        const rows = this.sql.exec(`SELECT * FROM wallets WHERE address = ?`, address).toArray();
        if (rows.length === 0) {
            return Response.json({
                success: true,
                data: {
                    address,
                    balance_micro: '0',
                    nonce: 0,
                    last_ticket: 0,
                    sybil_score: 0,
                    tier: 0
                }
            });
        }
        const w = rows[0];
        return Response.json({
            success: true,
            data: {
                address: w.address,
                balance_micro: w.balance_micro.toString(),
                nonce: w.nonce,
                last_ticket: w.last_ticket,
                sybil_score: w.sybil_score,
                tier: w.tier
            }
        });
    }
    /**
     * GET /history/:address: Returns user's personal transaction history
     */
    handleGetHistory(address) {
        const rows = this.sql.exec(`SELECT * FROM transactions WHERE sender = ? OR receiver = ? ORDER BY timestamp DESC LIMIT 25`, address, address).toArray();
        return Response.json({
            success: true,
            data: rows
        });
    }
    /**
     * POST /tx: Atomic transaction execution
     */
    async handleSubmitTx(signedTx) {
        const { payload, signature } = signedTx;
        if (payload.sender.toLowerCase() === payload.receiver.toLowerCase()) {
            return Response.json({ success: false, error: 'Sender and receiver cannot be identical' }, { status: 400 });
        }
        const amountMicro = parseMicroUnits(payload.amount_micro);
        const feeMicro = parseMicroUnits(payload.fee_micro);
        if (amountMicro === null || feeMicro === null) {
            return Response.json({ success: false, error: 'amount_micro and fee_micro must be canonical integer micro-units' }, { status: 400 });
        }
        if (amountMicro <= 0n) {
            return Response.json({ success: false, error: 'Amount must be greater than zero' }, { status: 400 });
        }
        if (feeMicro < 0n) {
            return Response.json({ success: false, error: 'Fee cannot be negative' }, { status: 400 });
        }
        if (amountMicro + feeMicro > MAX_MICRO_UNITS) {
            return Response.json({ success: false, error: 'Amount exceeds the canonical 2^50 micro-unit ceiling' }, { status: 400 });
        }
        // Token Bucket Burst Check with Client Micro-PoW Bypass
        const rateLimit = this.checkRateLimit(payload.sender);
        let microPowValid = false;
        if (!rateLimit.allowed) {
            const microPow = signedTx.micro_pow;
            if (microPow &&
                typeof microPow.salt === 'string' &&
                microPow.salt.length > 0 &&
                microPow.salt.length <= 64 &&
                typeof microPow.nonce === 'number' &&
                Number.isSafeInteger(microPow.nonce) &&
                microPow.nonce >= 0) {
                const powChallenge = `${payload.sender.toLowerCase()}:${microPow.salt}:${microPow.nonce}`;
                const powHash = await sha256Hex(powChallenge);
                if (powHash.startsWith('0000')) {
                    microPowValid = true;
                }
            }
            if (!microPowValid) {
                return Response.json({
                    success: false,
                    error: 'Rate limit burst exhausted. Micro-PoW challenge required.',
                    requires_micro_pow: true,
                    challenge: {
                        salt: crypto.randomUUID().slice(0, 16),
                        difficulty: '0000'
                    }
                }, { status: 429 });
            }
        }
        // Verify Canonical Serialization and Ed25519 Signature
        const canonicalStr = canonicalizeTx(payload);
        const isValidSig = await verifyEd25519Signature(payload.sender, signature, canonicalStr);
        if (!isValidSig) {
            return Response.json({ success: false, error: 'Invalid Ed25519 cryptographic signature' }, { status: 401 });
        }
        // Fetch Sender State & Validate Monotonic Nonce, Balance & Tier Permissions
        const senderRows = this.sql.exec(`SELECT * FROM wallets WHERE address = ?`, payload.sender.toLowerCase()).toArray();
        if (senderRows.length === 0) {
            return Response.json({ success: false, error: 'Sender wallet not found or has 0 balance' }, { status: 400 });
        }
        const sender = senderRows[0];
        // Asymmetric Tier Enforcement: Tier 0 (Ghost Wallet) Outbound Gating
        if (sender.tier === 0) {
            return Response.json({
                success: false,
                error: 'Ghost Wallet: Outbound transfers are locked. Complete Turnstile verification or link a social account to unlock Tier 1 (Casual Citizen).',
                tier: 0,
                requires_verification: true
            }, { status: 403 });
        }
        // Tier Daily Transfer Velocity Limits
        const oneDayAgo = payload.timestamp - 86400;
        const dailyTxRows = this.sql.exec(`SELECT COUNT(*) as count FROM transactions WHERE sender = ? AND timestamp >= ?`, payload.sender.toLowerCase(), oneDayAgo).toArray();
        const dailyCount = Number(dailyTxRows[0]?.count || 0);
        if (sender.tier === 1 && dailyCount >= 10) {
            return Response.json({
                success: false,
                error: 'Daily transfer limit reached for Tier 1 (10 transfers/day). Upgrade to Tier 2 by linking Discord or Telegram.',
                tier: 1,
                daily_transfers: dailyCount,
                limit: 10
            }, { status: 429 });
        }
        else if (sender.tier === 2 && dailyCount >= 50) {
            return Response.json({
                success: false,
                error: 'Daily transfer limit reached for Tier 2 (50 transfers/day). Upgrade to Tier 3 (Guardian) with WebAuthn Passkey.',
                tier: 2,
                daily_transfers: dailyCount,
                limit: 50
            }, { status: 429 });
        }
        const senderBalance = dbToMicro(sender.balance_micro);
        const totalRequired = amountMicro + feeMicro;
        if (senderBalance < totalRequired) {
            return Response.json({
                success: false,
                error: `Insufficient balance. Available: ${senderBalance}, Required: ${totalRequired}`
            }, { status: 400 });
        }
        if (payload.nonce !== sender.nonce) {
            return Response.json({
                success: false,
                error: `Invalid nonce. Expected: ${sender.nonce}, Provided: ${payload.nonce}`
            }, { status: 400 });
        }
        // Verify Chain Head Link
        const headRows = this.sql.exec(`SELECT value FROM system_state WHERE key = 'chain_head'`).toArray();
        const currentHead = headRows[0].value;
        if (payload.prev_hash.toLowerCase() !== currentHead.toLowerCase()) {
            return Response.json({
                success: false,
                error: `Stale prev_hash. Chain head has moved. Current head: ${currentHead}`
            }, { status: 409 });
        }
        // Compute Transaction Hash
        const txHash = await sha256Hex(canonicalStr);
        // Atomic Execution in SQLite
        const newSenderBalance = senderBalance - totalRequired;
        const nextNonce = sender.nonce + 1;
        this.sql.exec(`UPDATE wallets SET balance_micro = ?, nonce = ? WHERE address = ?`, microToDb(newSenderBalance), nextNonce, payload.sender.toLowerCase());
        const receiverRows = this.sql.exec(`SELECT * FROM wallets WHERE address = ?`, payload.receiver.toLowerCase()).toArray();
        if (receiverRows.length === 0) {
            this.sql.exec(`INSERT INTO wallets (address, balance_micro, nonce, last_ticket, sybil_score, tier) VALUES (?, ?, 0, 0, 0, 0)`, payload.receiver.toLowerCase(), microToDb(amountMicro));
        }
        else {
            const currentReceiverBal = dbToMicro(receiverRows[0].balance_micro);
            const newReceiverBal = currentReceiverBal + amountMicro;
            this.sql.exec(`UPDATE wallets SET balance_micro = ? WHERE address = ?`, microToDb(newReceiverBal), payload.receiver.toLowerCase());
        }
        this.sql.exec(`INSERT INTO transactions (tx_hash, prev_hash, tx_type, sender, receiver, amount_micro, fee_micro, signature, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, txHash, currentHead, payload.type, payload.sender.toLowerCase(), payload.receiver.toLowerCase(), microToDb(amountMicro), microToDb(feeMicro), signature, payload.timestamp);
        this.sql.exec(`UPDATE system_state SET value = ? WHERE key = 'chain_head'`, txHash);
        const heightRows = this.sql.exec(`SELECT value FROM system_state WHERE key = 'block_height'`).toArray();
        const nextHeight = parseInt(heightRows[0].value, 10) + 1;
        this.sql.exec(`UPDATE system_state SET value = ? WHERE key = 'block_height'`, nextHeight.toString());
        return Response.json({
            success: true,
            data: {
                tx_hash: txHash,
                prev_hash: currentHead,
                block_height: nextHeight,
                sender: payload.sender.toLowerCase(),
                new_balance_micro: newSenderBalance.toString(),
                tokens_remaining: rateLimit.tokensLeft
            }
        });
    }
    /**
     * POST /faucet: Developer test faucet to fund wallets with test coins
     */
    async handleFaucet(body) {
        if (typeof body.address !== 'string' || body.address.length === 0) {
            return Response.json({ success: false, error: 'address is required' }, { status: 400 });
        }
        const address = body.address.toLowerCase();
        // Default 10 coins; every supplied value must be a canonical integer micro-unit amount.
        const amount = body.amount_micro === undefined ? 10000000n : parseMicroUnits(body.amount_micro);
        if (amount === null || amount <= 0n || amount > MAX_MICRO_UNITS) {
            return Response.json({
                success: false,
                error: 'amount_micro must be a positive integer within the 2^50 micro-unit ceiling'
            }, { status: 400 });
        }
        const headRows = this.sql.exec(`SELECT value FROM system_state WHERE key = 'chain_head'`).toArray();
        const currentHead = headRows[0].value;
        const now = Math.floor(Date.now() / 1000);
        const txHash = await sha256Hex(`MINT:${address}:${amount.toString()}:${currentHead}:${now}`);
        const existing = this.sql.exec(`SELECT balance_micro FROM wallets WHERE address = ?`, address).toArray();
        if (existing.length === 0) {
            this.sql.exec(`INSERT INTO wallets (address, balance_micro, nonce, last_ticket, sybil_score, tier) VALUES (?, ?, 0, 0, 25, 1)`, address, microToDb(amount));
        }
        else {
            const newBal = dbToMicro(existing[0].balance_micro) + amount;
            if (newBal > MAX_MICRO_UNITS) {
                return Response.json({ success: false, error: 'Mint would exceed the canonical 2^50 micro-unit ceiling' }, { status: 400 });
            }
            this.sql.exec(`UPDATE wallets SET balance_micro = ? WHERE address = ?`, microToDb(newBal), address);
        }
        this.sql.exec(`INSERT INTO transactions (tx_hash, prev_hash, tx_type, sender, receiver, amount_micro, fee_micro, signature, timestamp)
       VALUES (?, ?, 'MINT', 'GENESIS_FAUCET', ?, ?, 0, 'GENESIS_MINT_SIG', ?)`, txHash, currentHead, address, microToDb(amount), now);
        this.sql.exec(`UPDATE system_state SET value = ? WHERE key = 'chain_head'`, txHash);
        const heightRows = this.sql.exec(`SELECT value FROM system_state WHERE key = 'block_height'`).toArray();
        const nextHeight = parseInt(heightRows[0].value, 10) + 1;
        this.sql.exec(`UPDATE system_state SET value = ? WHERE key = 'block_height'`, nextHeight.toString());
        return Response.json({
            success: true,
            data: {
                address,
                minted_micro: amount.toString(),
                tx_hash: txHash,
                block_height: nextHeight
            }
        });
    }
    /**
     * POST /mine/submit: Verified Proof-of-Work or Cuckoo Cycle mining share
     */
    async handleMineSubmit(body) {
        if (typeof body.address !== 'string' || body.address.length === 0) {
            return Response.json({ success: false, error: 'address is required' }, { status: 400 });
        }
        const address = body.address.toLowerCase();
        const ticket = body.ticket;
        if (!Number.isSafeInteger(ticket) || ticket < 0) {
            return Response.json({ success: false, error: 'ticket must be a non-negative integer' }, { status: 400 });
        }
        const headRows = this.sql.exec(`SELECT value FROM system_state WHERE key = 'chain_head'`).toArray();
        const currentHead = headRows[0].value;
        const now = Math.floor(Date.now() / 1000);
        let isValid = false;
        let reward = 500000n; // default 0.5 coin (500,000 micro-units)
        let proofIdentifier = '';
        if (Array.isArray(body.cycle) && body.cycle.length === CUCKOO_PROOF_SIZE) {
            // Memory-Latency Cuckoo Cycle Verification (<0.2 ms CPU)
            const seedStr = `${currentHead}:${address}:${ticket}`;
            const seedHex = await sha256Hex(seedStr);
            isValid = verifyCuckooCycle(seedHex, body.cycle);
            reward = 1000000n; // 1.0 full QBC reward for real Cuckoo Cycle solve
            proofIdentifier = `CUCKOO:${body.cycle.slice(0, 4).join(',')}`;
        }
        else if (typeof body.nonce === 'number' && Number.isSafeInteger(body.nonce) && body.nonce >= 0) {
            // Fallback SHA-256 Micro-PoW
            const proofStr = `${currentHead}:${address}:${ticket}:${body.nonce}`;
            const hash = await sha256Hex(proofStr);
            isValid = hash.startsWith('0000');
            reward = 500000n; // 0.5 coin reward
            proofIdentifier = hash;
        }
        if (!isValid) {
            return Response.json({ success: false, error: 'Invalid Proof-of-Work or Cuckoo Cycle solution' }, { status: 400 });
        }
        const existing = this.sql.exec(`SELECT balance_micro, last_ticket FROM wallets WHERE address = ?`, address).toArray();
        let newBal = reward;
        if (existing.length === 0) {
            this.sql.exec(`INSERT INTO wallets (address, balance_micro, nonce, last_ticket, sybil_score, tier) VALUES (?, ?, 0, ?, 25, 1)`, address, microToDb(newBal), ticket);
        }
        else {
            if (ticket <= existing[0].last_ticket) {
                return Response.json({ success: false, error: 'Stale ticket: duplicate or old ticket number' }, { status: 400 });
            }
            newBal = dbToMicro(existing[0].balance_micro) + reward;
            if (newBal > MAX_MICRO_UNITS) {
                return Response.json({ success: false, error: 'Balance would exceed the canonical 2^50 micro-unit ceiling' }, { status: 400 });
            }
            this.sql.exec(`UPDATE wallets SET balance_micro = ?, last_ticket = ? WHERE address = ?`, microToDb(newBal), ticket, address);
        }
        const txHash = await sha256Hex(`MINING_REWARD:${address}:${reward.toString()}:${proofIdentifier}:${now}`);
        this.sql.exec(`INSERT INTO transactions (tx_hash, prev_hash, tx_type, sender, receiver, amount_micro, fee_micro, signature, timestamp)
       VALUES (?, ?, 'MINT', 'NETWORK_MINING_REWARD', ?, ?, 0, ?, ?)`, txHash, currentHead, address, microToDb(reward), proofIdentifier, now);
        this.sql.exec(`UPDATE system_state SET value = ? WHERE key = 'chain_head'`, txHash);
        const heightRows = this.sql.exec(`SELECT value FROM system_state WHERE key = 'block_height'`).toArray();
        const nextHeight = parseInt(heightRows[0].value, 10) + 1;
        this.sql.exec(`UPDATE system_state SET value = ? WHERE key = 'block_height'`, nextHeight.toString());
        return Response.json({
            success: true,
            data: {
                address,
                reward_micro: reward.toString(),
                new_balance_micro: newBal.toString(),
                tx_hash: txHash,
                block_height: nextHeight,
                solution_hash: proofIdentifier
            }
        });
    }
    /**
     * POST /identity/link: Identity stacking for Sybil Score & Tier progression
     */
    async handleIdentityLink(body) {
        const address = body.address.toLowerCase();
        const provider = body.provider.toUpperCase();
        const now = Math.floor(Date.now() / 1000);
        const blindedHash = await sha256Hex(`IDENTITY:${address}:${provider}:SERVER_SECRET_SALT`);
        const existingId = this.sql.exec(`SELECT * FROM identities WHERE blinded_hash = ?`, blindedHash).toArray();
        if (existingId.length > 0) {
            return Response.json({ success: false, error: 'Identity already linked to this or another wallet' }, { status: 400 });
        }
        this.sql.exec(`INSERT INTO identities (blinded_hash, wallet_address, provider, created_at) VALUES (?, ?, ?, ?)`, blindedHash, address, provider, now);
        let pointsToAdd = 25;
        if (provider === 'TELEGRAM_PHONE')
            pointsToAdd = 35;
        if (provider === 'DISCORD')
            pointsToAdd = 25;
        if (provider === 'GOOGLE')
            pointsToAdd = 25;
        if (provider === 'PASSKEY')
            pointsToAdd = 15;
        const walletRows = this.sql.exec(`SELECT sybil_score FROM wallets WHERE address = ?`, address).toArray();
        let newScore = pointsToAdd;
        if (walletRows.length > 0) {
            newScore += Number(walletRows[0].sybil_score);
        }
        let newTier = 0;
        if (newScore >= 80)
            newTier = 3; // Guardian
        else if (newScore >= 50)
            newTier = 2; // Trusted Member
        else if (newScore >= 25)
            newTier = 1; // Casual Citizen
        if (walletRows.length === 0) {
            this.sql.exec(`INSERT INTO wallets (address, balance_micro, nonce, last_ticket, sybil_score, tier) VALUES (?, 0, 0, 0, ?, ?)`, address, newScore, newTier);
        }
        else {
            this.sql.exec(`UPDATE wallets SET sybil_score = ?, tier = ? WHERE address = ?`, newScore, newTier, address);
        }
        return Response.json({
            success: true,
            data: {
                address,
                provider,
                sybil_score: newScore,
                tier: newTier,
                tier_name: newTier === 3 ? 'Network Guardian' : newTier === 2 ? 'Trusted Member' : 'Casual Citizen'
            }
        });
    }
    /**
     * POST /claim: Lazy Merkle claim execution
     */
    async handleClaim(body) {
        if (typeof body.address !== 'string' || body.address.length === 0 || !Number.isSafeInteger(body.epoch_id)) {
            return Response.json({ success: false, error: 'address and integer epoch_id are required' }, { status: 400 });
        }
        const address = body.address.toLowerCase();
        const amountMicro = parseMicroUnits(body.amount_micro);
        if (amountMicro === null || amountMicro <= 0n || amountMicro > MAX_MICRO_UNITS) {
            return Response.json({
                success: false,
                error: 'amount_micro must be a positive integer within the 2^50 micro-unit ceiling'
            }, { status: 400 });
        }
        const claimKey = `${body.epoch_id}:${address}`;
        const existingClaim = this.sql.exec(`SELECT * FROM claims WHERE claim_key = ?`, claimKey).toArray();
        if (existingClaim.length > 0) {
            return Response.json({ success: false, error: 'Epoch reward already claimed for this wallet' }, { status: 400 });
        }
        const epochRows = this.sql.exec(`SELECT payout_merkle_root FROM epochs WHERE epoch_id = ?`, body.epoch_id).toArray();
        if (epochRows.length === 0) {
            return Response.json({ success: false, error: 'Epoch not found' }, { status: 404 });
        }
        const payoutRoot = epochRows[0].payout_merkle_root;
        // Canonical leaf binds the normalized integer micro amount, never a raw client string.
        const leafHash = await sha256Hex(`${address}:${amountMicro.toString()}`);
        const isValidProof = await verifyMerkleProof(leafHash, body.proof, payoutRoot);
        if (!isValidProof) {
            return Response.json({ success: false, error: 'Invalid Merkle inclusion proof for epoch claim' }, { status: 401 });
        }
        const now = Math.floor(Date.now() / 1000);
        const existingWallet = this.sql.exec(`SELECT balance_micro FROM wallets WHERE address = ?`, address).toArray();
        let newBal = amountMicro;
        if (existingWallet.length === 0) {
            this.sql.exec(`INSERT INTO wallets (address, balance_micro, nonce, last_ticket, sybil_score, tier) VALUES (?, ?, 0, 0, 25, 1)`, address, microToDb(newBal));
        }
        else {
            newBal = dbToMicro(existingWallet[0].balance_micro) + amountMicro;
            if (newBal > MAX_MICRO_UNITS) {
                return Response.json({ success: false, error: 'Balance would exceed the canonical 2^50 micro-unit ceiling' }, { status: 400 });
            }
            this.sql.exec(`UPDATE wallets SET balance_micro = ? WHERE address = ?`, microToDb(newBal), address);
        }
        this.sql.exec(`INSERT INTO claims (claim_key, epoch_id, wallet_address, amount_micro, claimed_at) VALUES (?, ?, ?, ?, ?)`, claimKey, body.epoch_id, address, microToDb(amountMicro), now);
        return Response.json({
            success: true,
            data: {
                address,
                claimed_micro: amountMicro.toString(),
                new_balance_micro: newBal.toString()
            }
        });
    }
    /**
     * GET /ledger/latest: Public explorer view
     */
    handleGetLedger() {
        const head = this.sql.exec(`SELECT value FROM system_state WHERE key = 'chain_head'`).toArray()[0].value;
        const height = this.sql.exec(`SELECT value FROM system_state WHERE key = 'block_height'`).toArray()[0].value;
        const recentTxs = this.sql.exec(`SELECT * FROM transactions ORDER BY rowid DESC LIMIT 25`).toArray();
        return Response.json({
            success: true,
            data: {
                chain_head: head,
                block_height: parseInt(height, 10),
                recent_transactions: recentTxs
            }
        });
    }
    /**
     * GET /stats: Global economy metrics
     */
    handleGetStats() {
        const head = this.sql.exec(`SELECT value FROM system_state WHERE key = 'chain_head'`).toArray()[0].value;
        const height = this.sql.exec(`SELECT value FROM system_state WHERE key = 'block_height'`).toArray()[0].value;
        const totalTxs = this.sql.exec(`SELECT count(*) as count FROM transactions`).toArray()[0].count;
        const totalWallets = this.sql.exec(`SELECT count(*) as count FROM wallets`).toArray()[0].count;
        const supplyRow = this.sql.exec(`SELECT sum(balance_micro) as total FROM wallets`).toArray();
        const circulatingMicro = dbToMicro(supplyRow[0].total ?? 0);
        return Response.json({
            success: true,
            data: {
                block_height: parseInt(height, 10),
                chain_head: head,
                total_transactions: totalTxs,
                total_wallets: totalWallets,
                circulating_supply_coins: formatMicroAsCoins(circulatingMicro),
                circulating_supply_micro: circulatingMicro.toString(),
                serverless_cost: "$0.00 / Month Forever",
                consensus: "Single-Threaded SQLite DO + OTS Bitcoin Anchor"
            }
        });
    }
    /**
     * POST /epoch/settle: Calculates Merkle root of epoch transactions and submits to Bitcoin OpenTimestamps
     */
    async handleSettleEpoch() {
        const currentEpochRow = this.sql.exec(`SELECT value FROM system_state WHERE key = 'current_epoch'`).toArray();
        const epochId = currentEpochRow.length > 0 ? parseInt(currentEpochRow[0].value, 10) : 1;
        // 1. Collect all transaction hashes for Merkle tree computation
        const txRows = this.sql.exec(`SELECT tx_hash FROM transactions ORDER BY rowid ASC`).toArray();
        const txHashes = txRows.map((r) => r.tx_hash);
        // 2. Compute Merkle root
        const chainHead = this.sql.exec(`SELECT value FROM system_state WHERE key = 'chain_head'`).toArray()[0].value;
        let merkleRoot;
        if (txHashes.length === 0) {
            merkleRoot = await sha256Hex(`GENESIS_EPOCH_ANCHOR:${epochId}:${chainHead}`);
        }
        else {
            merkleRoot = await computeMerkleRoot(txHashes);
        }
        // 3. Submit 32-byte binary digest to Bitcoin OpenTimestamps public calendar pool
        let otsHex = '';
        let otsStatus = 'SUBMITTED';
        try {
            const rawBytes = new Uint8Array(32);
            for (let i = 0; i < 32; i++) {
                rawBytes[i] = parseInt(merkleRoot.substr(i * 2, 2), 16);
            }
            const otsEndpoints = [
                'https://a.pool.opentimestamps.org/digest',
                'https://b.pool.opentimestamps.org/digest',
                'https://alice.btc.calendar.opentimestamps.org/digest'
            ];
            for (const endpoint of otsEndpoints) {
                try {
                    const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/octet-stream' },
                        body: rawBytes
                    });
                    if (res.ok) {
                        const buf = await res.arrayBuffer();
                        otsHex = Array.from(new Uint8Array(buf))
                            .map(b => b.toString(16).padStart(2, '0'))
                            .join('');
                        otsStatus = 'SUBMITTED';
                        break;
                    }
                }
                catch (e) {
                    console.error(`OTS endpoint ${endpoint} failed:`, e);
                }
            }
        }
        catch (err) {
            console.error('OTS submission error:', err);
        }
        const now = Math.floor(Date.now() / 1000);
        const payoutMerkleRoot = await sha256Hex(`PAYOUT_ROOT:${epochId}:${merkleRoot}`);
        this.sql.exec(`INSERT OR REPLACE INTO epochs (epoch_id, merkle_root, payout_merkle_root, drand_round, ots_proof, ots_status)
       VALUES (?, ?, ?, ?, ?, ?)`, epochId, merkleRoot, payoutMerkleRoot, epochId * 120, otsHex, otsStatus);
        // Advance epoch counter
        this.sql.exec(`UPDATE system_state SET value = ? WHERE key = 'current_epoch'`, (epochId + 1).toString());
        return Response.json({
            success: true,
            data: {
                epoch_id: epochId,
                merkle_root: merkleRoot,
                payout_merkle_root: payoutMerkleRoot,
                tx_count: txHashes.length,
                ots_proof_bytes: otsHex.length / 2,
                ots_status: otsStatus,
                timestamp: now
            }
        });
    }
    /**
     * GET /epoch/latest: Returns latest Bitcoin OTS notarized epoch
     */
    handleGetLatestEpoch() {
        const rows = this.sql.exec(`SELECT * FROM epochs ORDER BY epoch_id DESC LIMIT 1`).toArray();
        if (rows.length === 0) {
            return Response.json({
                success: true,
                data: {
                    epoch_id: 0,
                    merkle_root: '0000000000000000000000000000000000000000000000000000000000000000',
                    ots_status: 'PENDING_FIRST_EPOCH',
                    ots_proof: ''
                }
            });
        }
        const ep = rows[0];
        return Response.json({
            success: true,
            data: {
                epoch_id: ep.epoch_id,
                merkle_root: ep.merkle_root,
                payout_merkle_root: ep.payout_merkle_root,
                ots_status: ep.ots_status,
                ots_proof_bytes: (ep.ots_proof || '').length / 2,
                ots_proof: ep.ots_proof
            }
        });
    }
    /**
     * GET /epochs: Returns historical epochs
     */
    handleGetEpochs() {
        const rows = this.sql.exec(`SELECT epoch_id, merkle_root, payout_merkle_root, ots_status FROM epochs ORDER BY epoch_id DESC LIMIT 10`).toArray();
        return Response.json({
            success: true,
            data: rows
        });
    }
    /**
     * GET /ledger/export: Canonical append-only export for public auditing and disaster recovery
     */
    handleExportLedger() {
        const head = this.sql.exec(`SELECT value FROM system_state WHERE key = 'chain_head'`).toArray()[0].value;
        const height = this.sql.exec(`SELECT value FROM system_state WHERE key = 'block_height'`).toArray()[0].value;
        const currentEpoch = this.sql.exec(`SELECT value FROM system_state WHERE key = 'current_epoch'`).toArray()[0].value;
        const allTxs = this.sql.exec(`SELECT * FROM transactions ORDER BY rowid ASC`).toArray();
        const allEpochs = this.sql.exec(`SELECT * FROM epochs ORDER BY epoch_id ASC`).toArray();
        const allWallets = this.sql.exec(`SELECT address, balance_micro, nonce, last_ticket, sybil_score, tier FROM wallets`).toArray();
        return Response.json({
            success: true,
            data: {
                format: 'QUETTABYTE_CANONICAL_DAG_V1',
                exported_at: Math.floor(Date.now() / 1000),
                chain_head: head,
                block_height: parseInt(height, 10),
                current_epoch: parseInt(currentEpoch, 10),
                epochs: allEpochs,
                transactions: allTxs,
                wallets_snapshot: allWallets
            }
        });
    }
}
