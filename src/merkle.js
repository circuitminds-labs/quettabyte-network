import { sha256Hex } from './crypto';
/**
 * Computes the Merkle Root of an array of hex leaf hashes.
 */
export async function computeMerkleRoot(leaves) {
    if (leaves.length === 0) {
        return '0000000000000000000000000000000000000000000000000000000000000000';
    }
    let currentLevel = leaves.map(l => l.toLowerCase());
    while (currentLevel.length > 1) {
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left; // duplicate odd leaf
            const combined = await sha256Hex(left + right);
            nextLevel.push(combined);
        }
        currentLevel = nextLevel;
    }
    return currentLevel[0];
}
/**
 * Generates an inclusion proof branch for a given leaf index.
 */
export async function generateMerkleProof(leaves, leafIndex) {
    if (leafIndex < 0 || leafIndex >= leaves.length) {
        throw new Error('Leaf index out of bounds');
    }
    const proof = [];
    let currentLevel = leaves.map(l => l.toLowerCase());
    let index = leafIndex;
    while (currentLevel.length > 1) {
        const isRight = index % 2 === 1;
        const siblingIndex = isRight ? index - 1 : index + 1;
        if (siblingIndex < currentLevel.length) {
            proof.push({
                position: isRight ? 'left' : 'right',
                hash: currentLevel[siblingIndex]
            });
        }
        else {
            // Odd element paired with itself
            proof.push({
                position: 'right',
                hash: currentLevel[index]
            });
        }
        const nextLevel = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
            const combined = await sha256Hex(left + right);
            nextLevel.push(combined);
        }
        currentLevel = nextLevel;
        index = Math.floor(index / 2);
    }
    return proof;
}
/**
 * Verifies that a leaf hash belongs to a given Merkle root using an inclusion proof.
 */
export async function verifyMerkleProof(leafHash, proof, expectedRoot) {
    let currentHash = leafHash.toLowerCase();
    for (const step of proof) {
        const sibling = step.hash.toLowerCase();
        const combinedStr = step.position === 'left' ? sibling + currentHash : currentHash + sibling;
        currentHash = await sha256Hex(combinedStr);
    }
    return currentHash.toLowerCase() === expectedRoot.toLowerCase();
}
