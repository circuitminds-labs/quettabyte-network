# 🔐 QUETTABYTE COIN (QBC) — CRYPTOGRAPHIC SPECIFICATIONS
*Complete Mathematical & Implementation Reference for AI Assistants*

---

## 1. 🏷️ CANONICAL TAGGED SERIALIZATION (`MYCOIN_TX_V1:`)

To eliminate delimiter injection attacks, length-extension vulnerabilities, and ambiguity across programming languages, every transaction payload is serialized into a strict length-prefixed canonical string before signing or hashing.

### Canonical Format:
```
MYCOIN_TX_V1:<type_len>:<type>:<sender_len>:<sender>:<receiver_len>:<receiver>:<amount_micro>:<fee_micro>:<nonce>:<prev_hash_len>:<prev_hash>:<timestamp>
```

### Example:
```text
MYCOIN_TX_V1:8:TRANSFER:64:bd8c6e4554c635aefa8758949f7e37d139487b713be93f1dc8e565a29cece5c1:64:482d4df4ae00e7fbc2fa5f7a8ed3ec649bd9ed17eeae8f58f6de2f5909461acb:15500000:0:0:64:80f5bf1e15cc48151d75e7a9b0aa7abb8ea390970eb7c849c436f2f9f0db8dda:1795405940
```

### TypeScript Implementation (`src/crypto.ts`):
```typescript
export function canonicalizeTx(payload: CanonicalTxPayload): string {
  const type = payload.type;
  const sender = payload.sender.toLowerCase();
  const receiver = payload.receiver.toLowerCase();
  const amount = payload.amount_micro;
  const fee = payload.fee_micro;
  const nonce = payload.nonce.toString();
  const prevHash = payload.prev_hash.toLowerCase();
  const timestamp = payload.timestamp.toString();

  return `MYCOIN_TX_V1:${type.length}:${type}:${sender.length}:${sender}:${receiver.length}:${receiver}:${amount}:${fee}:${nonce}:${prevHash.length}:${prevHash}:${timestamp}`;
}
```

---

## 2. 🔑 ASYMMETRIC KEYS: ED25519 & NATIVE WEBCRYPTO

* **Curve:** Edwards-curve Digital Signature Algorithm over Curve25519 (`Ed25519`).
* **Address Format:** 64-character lowercase hexadecimal representation of the 32-byte raw public key.
* **Signature Format:** 128-character lowercase hexadecimal representation of the 64-byte Ed25519 signature.
* **Native WebCrypto:** All signing and verification run on native `crypto.subtle` (sub-millisecond CPU, 0 external dependencies).

### Verification Implementation:
```typescript
export async function verifyEd25519Signature(
  publicKeyHex: string,
  signatureHex: string,
  messageStr: string
): Promise<boolean> {
  try {
    const pubKeyBytes = hexToBytes(publicKeyHex);
    const sigBytes = hexToBytes(signatureHex);
    const msgBytes = new TextEncoder().encode(messageStr);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      pubKeyBytes,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      false,
      ['verify']
    );

    return await crypto.subtle.verify({ name: 'Ed25519' }, cryptoKey, sigBytes, msgBytes);
  } catch (err) {
    return false;
  }
}
```

---

## 3. 🌲 MERKLE TREES & LAZY MERKLE CLAIMS (`src/merkle.ts`)

Mining payouts and batch settlements are structured into binary Merkle trees.

### Lazy Merkle Claim Math:
Instead of writing 1,000 balance updates for 1,000 miners at the end of every hour (which burns 1,000 writes/hour $\times$ 24 = 24,000 writes/day), the sequencer:
1. Calculates the payout tree: $\text{Leaf}_i = \text{SHA256}(\text{wallet}_i \parallel \text{amount\_micro}_i \parallel \text{epoch\_id})$.
2. Writes **only the 32-byte Merkle root** into the SQLite `epochs` table (**1 write per hour = 24 writes per day**).
3. When a miner wishes to claim, they provide a logarithmic Merkle audit path $O(\log_2 N)$. The sequencer verifies the root on-demand and awards the balance.

---

## 4. 🔢 STRICT INTEGER MICRO-UNITS (`BigInt`)

* **Base Unit:** $1\text{ QBC} = 1,000,000\text{ micro-units}$ ($10^6$ quettabits).
* **Floating-Point Prohibition:** JavaScript `Number` floating-point math is strictly forbidden for all balances, transfers, and fees.
* **Type Safety:** In TypeScript, parsed with `BigInt(val)`.
* **Safe Ceiling:** Hard upper bound capped at $2^{50}$ micro-units ($1,125,899,906,842,624$ micro-units) to guarantee safe SQLite 64-bit integer compatibility.
