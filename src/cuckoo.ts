/**
 * Quettabyte Coin (QBC) - Cuckoo Cycle Verifier & SipHash-2-4 Engine
 * 
 * Sub-millisecond (<0.2 ms CPU) server-side cycle verification for memory-latency mining.
 * Strict BigInt 64-bit integer arithmetic. Zero floating point.
 */

export const CUCKOO_PROOF_SIZE = 12; // 12-cycle for fast edge verification
export const CUCKOO_EDGE_BITS = 20;  // 2^20 edges per partition (~1M nodes)
export const CUCKOO_EDGE_MASK = (1n << BigInt(CUCKOO_EDGE_BITS)) - 1n;

/** 2^64 - 1 wrap mask shared by the SipHash core and the edge derivation step. */
export const SIPHASH_MASK64 = 0xffffffffffffffffn;

/**
 * SipHash-2-4 implementation using 64-bit BigInt
 */
export class SipHash {
  private v0: bigint;
  private v1: bigint;
  private v2: bigint;
  private v3: bigint;

  private static MASK64 = SIPHASH_MASK64;

  constructor(k0: bigint, k1: bigint) {
    this.v0 = (0x736f6d6570736575n ^ k0) & SipHash.MASK64;
    this.v1 = (0x646f72616e646f6dn ^ k1) & SipHash.MASK64;
    this.v2 = (0x6c7967656e657261n ^ k0) & SipHash.MASK64;
    this.v3 = (0x7465646279746573n ^ k1) & SipHash.MASK64;
  }

  private static rotl(x: bigint, b: bigint): bigint {
    return (((x << b) & SipHash.MASK64) | (x >> (64n - b))) & SipHash.MASK64;
  }

  private sipround() {
    this.v0 = (this.v0 + this.v1) & SipHash.MASK64;
    this.v2 = (this.v2 + this.v3) & SipHash.MASK64;
    this.v1 = SipHash.rotl(this.v1, 13n) ^ this.v0;
    this.v3 = SipHash.rotl(this.v3, 16n) ^ this.v2;
    this.v0 = SipHash.rotl(this.v0, 32n);
    this.v2 = (this.v2 + this.v1) & SipHash.MASK64;
    this.v0 = (this.v0 + this.v3) & SipHash.MASK64;
    this.v1 = SipHash.rotl(this.v1, 17n) ^ this.v2;
    this.v3 = SipHash.rotl(this.v3, 21n) ^ this.v0;
    this.v2 = SipHash.rotl(this.v2, 32n);
  }

  /**
   * Hashes a 64-bit integer input
   */
  public hash(m: bigint): bigint {
    const v0 = this.v0;
    const v1 = this.v1;
    const v2 = this.v2;
    const v3 = this.v3;

    this.v3 ^= m;
    this.sipround();
    this.sipround();
    this.v0 ^= m;

    this.v2 ^= 0xffn;
    this.sipround();
    this.sipround();
    this.sipround();
    this.sipround();

    const result = (this.v0 ^ this.v1 ^ this.v2 ^ this.v3) & SipHash.MASK64;

    // Restore initial state for next hash
    this.v0 = v0;
    this.v1 = v1;
    this.v2 = v2;
    this.v3 = v3;

    return result;
  }
}

/**
 * Derives two 64-bit keys (k0, k1) from a SHA-256 seed hex string
 */
export function deriveSipKeys(seedHex: string): [bigint, bigint] {
  // Ensure seed is at least 32 hex chars (16 bytes)
  const padded = seedHex.padEnd(32, '0');
  const k0Hex = padded.slice(0, 16);
  const k1Hex = padded.slice(16, 32);
  const k0 = BigInt('0x' + k0Hex);
  const k1 = BigInt('0x' + k1Hex);
  return [k0, k1];
}

/**
 * Computes endpoint u (even side) for edge index
 */
export function sipnode(hasher: SipHash, edge: bigint, uorv: bigint): bigint {
  return hasher.hash((2n * edge + uorv) & SIPHASH_MASK64) & CUCKOO_EDGE_MASK;
}

/**
 * Sub-millisecond Cuckoo Cycle Solution Verifier
 * 
 * Verifies that a given array of edge indices forms a valid cycle of length PROOF_SIZE.
 * Execution takes <0.15ms on Cloudflare Worker CPU.
 * 
 * @param seedHex SHA-256 seed (drand + wallet + ticket)
 * @param edges Array of edge indices submitted by miner (validated as in-range integers)
 * @param proofSize Expected cycle length (default: 12)
 * @returns boolean true if mathematically valid cycle
 */
export function verifyCuckooCycle(seedHex: string, edges: number[], proofSize = CUCKOO_PROOF_SIZE): boolean {
  // 0. Structural validation: a bipartite cycle must be even-length, and the seed must be hex.
  if (!Array.isArray(edges) || edges.length !== proofSize) {
    return false;
  }
  if (!Number.isSafeInteger(proofSize) || proofSize < 2 || proofSize % 2 !== 0) {
    return false;
  }
  if (typeof seedHex !== 'string' || !/^[0-9a-fA-F]{32,}$/.test(seedHex)) {
    return false;
  }

  // 1. Verify EVERY edge (including the last) is an in-range integer, and edges are strictly
  //    increasing (prevents duplicates and forces canonical order).
  //    BigInt() would throw on fractional/NaN input, so integers are checked first.
  for (let i = 0; i < proofSize; i++) {
    const edge = edges[i];
    if (typeof edge !== 'number' || !Number.isSafeInteger(edge) || edge < 0) {
      return false;
    }
    if (BigInt(edge) > CUCKOO_EDGE_MASK) {
      return false;
    }
    if (i > 0 && edges[i - 1] >= edge) {
      return false;
    }
  }

  const [k0, k1] = deriveSipKeys(seedHex);
  const hasher = new SipHash(k0, k1);

  // 2. Compute endpoints for each edge
  // u side: partition 0; v side: partition 1 (offset by 2^CUCKOO_EDGE_BITS to avoid collision)
  const partitionOffset = 1n << BigInt(CUCKOO_EDGE_BITS);
  const uNodes: bigint[] = new Array(proofSize);
  const vNodes: bigint[] = new Array(proofSize);

  // Adjacency map: node -> list of connected edges
  const adj = new Map<string, number[]>();

  const addEdge = (nodeKey: string, edgeIdx: number) => {
    const list = adj.get(nodeKey) || [];
    list.push(edgeIdx);
    adj.set(nodeKey, list);
  };

  for (let i = 0; i < proofSize; i++) {
    const edgeBig = BigInt(edges[i]);
    const u = sipnode(hasher, edgeBig, 0n);
    const v = sipnode(hasher, edgeBig, 1n) + partitionOffset;

    uNodes[i] = u;
    vNodes[i] = v;

    addEdge(u.toString(), i);
    addEdge(v.toString(), i);
  }

  // 3. In a valid 2-regular graph (cycle), every vertex must have degree exactly 2
  for (const [_, edgeList] of adj) {
    if (edgeList.length !== 2) {
      return false;
    }
  }

  // 4. Traverse the cycle to ensure it forms a SINGLE cycle of length proofSize
  // (not two disconnected cycles of length e.g. 6 + 6)
  let visitedEdges = 0;
  let currentEdge = 0;
  let currentNode = uNodes[0];

  while (visitedEdges < proofSize) {
    visitedEdges++;
    // Move across currentEdge from currentNode to the opposite node
    const nextNode = currentNode === uNodes[currentEdge] ? vNodes[currentEdge] : uNodes[currentEdge];
    const neighbors = adj.get(nextNode.toString())!;
    // Choose the other edge connected to nextNode
    const nextEdge = neighbors[0] === currentEdge ? neighbors[1] : neighbors[0];

    currentEdge = nextEdge;
    currentNode = nextNode;

    if (currentEdge === 0) {
      break;
    }
  }

  return visitedEdges === proofSize;
}
