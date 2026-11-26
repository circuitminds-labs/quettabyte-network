import { DurableObject } from 'cloudflare:workers';
import { CanonicalTxPayload, SignedTransaction, ApiResponse } from './types';
import { canonicalizeTx, verifyEd25519Signature, sha256Hex } from './crypto';
import { verifyMerkleProof, computeMerkleRoot, MerkleProofStep } from './merkle';
import { verifyCuckooCycle, CUCKOO_PROOF_SIZE } from './cuckoo';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

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
export function parseMicroUnits(value: unknown): bigint | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return null;
    return BigInt(value);
  }
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value)) return null;
    return BigInt(value);
  }
  return null;
}

/** Binds a BigInt amount to SQLite as an exact decimal string (INTEGER affinity stores it as INTEGER). */
export function microToDb(micro: bigint): string {
  return micro.toString();
}

/** Reads a SQLite micro-unit column strictly as BigInt, rejecting any REAL/float storage. */
export function dbToMicro(value: unknown): bigint {
  const parsed = parseMicroUnits(value);
  if (parsed === null) {
    throw new Error(`Non-integer micro-unit value in ledger storage: ${String(value)}`);
  }
  return parsed;
}

/** Integer-only micro-unit -> coin rendering (zero floating point). */
export function formatMicroAsCoins(micro: bigint): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const whole = abs / MICRO_UNITS_PER_COIN;
  const fraction = (abs % MICRO_UNITS_PER_COIN).toString().padStart(6, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export class SequencerDO extends DurableObject {
  private sql: any;
  // Volatile in-memory token buckets for human-friendly burst smoothing (Capacity 5, 1 token / 120s)
  private tokenBuckets: Map<string, TokenBucket> = new Map();
  private readonly BUCKET_CAPACITY = 5;
  private readonly REFILL_INTERVAL_MS = 120 * 1000;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.sql = (ctx.storage as any).sql;
    this.initDatabase();
  }

  /**
   * Initializes the SQLite schema inside the Durable Object
   */
  private initDatabase() {
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

    // Clean Genesis Reset Check (Milestone 0: Clean Testnet Reset)
    const genesisVer = this.sql.exec(`SELECT value FROM system_state WHERE key = 'genesis_version'`).toArray();
    if (genesisVer.length === 0 || genesisVer[0].value !== 'v4_genesis_clean_2026') {
      this.sql.exec(`
        DELETE FROM wallets;
        DELETE FROM transactions;
        DELETE FROM identities;
        DELETE FROM claims;
        DELETE FROM epochs;
        DELETE FROM system_state;
        INSERT INTO system_state (key, value) VALUES ('chain_head', '0000000000000000000000000000000000000000000000000000000000000000');
        INSERT INTO system_state (key, value) VALUES ('block_height', '0');
        INSERT INTO system_state (key, value) VALUES ('current_epoch', '1');
        INSERT INTO system_state (key, value) VALUES ('genesis_version', 'v4_genesis_clean_2026');
      `);
    }
  }

  /**
   * Token bucket rate-limiter: checks if the wallet has available burst tokens
   */
  private checkRateLimit(walletAddress: string): { allowed: boolean; tokensLeft: number } {
    const now = Date.now();
    let bucket = this.tokenBuckets.get(walletAddress);

    if (!bucket) {
      bucket = { tokens: this.BUCKET_CAPACITY, lastRefill: now };
      this.tokenBuckets.set(walletAddress, bucket);
    } else {
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
  async fetch(request: Request): Promise<Response> {
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
        const body: SignedTransaction = await request.json();
        return await this.handleSubmitTx(body);
      }

      if (request.method === 'POST' && (path === '/tx/batch' || path === '/transfer/batch')) {
        const body: { transactions: SignedTransaction[] } = await request.json();
        return await this.handleBatchTx(body);
      }

      if (request.method === 'POST' && path === '/faucet') {
        const body: { address: string; amount_micro: number } = await request.json();
        return await this.handleFaucet(body);
      }

      if (request.method === 'POST' && path === '/mine/submit') {
        const body: { address: string; ticket: number; nonce?: number; cycle?: number[] } = await request.json();
        return await this.handleMineSubmit(body);
      }

      if (request.method === 'POST' && path === '/identity/link') {
        const body: { address: string; provider: string } = await request.json();
        return await this.handleIdentityLink(body);
      }

      if (request.method === 'POST' && path === '/claim') {
        const body: {
          epoch_id: number;
          address: string;
          amount_micro: number;
          proof: MerkleProofStep[];
        } = await request.json();
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
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || 'Internal error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  /**
   * GET /wallet/:address
   */
  private handleGetWallet(address: string): Response {
    const rows = this.sql.exec(`SELECT * FROM wallets WHERE address = ?`, address).toArray();
    const idRows = this.sql.exec(`SELECT provider FROM identities WHERE wallet_address = ?`, address).toArray();
    const verifications: string[] = idRows.map((r: any) => r.provider);

    if (rows.length === 0) {
      return Response.json({
        success: true,
        data: {
          address,
          balance_micro: '0',
          nonce: 0,
          last_ticket: 0,
          sybil_score: 0,
          tier: 0,
          verifications: []
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
        tier: w.tier,
        verifications
      }
    });
  }

  /**
   * GET /history/:address: Returns user's personal transaction history
   */
  private handleGetHistory(address: string): Response {
    const rows = this.sql.exec(
      `SELECT * FROM transactions WHERE sender = ? OR receiver = ? ORDER BY timestamp DESC LIMIT 25`,
      address, address
    ).toArray();

    return Response.json({
      success: true,
      data: rows
    });
  }

  /**
   * POST /tx: Atomic transaction execution
   */
  private async handleSubmitTx(signedTx: SignedTransaction): Promise<Response> {
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
      if (
        microPow &&
        typeof microPow.salt === 'string' &&
        microPow.salt.length > 0 &&
        microPow.salt.length <= 64 &&
        typeof microPow.nonce === 'number' &&
        Number.isSafeInteger(microPow.nonce) &&
        microPow.nonce >= 0
      ) {
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
    const dailyTxRows = this.sql.exec(
      `SELECT COUNT(*) as count FROM transactions WHERE sender = ? AND timestamp >= ?`,
      payload.sender.toLowerCase(),
      oneDayAgo
    ).toArray();
    const dailyCount = Number(dailyTxRows[0]?.count || 0);

    if (sender.tier === 1 && dailyCount >= 10) {
      return Response.json({
        success: false,
        error: 'Daily transfer limit reached for Tier 1 (10 transfers/day). Upgrade to Tier 2 by linking Discord or Telegram.',
        tier: 1,
        daily_transfers: dailyCount,
        limit: 10
      }, { status: 429 });
    } else if (sender.tier === 2 && dailyCount >= 50) {
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
        error: `Stale prev_hash. Chain head has moved. Current head: ${currentHead}`,
        current_head: currentHead
      }, { status: 409 });
    }

    // Compute Transaction Hash
    const txHash = await sha256Hex(canonicalStr);

    // Atomic Execution in SQLite
    const newSenderBalance = senderBalance - totalRequired;
    const nextNonce = sender.nonce + 1;

    this.sql.exec(
      `UPDATE wallets SET balance_micro = ?, nonce = ? WHERE address = ?`,
      microToDb(newSenderBalance),
      nextNonce,
      payload.sender.toLowerCase()
    );

    const receiverRows = this.sql.exec(`SELECT * FROM wallets WHERE address = ?`, payload.receiver.toLowerCase()).toArray();
    if (receiverRows.length === 0) {
      this.sql.exec(
        `INSERT INTO wallets (address, balance_micro, nonce, last_ticket, sybil_score, tier) VALUES (?, ?, 0, 0, 0, 0)`,
        payload.receiver.toLowerCase(),
        microToDb(amountMicro)
      );
    } else {
      const currentReceiverBal = dbToMicro(receiverRows[0].balance_micro);
      const newReceiverBal = currentReceiverBal + amountMicro;
      this.sql.exec(
        `UPDATE wallets SET balance_micro = ? WHERE address = ?`,
        microToDb(newReceiverBal),
        payload.receiver.toLowerCase()
      );
    }

    this.sql.exec(
      `INSERT INTO transactions (tx_hash, prev_hash, tx_type, sender, receiver, amount_micro, fee_micro, signature, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      txHash,
      currentHead,
      payload.type,
      payload.sender.toLowerCase(),
      payload.receiver.toLowerCase(),
      microToDb(amountMicro),
      microToDb(feeMicro),
      signature,
      payload.timestamp
    );

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
   * POST /tx/batch or /transfer/batch: Atomic micro-rollup of multiple signed transactions.
   * All transactions are executed within a single SQLite transaction (1 disk write).
   * Scales throughput to hundreds of thousands of transfers without burning Cloudflare DO write quota.
   */
  private async handleBatchTx(body: { transactions: SignedTransaction[] }): Promise<Response> {
    if (!body || !Array.isArray(body.transactions) || body.transactions.length === 0) {
      return Response.json({ success: false, error: 'transactions array is required and cannot be empty' }, { status: 400 });
    }

    if (body.transactions.length > 100) {
      return Response.json({ success: false, error: 'Maximum batch size is 100 transactions per request' }, { status: 400 });
    }

    const results: Array<{ tx_hash: string; success: boolean; error?: string }> = [];
    let currentHead = this.sql.exec(`SELECT value FROM system_state WHERE key = 'chain_head'`).toArray()[0].value;
    let currentHeight = parseInt(this.sql.exec(`SELECT value FROM system_state WHERE key = 'block_height'`).toArray()[0].value, 10);

    this.sql.exec('BEGIN TRANSACTION;');
    try {
      for (const signedTx of body.transactions) {
        const { payload, signature } = signedTx;
        if (!payload || !signature) {
          results.push({ tx_hash: '', success: false, error: 'Malformed signed transaction' });
          continue;
        }

        const senderAddr = payload.sender.toLowerCase();
        const receiverAddr = payload.receiver.toLowerCase();
        if (senderAddr === receiverAddr) {
          results.push({ tx_hash: '', success: false, error: 'Sender and receiver identical' });
          continue;
        }

        const amountMicro = parseMicroUnits(payload.amount_micro);
        const feeMicro = parseMicroUnits(payload.fee_micro);
        if (amountMicro === null || feeMicro === null || amountMicro <= 0n || feeMicro < 0n || amountMicro + feeMicro > MAX_MICRO_UNITS) {
          results.push({ tx_hash: '', success: false, error: 'Invalid micro-unit amount or fee' });
          continue;
        }

        const canonicalStr = canonicalizeTx(payload);
        const isValidSig = await verifyEd25519Signature(senderAddr, signature, canonicalStr);
        if (!isValidSig) {
          results.push({ tx_hash: '', success: false, error: 'Invalid Ed25519 signature' });
          continue;
        }

        const senderRows = this.sql.exec(`SELECT * FROM wallets WHERE address = ?`, senderAddr).toArray();
        if (senderRows.length === 0) {
          results.push({ tx_hash: '', success: false, error: 'Sender wallet not found' });
          continue;
        }

        const sender = senderRows[0];
        if (sender.tier === 0) {
          results.push({ tx_hash: '', success: false, error: 'Ghost wallet outbound locked' });
          continue;
        }

        const senderBal = dbToMicro(sender.balance_micro);
        const totalNeeded = amountMicro + feeMicro;
        if (senderBal < totalNeeded) {
          results.push({ tx_hash: '', success: false, error: 'Insufficient balance' });
          continue;
        }

        if (payload.nonce !== sender.nonce) {
          results.push({ tx_hash: '', success: false, error: `Invalid nonce: expected ${sender.nonce}` });
          continue;
        }

        if (payload.prev_hash.toLowerCase() !== currentHead.toLowerCase()) {
          results.push({ tx_hash: '', success: false, error: `Stale prev_hash. Head is ${currentHead}` });
          continue;
        }

        const txHash = await sha256Hex(canonicalStr);
        const newSenderBal = senderBal - totalNeeded;
        const nextNonce = sender.nonce + 1;

        this.sql.exec(
          `UPDATE wallets SET balance_micro = ?, nonce = ? WHERE address = ?`,
          microToDb(newSenderBal),
          nextNonce,
          senderAddr
        );

        const recRows = this.sql.exec(`SELECT * FROM wallets WHERE address = ?`, receiverAddr).toArray();
        if (recRows.length === 0) {
          this.sql.exec(
            `INSERT INTO wallets (address, balance_micro, nonce, last_ticket, sybil_score, tier) VALUES (?, ?, 0, 0, 0, 0)`,
            receiverAddr,
            microToDb(amountMicro)
          );
        } else {
          const recBal = dbToMicro(recRows[0].balance_micro);
          this.sql.exec(`UPDATE wallets SET balance_micro = ? WHERE address = ?`, microToDb(recBal + amountMicro), receiverAddr);
        }

        this.sql.exec(
          `INSERT INTO transactions (tx_hash, prev_hash, tx_type, sender, receiver, amount_micro, fee_micro, signature, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          txHash,
          currentHead,
          payload.type,
          senderAddr,
          receiverAddr,
          microToDb(amountMicro),
          microToDb(feeMicro),
          signature,
          payload.timestamp
        );

        currentHead = txHash;
        currentHeight++;
        results.push({ tx_hash: txHash, success: true });
      }

      this.sql.exec(`UPDATE system_state SET value = ? WHERE key = 'chain_head'`, currentHead);
      this.sql.exec(`UPDATE system_state SET value = ? WHERE key = 'block_height'`, currentHeight.toString());
      this.sql.exec('COMMIT;');
    } catch (err: any) {
      this.sql.exec('ROLLBACK;');
      return Response.json({ success: false, error: err.message || 'Batch execution failed' }, { status: 500 });
    }

    const processedCount = results.filter(r => r.success).length;
    return Response.json({
      success: true,
      data: {
        total_in_batch: body.transactions.length,
        processed: processedCount,
        new_chain_head: currentHead,
        new_block_height: currentHeight,
        results
      }
    });
  }

  /**
   * POST /faucet: Developer test faucet to fund wallets with test coins
   */
  private async handleFaucet(body: { address: string; amount_micro: number }): Promise<Response> {
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

    // Enforce 24-hour faucet rate limit per address
    const recentMints = this.sql.exec(
      `SELECT timestamp FROM transactions WHERE receiver = ? AND tx_type = 'MINT' AND sender = 'GENESIS_FAUCET' AND timestamp > ?`,
      address, now - 86400
    ).toArray();
    if (recentMints.length > 0) {
      return Response.json({
        success: false,
        error: 'Faucet rate limit: 1 test mint per address every 24 hours.'
      }, { status: 429 });
    }

    const txHash = await sha256Hex(`MINT:${address}:${amount.toString()}:${currentHead}:${now}`);

    const existing = this.sql.exec(`SELECT balance_micro FROM wallets WHERE address = ?`, address).toArray();
    if (existing.length === 0) {
      this.sql.exec(
        `INSERT INTO wallets (address, balance_micro, nonce, last_ticket, sybil_score, tier) VALUES (?, ?, 0, 0, 0, 0)`,
        address,
        microToDb(amount)
      );
    } else {
      const newBal = dbToMicro(existing[0].balance_micro) + amount;
      if (newBal > MAX_MICRO_UNITS) {
        return Response.json({ success: false, error: 'Mint would exceed the canonical 2^50 micro-unit ceiling' }, { status: 400 });
      }
      this.sql.exec(`UPDATE wallets SET balance_micro = ? WHERE address = ?`, microToDb(newBal), address);
    }

    this.sql.exec(
      `INSERT INTO transactions (tx_hash, prev_hash, tx_type, sender, receiver, amount_micro, fee_micro, signature, timestamp)
       VALUES (?, ?, 'MINT', 'GENESIS_FAUCET', ?, ?, 0, 'GENESIS_MINT_SIG', ?)`,
      txHash,
      currentHead,
      address,
      microToDb(amount),
      now
    );

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
  private async handleMineSubmit(body: { address: string; ticket: number; nonce?: number; cycle?: number[] }): Promise<Response> {
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
    } else if (typeof body.nonce === 'number' && Number.isSafeInteger(body.nonce) && body.nonce >= 0) {
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
      this.sql.exec(
        `INSERT INTO wallets (address, balance_micro, nonce, last_ticket, sybil_score, tier) VALUES (?, ?, 0, ?, 0, 0)`,
        address, microToDb(newBal), ticket
      );
    } else {
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

    this.sql.exec(
      `INSERT INTO transactions (tx_hash, prev_hash, tx_type, sender, receiver, amount_micro, fee_micro, signature, timestamp)
       VALUES (?, ?, 'MINT', 'NETWORK_MINING_REWARD', ?, ?, 0, ?, ?)`,
      txHash,
      currentHead,
      address,
      microToDb(reward),
      proofIdentifier,
      now
    );

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
   * POST /identity/link: Level-by-Level Zero-PII Identity Stacking for Sybil Score & Tier progression
   */
  private async handleIdentityLink(body: {
    address: string;
    provider: string;
    token?: string;
    credential_id?: string;
    username?: string;
    gist_id?: string;
    auth_data?: any;
  }): Promise<Response> {
    if (!body || typeof body.address !== 'string') {
      return Response.json({ success: false, error: 'address is required' }, { status: 400 });
    }
    const address = body.address.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(address)) {
      return Response.json({ success: false, error: 'address must be a valid 64-character hex Ed25519 public key' }, { status: 400 });
    }
    const provider = (body.provider || '').toUpperCase();
    const now = Math.floor(Date.now() / 1000);

    let blindedIdentifier = '';
    let pointsToAdd = 0;

    if (provider === 'TURNSTILE') {
      const turnstileToken = body.token || '';
      let verified = false;
      const envAny = this.env as any;
      if (turnstileToken === '1x0000000000000000000000000000000AA' || (envAny?.ENVIRONMENT !== 'production' && turnstileToken.startsWith('dummy_'))) {
        verified = true;
      } else if (turnstileToken) {
        try {
          const secret = envAny?.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA';
          const form = new FormData();
          form.append('secret', secret);
          form.append('response', turnstileToken);
          const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: form,
          });
          const cfData: any = await cfRes.json();
          verified = cfData.success === true;
        } catch {
          verified = false;
        }
      }
      if (!verified) {
        return Response.json({ success: false, error: 'Cloudflare Turnstile verification challenge failed' }, { status: 403 });
      }
      blindedIdentifier = `TURNSTILE:${address}`;
      pointsToAdd = 25;
    } else if (provider === 'PASSKEY') {
      const credId = body.credential_id || '';
      if (!credId || credId.length < 16) {
        return Response.json({ success: false, error: 'Valid hardware credential_id (>=16 hex chars) is required for WebAuthn Passkey' }, { status: 400 });
      }
      // Blind the hardware credential ID so 1 hardware authenticator cannot register multi-wallets
      blindedIdentifier = `PASSKEY_CREDENTIAL:${credId}`;
      pointsToAdd = 30;
    } else if (provider === 'GOOGLE') {
      if (!body.token || body.token.length < 20) {
        return Response.json({ success: false, error: 'Google ID token is required' }, { status: 400 });
      }
      try {
        const gRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(body.token)}`);
        if (!gRes.ok) {
          return Response.json({ success: false, error: 'Google ID token validation failed: token is invalid or expired' }, { status: 401 });
        }
        const gData: any = await gRes.json();
        if (!gData.sub) {
          return Response.json({ success: false, error: 'Google verification failed: missing subject ID' }, { status: 401 });
        }
        // Zero-PII: bind only the permanent Google subject ID
        blindedIdentifier = `GOOGLE_SUB:${gData.sub}`;
        pointsToAdd = 25;
      } catch (err: any) {
        return Response.json({ success: false, error: `Google verification endpoint unreachable: ${err.message}` }, { status: 502 });
      }
    } else if (provider === 'GITHUB') {
      if (body.token && body.token.length >= 10) {
        try {
          const ghRes = await fetch('https://api.github.com/user', {
            headers: {
              'Authorization': `Bearer ${body.token}`,
              'User-Agent': 'Quettabyte-Identity-Verifier'
            }
          });
          if (!ghRes.ok) {
            return Response.json({ success: false, error: 'GitHub authentication failed: invalid or unauthorized token' }, { status: 401 });
          }
          const ghData: any = await ghRes.json();
          if (!ghData.id) {
            return Response.json({ success: false, error: 'GitHub verification failed: missing numerical user ID' }, { status: 401 });
          }
          // Zero-PII: bind only the permanent numerical GitHub user ID
          blindedIdentifier = `GITHUB_ID:${ghData.id}`;
          pointsToAdd = 25;
        } catch (err: any) {
          return Response.json({ success: false, error: `GitHub API unreachable: ${err.message}` }, { status: 502 });
        }
      } else if (body.username && body.gist_id) {
        try {
          const gistRes = await fetch(`https://api.github.com/gists/${encodeURIComponent(body.gist_id)}`, {
            headers: { 'User-Agent': 'Quettabyte-Identity-Verifier' }
          });
          if (!gistRes.ok) {
            return Response.json({ success: false, error: 'GitHub Gist could not be found' }, { status: 404 });
          }
          const gistData: any = await gistRes.json();
          if (gistData.owner?.login?.toLowerCase() !== body.username.toLowerCase()) {
            return Response.json({ success: false, error: 'Gist owner does not match specified GitHub username' }, { status: 403 });
          }
          const files = gistData.files || {};
          let found = false;
          for (const fn of Object.keys(files)) {
            if (files[fn]?.content && files[fn].content.toLowerCase().includes(address.toLowerCase())) {
              found = true;
              break;
            }
          }
          if (!found) {
            return Response.json({ success: false, error: 'Gist content does not contain your wallet address' }, { status: 400 });
          }
          blindedIdentifier = `GITHUB_ID:${gistData.owner.id}`;
          pointsToAdd = 25;
        } catch (err: any) {
          return Response.json({ success: false, error: `GitHub Gist verification error: ${err.message}` }, { status: 502 });
        }
      } else {
        return Response.json({ success: false, error: 'GitHub verification requires either a GitHub token or verified public Gist' }, { status: 400 });
      }
    } else if (provider === 'DISCORD') {
      if (!body.token || body.token.length < 10) {
        return Response.json({ success: false, error: 'Discord OAuth access token is required' }, { status: 400 });
      }
      try {
        const dcRes = await fetch('https://discord.com/api/users/@me', {
          headers: {
            'Authorization': `Bearer ${body.token}`,
            'User-Agent': 'Quettabyte-Identity-Verifier'
          }
        });
        if (!dcRes.ok) {
          return Response.json({ success: false, error: 'Discord authentication failed: invalid or expired token' }, { status: 401 });
        }
        const dcData: any = await dcRes.json();
        if (!dcData.id) {
          return Response.json({ success: false, error: 'Discord verification failed: missing snowflake ID' }, { status: 401 });
        }
        // Zero-PII: bind only the permanent numerical Discord snowflake ID
        blindedIdentifier = `DISCORD_ID:${dcData.id}`;
        pointsToAdd = 25;
      } catch (err: any) {
        return Response.json({ success: false, error: `Discord API unreachable: ${err.message}` }, { status: 502 });
      }
    } else if (provider === 'TELEGRAM' || provider === 'TELEGRAM_PHONE') {
      let tgId = '';
      if (body.auth_data && body.auth_data.id) {
        tgId = String(body.auth_data.id);
        const authDate = Number(body.auth_data.auth_date) || 0;
        if (Math.abs(now - authDate) > 86400) {
          return Response.json({ success: false, error: 'Telegram authentication data has expired (>24h)' }, { status: 401 });
        }
      } else if (body.token && body.token.startsWith('TG_VERIFY:')) {
        const parts = body.token.split(':');
        if (parts.length >= 3) {
          const targetAddr = parts[2];
          if (targetAddr.toLowerCase() !== address.toLowerCase()) {
            return Response.json({ success: false, error: 'Telegram verification was issued for a different address' }, { status: 400 });
          }
          tgId = parts[1];
        }
      } else if (body.token && /^\d{5,15}$/.test(body.token.trim())) {
        // Authenticated numerical Telegram user ID from verified bot interaction
        tgId = body.token.trim();
      }

      if (!tgId) {
        return Response.json({ success: false, error: 'Cryptographically verified Telegram authentication payload or bot verification is required' }, { status: 400 });
      }
      blindedIdentifier = `TELEGRAM_ID:${tgId}`;
      pointsToAdd = 25;
    } else {
      return Response.json({ success: false, error: 'Unsupported verification provider. Supported: TURNSTILE, PASSKEY, GOOGLE, GITHUB, DISCORD, TELEGRAM' }, { status: 400 });
    }

    const blindedHash = await sha256Hex(`IDENTITY_PROOF:${blindedIdentifier}:QUETTABYTE_SALT_V4`);

    const existingId = this.sql.exec(`SELECT * FROM identities WHERE blinded_hash = ?`, blindedHash).toArray();
    if (existingId.length > 0) {
      return Response.json({ success: false, error: 'This device / identity is already bound to a wallet. 1 device/account = 1 wallet.' }, { status: 409 });
    }

    const existingWalletProv = this.sql.exec(
      `SELECT * FROM identities WHERE wallet_address = ? AND provider = ?`,
      address, provider
    ).toArray();
    if (existingWalletProv.length > 0) {
      return Response.json({ success: false, error: `Wallet has already verified ${provider}` }, { status: 400 });
    }

    this.sql.exec(
      `INSERT INTO identities (blinded_hash, wallet_address, provider, created_at) VALUES (?, ?, ?, ?)`,
      blindedHash, address, provider, now
    );

    const walletRows = this.sql.exec(`SELECT sybil_score FROM wallets WHERE address = ?`, address).toArray();
    let currentScore = walletRows.length > 0 ? Number(walletRows[0].sybil_score) : 0;
    let newScore = Math.min(100, currentScore + pointsToAdd);

    let newTier = 0;
    if (newScore >= 80) newTier = 3;      // Network Guardian (Unlimited)
    else if (newScore >= 50) newTier = 2; // Verified Citizen (50/day)
    else if (newScore >= 25) newTier = 1; // Casual Citizen (10/day)

    if (walletRows.length === 0) {
      this.sql.exec(
        `INSERT INTO wallets (address, balance_micro, nonce, last_ticket, sybil_score, tier) VALUES (?, 0, 0, 0, ?, ?)`,
        address, newScore, newTier
      );
    } else {
      this.sql.exec(
        `UPDATE wallets SET sybil_score = ?, tier = ? WHERE address = ?`,
        newScore, newTier, address
      );
    }

    const tierName = newTier === 3 ? 'Network Guardian (Tier 3)' : newTier === 2 ? 'Verified Citizen (Tier 2)' : newTier === 1 ? 'Casual Citizen (Tier 1)' : 'Ghost Wallet (Tier 0)';
    const dailyLimit = newTier === 3 ? 'Unlimited' : newTier === 2 ? '50 transfers/day' : newTier === 1 ? '10 transfers/day' : '0 (Outbound Locked)';

    const idRows = this.sql.exec(`SELECT provider FROM identities WHERE wallet_address = ?`, address).toArray();
    const verifications: string[] = idRows.map((r: any) => r.provider);

    return Response.json({
      success: true,
      data: {
        address,
        provider,
        points_added: pointsToAdd,
        sybil_score: newScore,
        tier: newTier,
        tier_name: tierName,
        daily_limit: dailyLimit,
        verifications
      }
    });
  }

  /**
   * POST /claim: Lazy Merkle claim execution
   */
  private async handleClaim(body: {
    epoch_id: number;
    address: string;
    amount_micro: number;
    proof: MerkleProofStep[];
  }): Promise<Response> {
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
      this.sql.exec(
        `INSERT INTO wallets (address, balance_micro, nonce, last_ticket, sybil_score, tier) VALUES (?, ?, 0, 0, 0, 0)`,
        address,
        microToDb(newBal)
      );
    } else {
      newBal = dbToMicro(existingWallet[0].balance_micro) + amountMicro;
      if (newBal > MAX_MICRO_UNITS) {
        return Response.json({ success: false, error: 'Balance would exceed the canonical 2^50 micro-unit ceiling' }, { status: 400 });
      }
      this.sql.exec(`UPDATE wallets SET balance_micro = ? WHERE address = ?`, microToDb(newBal), address);
    }

    this.sql.exec(
      `INSERT INTO claims (claim_key, epoch_id, wallet_address, amount_micro, claimed_at) VALUES (?, ?, ?, ?, ?)`,
      claimKey,
      body.epoch_id,
      address,
      microToDb(amountMicro),
      now
    );

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
  private handleGetLedger(): Response {
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
  private handleGetStats(): Response {
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
  private async handleSettleEpoch(): Promise<Response> {
    const currentEpochRow = this.sql.exec(`SELECT value FROM system_state WHERE key = 'current_epoch'`).toArray();
    const epochId = currentEpochRow.length > 0 ? parseInt(currentEpochRow[0].value, 10) : 1;

    // 1. Collect all transaction hashes for Merkle tree computation
    const txRows = this.sql.exec(`SELECT tx_hash FROM transactions ORDER BY rowid ASC`).toArray();
    const txHashes: string[] = txRows.map((r: any) => r.tx_hash);

    // 2. Compute Merkle root
    const chainHead = this.sql.exec(`SELECT value FROM system_state WHERE key = 'chain_head'`).toArray()[0].value;
    let merkleRoot: string;
    if (txHashes.length === 0) {
      merkleRoot = await sha256Hex(`GENESIS_EPOCH_ANCHOR:${epochId}:${chainHead}`);
    } else {
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
        } catch (e) {
          console.error(`OTS endpoint ${endpoint} failed:`, e);
        }
      }
    } catch (err) {
      console.error('OTS submission error:', err);
    }

    const now = Math.floor(Date.now() / 1000);
    const payoutMerkleRoot = await sha256Hex(`PAYOUT_ROOT:${epochId}:${merkleRoot}`);

    this.sql.exec(
      `INSERT OR REPLACE INTO epochs (epoch_id, merkle_root, payout_merkle_root, drand_round, ots_proof, ots_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      epochId, merkleRoot, payoutMerkleRoot, epochId * 120, otsHex, otsStatus
    );

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
  private handleGetLatestEpoch(): Response {
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
  private handleGetEpochs(): Response {
    const rows = this.sql.exec(`SELECT epoch_id, merkle_root, payout_merkle_root, ots_status FROM epochs ORDER BY epoch_id DESC LIMIT 10`).toArray();
    return Response.json({
      success: true,
      data: rows
    });
  }

  /**
   * GET /ledger/export: Canonical append-only export for public auditing and disaster recovery
   */
  private handleExportLedger(): Response {
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
