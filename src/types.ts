export type TxType = 'TRANSFER' | 'MINT' | 'BURN' | 'CLAIM';

export interface Wallet {
  address: string;             // 64-character hex Ed25519 public key
  balance_micro: string;       // BigInt represented as string for JSON serialization
  nonce: number;               // Monotonic replay protection counter
  last_ticket: number;         // Last mining ticket submitted
  sybil_score: number;         // Stacked trust score (0 to 100)
  tier: number;                // 0: Ghost, 1: Casual, 2: Citizen, 3: Guardian
}

export interface CanonicalTxPayload {
  type: TxType;
  sender: string;
  receiver: string;
  amount_micro: string;        // BigInt string
  fee_micro: string;           // BigInt string
  nonce: number;
  prev_hash: string;
  timestamp: number;
}

export interface SignedTransaction {
  payload: CanonicalTxPayload;
  signature: string;           // 128-character hex Ed25519 signature
  micro_pow?: {
    salt: string;
    nonce: number;
  };
}

export interface TransactionRecord {
  tx_hash: string;
  prev_hash: string;
  tx_type: TxType;
  sender: string;
  receiver: string;
  amount_micro: string;
  fee_micro: string;
  signature: string;
  timestamp: number;
}

export interface EpochRecord {
  epoch_id: number;
  merkle_root: string;
  payout_merkle_root: string;
  drand_round: number;
  ots_proof: string | null;
  ots_status: 'PENDING' | 'CONFIRMED';
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}
