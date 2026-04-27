/**
 * 🛰️ Massive Ollama Cloud Bridge
 * Includes expanded model spoofing for Antigravity UI.
 * Universal Mode: Supports both OpenAI/Ollama (/v1/chat/completions) and Claude (/v1/messages)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = "9631dbb8ec4943f186795fe379c5042c.foMnJFLHMULaahNkvf68vsFv";
const CLOUD_HOST = "ollama.com";
const DEFAULT_MODEL = "minimax-m2.7:cloud";
const PORT = 11434;
const ERROR_LOG = path.join(__dirname, 'bridge-error.log');

process.on('uncaughtException', (err) => {
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] Uncaught: ${err.message}\n${err.stack}\n`);
});

http.createServer((req, res) => {
    // 🪵 Log every request
    fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] REQ: ${req.method} ${req.url}\n`);

    // 🎭 1. Massive Model Spoofing
    if (req.method === 'GET' && (req.url === '/v1/models' || req.url === '/models')) {
        const models = {
            data: [
                { id: "gpt-4o-glm", object: "model", created: 1712952000, owned_by: "ollama" },
                { id: "gpt-4o-minimax", object: "model", created: 1712952000, owned_by: "ollama" },
                { id: "glm-5.1:cloud", object: "model", created: 1712952000, owned_by: "ollama" },
                { id: "minimax-m2.7:cloud", object: "model", created: 1712952000, owned_by: "ollama" },
                { id: "kimi-k2.6:cloud", object: "model", created: 1712952000, owned_by: "ollama" },
                { id: "claude-3-5-sonnet", object: "model", created: 1712952000, owned_by: "ollama" },
                { id: "claude-3-opus", object: "model", created: 1712952000, owned_by: "ollama" }
            ]
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(models));
    }

    // 🎯 Use Signal File for dynamic model routing
    let targetModel = DEFAULT_MODEL;
    try {
        const signalFile = path.join(__dirname, 'model.txt');
        if (fs.existsSync(signalFile)) {
            targetModel = fs.readFileSync(signalFile, 'utf8').trim();
        }
    } catch (e) {}

    let bodyChunks = [];
    req.on('data', chunk => { bodyChunks.push(chunk); });
    
    req.on('end', () => {
        const body = Buffer.concat(bodyChunks).toString();
        
        // 🔄 Universal Redirection & Aliasing
        let modifiedBody = body;
        
        // Translate Claude /v1/messages to Ollama /v1/chat/completions body if needed
        // (Our cloud host understands both, but we ensure the model name is correct)
        
        if (body.includes('gpt-4o-minimax')) {
            modifiedBody = body.replace(/"model":\s*"gpt-4o-minimax"/g, `"model": "minimax-m2.7:cloud"`);
        } else if (body.includes('gpt-4o-glm')) {
            modifiedBody = body.replace(/"model":\s*"gpt-4o-glm"/g, `"model": "glm-5.1:cloud"`);
        } else if (body.includes('opus')) {
            modifiedBody = body.replace(/claude-3-opus(-\d+)?/g, "glm-5.1:cloud");
        } else if (body.includes('sonnet') || body.includes('claude-')) {
            modifiedBody = body.replace(/claude-(3-5-)?sonnet(-\d+|-4-6)?/g, targetModel);
        }

        const options = {
            hostname: CLOUD_HOST,
            port: 443,
            path: req.url, // Cloud host handles both Anthropic and OpenAI protocols
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

}).listen(PORT, '::', () => {
    console.log(`✅ Universal Bridge active on http://[::]:${PORT}`);
});
