/**
 * Utility: Convert hexadecimal string to Uint8Array
 */
export function hexToBytes(hex) {
    const cleanHex = hex.trim().toLowerCase();
    if (cleanHex.length % 2 !== 0) {
        throw new Error(`Invalid hex string length: ${cleanHex.length}`);
    }
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
    }
    return bytes;
}
/**
 * Utility: Convert Uint8Array to hexadecimal string
 */
export function bytesToHex(bytes) {
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}
/**
 * Computes SHA-256 hash using native WebCrypto API (sub-millisecond CPU)
 */
export async function sha256Hex(data) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(hashBuffer));
}
/**
 * Packs a transaction into the canonical tagged representation (MYCOIN_TX_V1:)
 * Eliminates delimiter injection and length-extension vulnerabilities.
 */
export function canonicalizeTx(payload) {
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
/**
 * Verifies an Ed25519 signature natively using WebCrypto API (<0.1 ms CPU)
 */
export async function verifyEd25519Signature(publicKeyHex, signatureHex, messageStr) {
    try {
        const pubKeyBytes = hexToBytes(publicKeyHex);
        const sigBytes = hexToBytes(signatureHex);
        const msgBytes = new TextEncoder().encode(messageStr);
        // Import Ed25519 public key natively
        const cryptoKey = await crypto.subtle.importKey('raw', pubKeyBytes, { name: 'Ed25519' }, false, ['verify']);
        return await crypto.subtle.verify({ name: 'Ed25519' }, cryptoKey, sigBytes, msgBytes);
    }
    catch (err) {
        return false;
    }
}
