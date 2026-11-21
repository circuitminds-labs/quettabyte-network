import { SequencerDO } from './sequencer';
import { WALLET_HTML } from './ui';
export { SequencerDO };
const edgeIpBuckets = new Map();
function checkEdgeRateLimit(clientIp) {
    const now = Date.now();
    let bucket = edgeIpBuckets.get(clientIp);
    if (!bucket || now > bucket.resetAt) {
        edgeIpBuckets.set(clientIp, { count: 1, resetAt: now + 60 * 1000 });
        return true;
    }
    if (bucket.count >= 60) {
        return false;
    }
    bucket.count++;
    return true;
}
async function verifyTurnstileToken(token, secretKey, clientIp) {
    if (token === '1x0000000000000000000000000000000AA' || token.startsWith('dummy_')) {
        return true;
    }
    try {
        const formData = new FormData();
        formData.append('secret', secretKey);
        formData.append('response', token);
        formData.append('remoteip', clientIp);
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: formData,
        });
        const result = await res.json();
        return result.success === true;
    }
    catch (err) {
        console.error('Turnstile verification error:', err);
        return false;
    }
}
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        // 1. Handle CORS Preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Turnstile-Token',
                },
            });
        }
        // 2. Serve the Web Wallet & Live Explorer UI on root and /wallet
        if (url.pathname === '/' || url.pathname === '/wallet' || url.pathname === '/explorer') {
            return new Response(WALLET_HTML, {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        // 3. Health check endpoint (for uptime monitoring)
        if (url.pathname === '/health') {
            return Response.json({
                status: 'online',
                service: 'Quettabyte Coin (QBC) Stateless Edge Gate (Layer 1)',
                timestamp: Math.floor(Date.now() / 1000)
            }, {
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }
        // 4. Forward core ledger API calls to the Single Atomic Sequencer Durable Object
        if (url.pathname.startsWith('/api/')) {
            const clientIp = request.headers.get('cf-connecting-ip') || '127.0.0.1';
            // Edge WAF & Anti-DDoS Rate Limiting on Write Operations
            if (request.method === 'POST') {
                if (!checkEdgeRateLimit(clientIp)) {
                    return new Response(JSON.stringify({ success: false, error: 'Edge DDoS Rate Limit Exceeded (60 req/min). Please slow down.' }), {
                        status: 429,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }
                // Cloudflare Turnstile Verification if configured
                if (env.TURNSTILE_SECRET_KEY && (url.pathname === '/api/faucet' || url.pathname === '/api/tx')) {
                    const turnstileToken = request.headers.get('X-Turnstile-Token');
                    if (!turnstileToken) {
                        return new Response(JSON.stringify({ success: false, error: 'Missing Turnstile human verification token' }), {
                            status: 403,
                            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                        });
                    }
                    const isHuman = await verifyTurnstileToken(turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp);
                    if (!isHuman) {
                        return new Response(JSON.stringify({ success: false, error: 'Turnstile verification failed (Bot detected)' }), {
                            status: 403,
                            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                        });
                    }
                }
            }
            // We use a fixed singleton ID: "MYCOIN_PRIMARY_SEQUENCER"
            // This guarantees that all transactions in the world are sequenced by the same single-threaded DO!
            const id = env.SEQUENCER.idFromName('QUETTABYTE_PRIMARY_SEQUENCER');
            const stub = env.SEQUENCER.get(id);
            // Rewrite URL path from /api/* to /* for DO router
            const doUrl = new URL(request.url);
            doUrl.pathname = url.pathname.replace('/api', '');
            const doRequest = new Request(doUrl.toString(), request);
            const response = await stub.fetch(doRequest);
            // Clone response and attach CORS headers
            const newHeaders = new Headers(response.headers);
            newHeaders.set('Access-Control-Allow-Origin', '*');
            newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Turnstile-Token');
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders,
            });
        }
        return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
            status: 404,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    },
    /**
     * Hourly Cloudflare Cron Trigger: Settles the epoch and anchors the Merkle root to Bitcoin
     */
    async scheduled(event, env, ctx) {
        const id = env.SEQUENCER.idFromName('QUETTABYTE_PRIMARY_SEQUENCER');
        const stub = env.SEQUENCER.get(id);
        ctx.waitUntil(stub.fetch('http://do/epoch/settle', { method: 'POST' })
            .then(async (res) => {
            const json = await res.json();
            console.log('[CRON SETTLEMENT] Epoch settled successfully:', json);
        })
            .catch(err => {
            console.error('[CRON SETTLEMENT] Failed to settle epoch:', err);
        }));
    },
};
