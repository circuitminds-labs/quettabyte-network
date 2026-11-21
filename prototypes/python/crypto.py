"""
MyCoin Cryptographic Core (Milestone 1, Step 1)
Implements:
1. Ed25519 Keypair generation (Deterministic Public Address & Private Key)
2. Canonical Length-Prefixed Tagged Transaction Packaging (MYCOIN_TX_V1:)
3. Digital Signature creation and verification
4. SHA-256 Hash Chaining
"""

import hashlib
from cryptography.hazmat.primitives.asymmetric import ed25519

DOMAIN_TAG = "MYCOIN_TX_V1"

def generate_keypair():
    """Generates a new Ed25519 private key and public address."""
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    
    priv_bytes = private_key.private_bytes_raw()
    pub_bytes = public_key.public_bytes_raw()
    
    return {
        "private_key_hex": priv_bytes.hex(),
        "address_hex": pub_bytes.hex()
    }

def canonical_pack_tx(tx_type: str, sender: str, receiver: str, amount_micro: int, fee_micro: int, nonce: int, prev_hash: str, timestamp: int) -> bytes:
    """
    Packs transaction fields using canonical length-prefixed domain-separated encoding.
    This guarantees mathematically that no length-extension or collision attack is possible.
    """
    if amount_micro <= 0:
        raise ValueError("amount_micro must be strictly positive")
    if fee_micro < 0:
        raise ValueError("fee_micro cannot be negative")
    if nonce < 0:
        raise ValueError("nonce cannot be negative")
    if sender == receiver:
        raise ValueError("sender and receiver cannot be identical")

    payload_str = (
        f"{DOMAIN_TAG}:"
        f"{len(tx_type)}:{tx_type}:"
        f"{len(sender)}:{sender}:"
        f"{len(receiver)}:{receiver}:"
        f"{amount_micro}:"
        f"{fee_micro}:"
        f"{nonce}:"
        f"{len(prev_hash)}:{prev_hash}:"
        f"{timestamp}"
    )
    return payload_str.encode("utf-8")

def sign_transaction(private_key_hex: str, tx_bytes: bytes) -> str:
    """Signs the canonical transaction payload using the sender's private Ed25519 key."""
    priv_bytes = bytes.fromhex(private_key_hex)
    private_key = ed25519.Ed25519PrivateKey.from_private_bytes(priv_bytes)
    signature = private_key.sign(tx_bytes)
    return signature.hex()

def verify_transaction(address_hex: str, tx_bytes: bytes, signature_hex: str) -> bool:
    """Verifies that the transaction was signed by the owner of the address."""
    try:
        pub_bytes = bytes.fromhex(address_hex)
        public_key = ed25519.Ed25519PublicKey.from_public_bytes(pub_bytes)
        sig_bytes = bytes.fromhex(signature_hex)
        public_key.verify(sig_bytes, tx_bytes)
        return True
    except Exception:
        return False

def compute_tx_hash(tx_bytes: bytes, signature_hex: str) -> str:
    """Computes the unique SHA-256 hash identifying this transaction on the ledger."""
    combined = tx_bytes + b":" + signature_hex.encode("utf-8")
    return hashlib.sha256(combined).hexdigest()
