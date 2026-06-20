// API Hub - AI 聚合中转服务
// 兼容 OpenAI API 格式
// 支持模型：DeepSeek, GPT, Claude, Gemini 等

import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// 加载 .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, '.env');
try {
  const envContent = readFileSync(envFile, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const k = trimmed.substring(0, eqIdx).trim();
    const v = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
  console.log('✅ .env 已加载');
} catch (e) {
  console.log('⚠️  未找到 .env 文件，使用环境变量');
}

// === 配置 ===
const PORT = process.env.PORT || 3000;
const DB_FILE = './data/users.json';
const USAGE_FILE = './data/usage.json';

// 后端模型路由
const BACKENDS = {
  'deepseek-v4-flash': { host: 'api.deepseek.com', path: '/v1/chat/completions', key: process.env.DEEPSEEK_KEY || '' },
  'deepseek-v4-pro': { host: 'api.deepseek.com', path: '/v1/chat/completions', key: process.env.DEEPSEEK_KEY || '' },
};

// 定价（每token, 单位：元 / 1000 token）
const PRICING = {
  'deepseek-v4-flash': { input: 0.001, output: 0.002 },
  'deepseek-v4-pro': { input: 0.004, output: 0.016 },
};

// === 数据存储（简易JSON文件）===
function readJSON(file) {
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return {}; }
}
function writeJSON(file, data) {
  const dir = file.substring(0, file.lastIndexOf('/'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

// === 用户/Key管理 ===
function getUserByKey(apiKey) {
  const users = readJSON(DB_FILE);
  for (const [uid, u] of Object.entries(users)) {
    if (u.apiKeys?.includes(apiKey)) return { ...u, id: uid };
  }
  return null;
}

function deductBalance(userId, amount) {
  const users = readJSON(DB_FILE);
  if (users[userId]) {
    users[userId].balance = (users[userId].balance || 0) - amount;
    writeJSON(DB_FILE, users);
  }
}

function logUsage(userId, model, tokens, cost) {
  const usage = readJSON(USAGE_FILE);
  if (!usage[userId]) usage[userId] = [];
  usage[userId].push({ time: new Date().toISOString(), model, tokens, cost });
  // 只保留最近1000条
  if (usage[userId].length > 1000) usage[userId] = usage[userId].slice(-1000);
  writeJSON(USAGE_FILE, usage);
}

// === 代理请求 ===
function proxyRequest(backend, body, callback) {
  const postData = JSON.stringify(body);
  
  const options = {
    hostname: backend.host,
    port: 443,
    path: backend.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${backend.key}`,
      'Content-Length': Buffer.byteLength(postData),
    },
    timeout: 60000,
  };

  // Anthropic 需要额外header
  if (backend.host.includes('anthropic')) {
    options.headers['anthropic-version'] = '2023-06-01';
  }

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        callback(null, { status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
      } catch {
        callback(null, { status: res.statusCode, headers: res.headers, body: data });
      }
    });
  });

  req.on('error', (e) => callback(e.message));
  req.on('timeout', () => { req.destroy(); callback('Request timeout'); });
  
  req.write(postData);
  req.end();
}

// === HTTP Server ===
const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 收集请求体
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      await handleRequest(req, res, body);
    } catch (e) {
      jsonResponse(res, 500, { error: { message: e.message } });
    }
  });
});

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function handleRequest(req, res, body) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // === 路由 ===

  // 健康检查
  if (path === '/health' || path === '/') {
    return jsonResponse(res, 200, { status: 'ok', version: '0.1.0' });
  }

  // 模型列表（兼容OpenAI格式）
  if (path === '/v1/models') {
    const models = Object.keys(BACKENDS).map(id => ({
      id, object: 'model', created: Math.floor(Date.now() / 1000),
      owned_by: 'api-hub',
    }));
    return jsonResponse(res, 200, { object: 'list', data: models });
  }

  // 查询余额
  if (path === '/v1/balance') {
    const apiKey = extractApiKey(req);
    if (!apiKey) return jsonResponse(res, 401, { error: { message: 'Missing API key' } });
    const user = getUserByKey(apiKey);
    if (!user) return jsonResponse(res, 401, { error: { message: 'Invalid API key' } });
    return jsonResponse(res, 200, { balance: user.balance || 0, currency: 'CNY' });
  }

  // === 核心：Chat Completions ===
  if (path === '/v1/chat/completions') {
    // 验证用户
    const apiKey = extractApiKey(req);
    if (!apiKey) return jsonResponse(res, 401, { error: { message: 'Missing API key. Use Authorization: Bearer <your-key>' } });
    const user = getUserByKey(apiKey);
    if (!user) return jsonResponse(res, 401, { error: { message: 'Invalid API key' } });

    const requestBody = JSON.parse(body);
    const model = requestBody.model;
    const backend = BACKENDS[model];

    if (!backend) {
      return jsonResponse(res, 400, {
        error: { message: `Unsupported model: ${model}. Available: ${Object.keys(BACKENDS).join(', ')}` }
      });
    }

    // 余额检查（流式按预估扣费，非流式按实际）
    const userBalance = user.balance || 0;
    if (userBalance <= 0) {
      return jsonResponse(res, 402, { error: { message: 'Insufficient balance' } });
    }

    // 转发请求到后端
    proxyRequest(backend, requestBody, (err, result) => {
      if (err) return jsonResponse(res, 502, { error: { message: `Backend error: ${err}` } });

      if (result.status === 200 && result.body?.usage) {
        const usage = result.body.usage;
        const totalTokens = usage.total_tokens || 0;
        const pricing = PRICING[model] || { input: 0.001, output: 0.002 };
        const cost = (usage.prompt_tokens || 0) / 1000 * pricing.input + 
                     (usage.completion_tokens || 0) / 1000 * pricing.output;

        deductBalance(user.id, cost);
        logUsage(user.id, model, totalTokens, cost);
        
        // 在响应中附加余额信息
        result.body.usage.balance_after = (userBalance - cost).toFixed(6);
        result.body.usage.cost = cost.toFixed(6);
      }

      // 流式支持
      if (requestBody.stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        // 这里需要特殊处理流式响应
        // 简化版：直接透传，不做费用记录
        const postData = JSON.stringify(requestBody);
        const proxyReq = https.request({
          hostname: backend.host, port: 443, path: backend.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json', 'Authorization': `Bearer ${backend.key}`,
            'Accept': 'text/event-stream',
          },
        }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        });
        proxyReq.write(postData);
        proxyReq.end();
      } else {
        jsonResponse(res, result.status, result.body);
      }
    });
    return;
  }

  // 404
  jsonResponse(res, 404, { error: { message: 'Not found' } });
}

function extractApiKey(req) {
  const auth = req.headers['authorization'] || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1];
  // 也支持?key=参数
  const url = new URL(req.url, `http://${req.headers.host}`);
  return url.searchParams.get('key') || null;
}

// === 启动 ===
console.log(`🚀 API Hub 启动中...`);
console.log(`📡 端口: ${PORT}`);
console.log(`🤖 已接入模型: ${Object.keys(BACKENDS).join(', ')}`);
console.log(`💡 使用方法:`);
console.log(`   curl http://localhost:${PORT}/v1/chat/completions \\`);
console.log(`     -H "Authorization: Bearer <your-key>" \\`);
console.log(`     -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"hi"}]}'`);

server.listen(PORT, '0.0.0.0');
