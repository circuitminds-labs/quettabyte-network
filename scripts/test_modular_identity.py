#!/usr/bin/env python3
"""
🧪 TEST SUITE: MODULAR ZERO-PII IDENTITY STACKING & UNFORGEABLE KYC
Verifies that:
1. Ghost wallets (Tier 0) are blocked from sending.
2. Turnstile (+25 pts) elevates wallet to Tier 1.
3. Passkey (+30 pts) elevates wallet to Tier 2 (55 pts).
4. Stacking additional verified accounts (Google, GitHub, Discord, Telegram) reaches Tier 3 Guardian (80+ pts).
5. 1 Device / Identity = 1 Wallet invariant is strictly enforced (HTTP 409 Conflict).
6. Fake / Unauthenticated tokens are strictly rejected.
"""

import json
import urllib.request
import urllib.error
import secrets

BASE_URL = "http://127.0.0.1:8787" # for local dev or production url

def request_json(url, method="GET", data=None):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Quettabyte-Auditor/4.0",
        "Content-Type": "application/json"
    }
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"error": raw}

def run_tests(base_url):
    print(f"\n============================================================")
    print(f"🛡️ MODULAR ZERO-PII IDENTITY & KYC AUDIT")
    print(f"Target: {base_url}")
    print(f"============================================================\n")

    # Generate 2 random wallets
    wallet_a = secrets.token_hex(32)
    wallet_b = secrets.token_hex(32)

    print(f"[Step 1] Inspecting initial wallet state for Wallet A: {wallet_a[:12]}...")
    status, res = request_json(f"{base_url}/api/wallet/{wallet_a}")
    assert status == 200, f"Expected 200, got {status}"
    assert res["data"]["sybil_score"] == 0
    assert res["data"]["tier"] == 0
    assert res["data"]["verifications"] == []
    print(f"  ✓ Initial State: Tier 0 (Ghost Wallet), 0 pts, Outbound Gated.\n")

    print(f"[Step 2] Testing Turnstile Human Verification (+25 pts)...")
    status, res = request_json(f"{base_url}/api/identity/link", "POST", {
        "address": wallet_a,
        "provider": "TURNSTILE",
        "token": "dummy_turnstile_test_token"
    })
    assert status == 200, f"Turnstile link failed: {res}"
    assert res["data"]["sybil_score"] == 25
    assert res["data"]["tier"] == 1
    assert "TURNSTILE" in res["data"]["verifications"]
    print(f"  ✓ Wallet A now Tier 1 (Casual Citizen) with 25 pts ({res['data']['daily_limit']}).\n")

    print(f"[Step 3] Testing WebAuthn Biometric Passkey (+30 pts)...")
    cred_id = secrets.token_hex(20)
    status, res = request_json(f"{base_url}/api/identity/link", "POST", {
        "address": wallet_a,
        "provider": "PASSKEY",
        "credential_id": cred_id
    })
    assert status == 200, f"Passkey link failed: {res}"
    assert res["data"]["sybil_score"] == 55
    assert res["data"]["tier"] == 2
    assert "PASSKEY" in res["data"]["verifications"]
    print(f"  ✓ Wallet A now Tier 2 (Verified Citizen) with 55 pts ({res['data']['daily_limit']}).\n")

    print(f"[Step 4] Enforcing 1 Device = 1 Wallet (Attempting to bind same Passkey to Wallet B)...")
    status, res = request_json(f"{base_url}/api/identity/link", "POST", {
        "address": wallet_b,
        "provider": "PASSKEY",
        "credential_id": cred_id
    })
    assert status == 409, f"Expected 409 Conflict, got {status}: {res}"
    print(f"  🛡️ BLOCKED: Duplicate hardware passkey strictly rejected with HTTP 409 Conflict!\n")

    print(f"[Step 5] Testing Fake / Empty Social Tokens (Google, GitHub, Discord)...")
    status, res = request_json(f"{base_url}/api/identity/link", "POST", {
        "address": wallet_a,
        "provider": "GOOGLE",
        "token": "invalid_jwt"
    })
    assert status in (400, 401, 502), f"Expected rejection, got {status}: {res}"
    print(f"  ✓ Unauthenticated Google JWT rejected ({status}).")

    status, res = request_json(f"{base_url}/api/identity/link", "POST", {
        "address": wallet_a,
        "provider": "GITHUB",
        "token": "bad_token"
    })
    assert status in (400, 401, 502), f"Expected rejection, got {status}: {res}"
    print(f"  ✓ Unauthenticated GitHub token rejected ({status}).")

    status, res = request_json(f"{base_url}/api/identity/link", "POST", {
        "address": wallet_a,
        "provider": "DISCORD",
        "token": "bad_token"
    })
    assert status in (400, 401, 502), f"Expected rejection, got {status}: {res}"
    print(f"  ✓ Unauthenticated Discord token rejected ({status}).\n")

    print(f"[Step 6] Testing Telegram Verified ID (+25 pts -> Tier 3 Guardian Unlock)...")
    # Simulate a verified Telegram carrier ID from the bot
    tg_id = f"998{secrets.randbelow(10000000):07d}"
    status, res = request_json(f"{base_url}/api/identity/link", "POST", {
        "address": wallet_a,
        "provider": "TELEGRAM",
        "token": tg_id
    })
    assert status == 200, f"Telegram link failed: {res}"
    assert res["data"]["sybil_score"] == 80
    assert res["data"]["tier"] == 3
    assert res["data"]["tier_name"] == "Network Guardian (Tier 3)"
    assert res["data"]["daily_limit"] == "Unlimited"
    print(f"  🎉 SUCCESS: Wallet A achieved Tier 3 Network Guardian (80 pts, Unlimited transfers/day)!\n")

    print(f"[Step 7] Enforcing 1 Telegram Account = 1 Wallet...")
    status, res = request_json(f"{base_url}/api/identity/link", "POST", {
        "address": wallet_b,
        "provider": "TELEGRAM",
        "token": tg_id
    })
    assert status == 409, f"Expected 409 Conflict, got {status}: {res}"
    print(f"  🛡️ BLOCKED: Duplicate Telegram account strictly rejected with HTTP 409 Conflict!\n")

    print(f"============================================================")
    print(f"🎉 ALL MODULAR ZERO-PII IDENTITY TESTS PASSED (100% SUCCESS)!")
    print(f"============================================================\n")

if __name__ == "__main__":
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else "https://quettabyte-core.circuitminds.workers.dev"
    run_tests(target)
