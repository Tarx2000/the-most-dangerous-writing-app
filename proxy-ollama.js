/**
 * 🛰️ Massive Ollama Cloud Bridge
 * Includes expanded model spoofing for Antigravity UI.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = "9631dbb8ec4943f186795fe379c5042c.foMnJFLHMULaahNkvf68vsFv";
const CLOUD_HOST = "ollama.com";
const DEFAULT_MODEL = "glm-5.1:cloud";
const PORT = 11434;
const ERROR_LOG = path.join(__dirname, 'bridge-error.log');

process.on('uncaughtException', (err) => {
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] Uncaught: ${err.message}\n${err.stack}\n`);
});

http.createServer((req, res) => {
    // 🎭 1. Massive Model Spoofing (Make the UI think we have everything)
    if (req.method === 'GET' && req.url === '/v1/models') {
        const models = {
            data: [
                { id: "glm-5.1:cloud", object: "model", created: 1712952000, owned_by: "ollama" },
                { id: "claude-sonnet-4-6", object: "model", created: 1712952000, owned_by: "ollama" },
                { id: "claude-3-5-sonnet", object: "model", created: 1712952000, owned_by: "ollama" },
                { id: "claude-3-5-sonnet-20241022", object: "model", created: 1712952000, owned_by: "ollama" },
                { id: "qwen3-coder:cloud", object: "model", created: 1712952000, owned_by: "ollama" }
            ]
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(models));
    }

    let bodyChunks = [];
    req.on('data', chunk => { bodyChunks.push(chunk); });
    
    req.on('end', () => {
        const body = Buffer.concat(bodyChunks).toString();
        
        // 🔄 Aggressive Model Aliasing
        // Replaces claude-sonnet-4-6, claude-3-5-sonnet, etc. with glm-5.1:cloud
        let modifiedBody = body;
        if (body.includes('sonnet') || body.includes('claude-')) {
            modifiedBody = body.replace(/claude-(3-5-)?sonnet(-\d+|-4-6)?/g, DEFAULT_MODEL);
        }

        const options = {
            hostname: CLOUD_HOST,
            port: 443,
            path: req.url,
            method: req.method,
            headers: {
                ...req.headers,
                'host': CLOUD_HOST,
                'Authorization': `Bearer ${API_KEY}`,
                'content-length': Buffer.byteLength(modifiedBody)
            }
        };

        delete options.headers['x-api-key'];
        delete options.headers['anthropic-auth-token'];
        delete options.headers['connection'];
        delete options.headers['cookie'];

        const proxyReq = https.request(options, (proxyRes) => {
            const resHeaders = { ...proxyRes.headers };
            delete resHeaders['transfer-encoding'];
            res.writeHead(proxyRes.statusCode, resHeaders);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] Proxy Req Error: ${err.message}\n`);
            res.writeHead(500);
            res.end(`Bridge Error: ${err.message}`);
        });

        proxyReq.write(modifiedBody);
        proxyReq.end();
    });

}).listen(PORT, '127.0.0.1', () => {
    console.log(`✅ Massive Bridge active on http://127.0.0.1:${PORT}`);
});
