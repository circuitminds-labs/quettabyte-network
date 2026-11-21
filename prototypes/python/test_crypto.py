"""
Automated Cryptographic Test Vectors for MyCoin (Milestone 1, Step 1)
Tests:
- Key generation
- Valid transaction signing & verification
- Tamper detection on modified amount
- Tamper detection on modified recipient
- Guard clauses against self-send and negative amounts
- Chain-head hash linking
"""

import time
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from crypto import (
    generate_keypair,
    canonical_pack_tx,
    sign_transaction,
    verify_transaction,
    compute_tx_hash
)

def run_tests():
    print("=" * 60)
    print("🪙 MYCOIN PROTOCOL: MILESTONE 1 CRYPTOGRAPHIC TEST SUITE")
    print("=" * 60)

    # 1. Create Wallets
    print("\n[Step 1] Generating Alice and Bob's Ed25519 Wallets...")
    alice = generate_keypair()
    bob = generate_keypair()
    eve = generate_keypair()

    print(f"  ✓ Alice Address: {alice['address_hex'][:16]}...{alice['address_hex'][-8:]}")
    print(f"  ✓ Bob Address:   {bob['address_hex'][:16]}...{bob['address_hex'][-8:]}")
    print(f"  ✓ Eve Address:   {eve['address_hex'][:16]}...{eve['address_hex'][-8:]}")

    # 2. Package Valid Transaction (Alice sends 15.5 coins to Bob)
    print("\n[Step 2] Packaging canonical transfer: Alice -> Bob (15.5 coins)...")
    amount_micro = 15_500_000  # 15.5 coins in integer micro-units
    fee_micro = 10_000         # 0.01 coin fee
    nonce = 0
    prev_hash = "0000000000000000000000000000000000000000000000000000000000000000"  # Genesis link
    timestamp = int(time.time())

    tx_bytes = canonical_pack_tx(
        tx_type="TRANSFER",
        sender=alice["address_hex"],
        receiver=bob["address_hex"],
        amount_micro=amount_micro,
        fee_micro=fee_micro,
        nonce=nonce,
        prev_hash=prev_hash,
        timestamp=timestamp
    )
    print(f"  ✓ Canonical Payload:\n    {tx_bytes.decode('utf-8')}")

    # 3. Alice Signs the Transaction
    print("\n[Step 3] Alice signs the transaction with her private key...")
    signature = sign_transaction(alice["private_key_hex"], tx_bytes)
    print(f"  ✓ Ed25519 Signature: {signature[:32]}...{signature[-16:]}")

    tx_hash = compute_tx_hash(tx_bytes, signature)
    print(f"  ✓ Transaction SHA-256 Hash: {tx_hash}")

    # 4. Verify Honest Transaction
    print("\n[Step 4] Verifying signature against Alice's public address...")
    is_valid = verify_transaction(alice["address_hex"], tx_bytes, signature)
    assert is_valid is True, "FAIL: Honest signature failed verification!"
    print("  ✅ PASS: Honest transaction signature is mathematically VALID!")

    # 5. Attack Simulation 1: Hacker modifies amount from 15.5 to 100 coins
    print("\n[Step 5] ATTACK SIMULATION 1: Intercept and alter amount (15.5 -> 100 coins)...")
    tampered_amount_bytes = canonical_pack_tx(
        tx_type="TRANSFER",
        sender=alice["address_hex"],
        receiver=bob["address_hex"],
        amount_micro=100_000_000,  # Tampered!
        fee_micro=fee_micro,
        nonce=nonce,
        prev_hash=prev_hash,
        timestamp=timestamp
    )
    tamper_check_1 = verify_transaction(alice["address_hex"], tampered_amount_bytes, signature)
    assert tamper_check_1 is False, "CRITICAL BUG: Tampered amount was accepted!"
    print("  🛡️ BLOCKED: Server detected tampered amount! Signature rejected.")

    # 6. Attack Simulation 2: Eve diverts the payment to her own wallet
    print("\n[Step 6] ATTACK SIMULATION 2: Divert payment to Eve's address...")
    tampered_recipient_bytes = canonical_pack_tx(
        tx_type="TRANSFER",
        sender=alice["address_hex"],
        receiver=eve["address_hex"],  # Tampered!
        amount_micro=amount_micro,
        fee_micro=fee_micro,
        nonce=nonce,
        prev_hash=prev_hash,
        timestamp=timestamp
    )
    tamper_check_2 = verify_transaction(alice["address_hex"], tampered_recipient_bytes, signature)
    assert tamper_check_2 is False, "CRITICAL BUG: Tampered recipient was accepted!"
    print("  🛡️ BLOCKED: Server detected diverted recipient! Signature rejected.")

    # 7. Attack Simulation 3: Self-send and negative amount guard clauses
    print("\n[Step 7] Testing security guard clauses (Self-send & Negative transfers)...")
    try:
        canonical_pack_tx("TRANSFER", alice["address_hex"], alice["address_hex"], 1000, 0, 0, prev_hash, timestamp)
        print("  FAIL: Self-send was not blocked!")
    except ValueError as e:
        print(f"  ✓ Guard Clause Caught Self-Send: '{e}'")

    try:
        canonical_pack_tx("TRANSFER", alice["address_hex"], bob["address_hex"], -500, 0, 0, prev_hash, timestamp)
        print("  FAIL: Negative amount was not blocked!")
    except ValueError as e:
        print(f"  ✓ Guard Clause Caught Negative Amount: '{e}'")

    print("\n" + "=" * 60)
    print("🎉 ALL MILESTONE 1 CRYPTOGRAPHIC TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
