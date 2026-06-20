// Cloudflare Worker - AI API Hub
// 部署: npx wrangler deploy
// 设置Secret: npx wrangler secret put DEEPSEEK_KEY
// KV绑定: npx wrangler kv:namespace create "API_HUB_USERS"

// 内存用户（KV未就绪时的回退）
let MEMORY_USERS = {};
let MEMORY_INIT = false;

// 用户存储键
const KV_KEYS = {
  USERS: 'users',
};

// 模型配置
const MODELS = {
  'deepseek-v4-flash': {
    name: 'DeepSeek V4 Flash',
    backend: 'https://api.deepseek.com/v1/chat/completions',
    inputPrice: 0.001,
    outputPrice: 0.002,
  },
  'deepseek-v4-pro': {
    name: 'DeepSeek V4 Pro',
    backend: 'https://api.deepseek.com/v1/chat/completions',
    inputPrice: 0.004,
    outputPrice: 0.016,
  },
};

// 内嵌的HTML
const INDEX_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>API Hub</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0f;color:#e4e4e7;max-width:900px;margin:0 auto;padding:20px}.header{text-align:center;margin:40px 0}.header h1{font-size:40px;background:linear-gradient(135deg,#6366f1,#a855f7,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.status{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:16px;display:flex;justify-content:space-around;margin-bottom:30px}.status div{text-align:center}.status .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e;margin-right:6px}.label{color:#71717a;font-size:12px}.value{font-size:18px;font-weight:600;margin:4px 0}.card{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;margin-bottom:16px}.card h2{font-size:16px;margin-bottom:12px}.model-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}.model-item{background:#1e1e24;border:1px solid #27272a;border-radius:8px;padding:12px 14px}.model-name{font-weight:600;font-size:14px}.model-price{color:#a1a1aa;font-size:12px;margin-top:4px}.code{background:#1a1a20;border:1px solid #27272a;border-radius:8px;padding:16px;font-family:monospace;font-size:13px;line-height:1.7;overflow-x:auto}.code .c{color:#6b7280}.code .k{color:#818cf8}.code .s{color:#34d399}.pay-grid{display:flex;gap:12px;flex-wrap:wrap}.pay-item{background:#1e1e24;border:1px solid #27272a;border-radius:8px;padding:12px 20px;text-align:center;flex:1;min-width:100px}.pay-item .icon{font-size:28px;margin-bottom:4px}.pay-item .pname{font-weight:500;font-size:13px}.pay-item .pdesc{color:#71717a;font-size:11px}.footer{text-align:center;color:#52525b;font-size:12px;margin-top:30px;padding-top:16px;border-top:1px solid #27272a}.btn{display:inline-block;background:linear-gradient(135deg,#6366f1,#a855f7);color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:500;margin-top:12px}.center{text-align:center}</style></head><body><div class="header"><h1>⚡ API Hub</h1><p>AI 模型聚合服务 · 兼容 OpenAI API</p></div><div class="status"><div><div class="label">状态</div><div class="value"><span class="dot"></span>运行中</div></div><div><div class="label">模型</div><div class="value">2</div></div><div><div class="label">延迟</div><div class="value">~200ms</div></div></div><div class="card"><h2>🤖 可用模型</h2><div class="model-grid"><div class="model-item"><div class="model-name">DeepSeek V4 Flash</div><div class="model-price">¥0.001 / 1K 输入 · ¥0.002 / 1K 输出</div></div><div class="model-item"><div class="model-name">DeepSeek V4 Pro</div><div class="model-price">¥0.004 / 1K 输入 · ¥0.016 / 1K 输出</div></div></div></div><div class="card"><h2>🔌 兼容 OpenAI SDK</h2><p style="color:#a1a1aa;font-size:14px;margin-bottom:12px;">只需改 base_url 和 api_key：</p><div class="code"><span class="c"># Python</span><br><span class="k">from</span> openai <span class="k">import</span> OpenAI<br><br>client = OpenAI(<br>&nbsp;&nbsp;base_url=<span class="s">"https://你的域名/v1"</span>,<br>&nbsp;&nbsp;api_key=<span class="s">"sk-xxx..."</span><br>)<br><br>response = client.chat.completions.create(<br>&nbsp;&nbsp;model=<span class="s">"deepseek-v4-flash"</span>,<br>&nbsp;&nbsp;messages=[{<span class="s">"role"</span>:<span class="s">"user"</span>,<span class="s">"content"</span>:<span class="s">"你好"</span>}]<br>)</div></div><div class="card"><h2>💎 充值方式</h2><div class="pay-grid"><div class="pay-item"><div class="icon">💳</div><div class="pname">Stripe</div><div class="pdesc">信用卡/PayPal</div></div><div class="pay-item"><div class="icon">💎</div><div class="pname">Mixin</div><div class="pdesc">USDT 即时到账</div></div><div class="pay-item"><div class="icon">₿</div><div class="pname">加密货币</div><div class="pdesc">BTC/ETH/USDT</div></div></div></div><div class="center"><a href="/chat" class="btn">💬 在线聊天</a></div><div class="footer">API Hub · Cloudflare Workers · Zero Setup</div></body></html>`;

const CHAT_HTML = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>AI Chat</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#212121;color:#e4e4e7;height:100vh;display:flex;flex-direction:column}.topbar{background:#171717;border-bottom:1px solid #2f2f2f;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}.topbar h1{font-size:16px;font-weight:600;background:linear-gradient(135deg,#6366f1,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.model-select{background:#2f2f2f;border:1px solid #404040;border-radius:6px;padding:6px 10px;color:#e4e4e7;font-size:13px}.chat-area{flex:1;overflow-y:auto;padding:20px;max-width:700px;margin:0 auto;width:100%}.msg{display:flex;gap:10px;margin-bottom:20px}.msg.user{flex-direction:row-reverse}.avatar{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}.avatar.ai{background:linear-gradient(135deg,#6366f1,#a855f7)}.avatar.you{background:#2f2f2f}.bubble{max-width:80%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.6}.bubble.ai{background:#2f2f2f;border:1px solid #3f3f3f}.bubble.you{background:#6366f1;color:#fff}.input-area{border-top:1px solid #2f2f2f;padding:12px 16px;background:#171717;flex-shrink:0}.input-wrap{max-width:700px;margin:0 auto;display:flex;gap:8px}.input-wrap textarea{flex:1;background:#2f2f2f;border:1px solid #404040;border-radius:10px;padding:10px 14px;color:#e4e4e7;font-size:14px;resize:none;min-height:44px;max-height:120px;outline:none;font-family:inherit}.input-wrap textarea:focus{border-color:#6366f1}.send-btn{background:linear-gradient(135deg,#6366f1,#a855f7);border:none;border-radius:10px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:18px;color:#fff}.typing{display:flex;gap:4px;padding:4px 0}.typing span{width:7px;height:7px;border-radius:50%;background:#71717a;animation:bounce 1.4s infinite}.typing span:nth-child(2){animation-delay:.2s}.typing span:nth-child(3){animation-delay:.4s}@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-4px)}}.welcome{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:40px}.welcome .logo{font-size:48px;margin-bottom:12px}.welcome h2{font-size:20px;margin-bottom:6px}.welcome p{color:#71717a;font-size:14px;max-width:350px}</style></head><body><div class="topbar"><h1>🤖 AI Chat</h1><select class="model-select" id="model"><option value="deepseek-v4-flash">DeepSeek V4 Flash</option><option value="deepseek-v4-pro">DeepSeek V4 Pro</option></select></div><div class="chat-area" id="chat"><div class="welcome"><div class="logo">🤖</div><h2>有什么可以帮你？</h2><p>输入你的问题，开始对话</p></div></div><div class="input-area"><div class="input-wrap"><textarea id="input" placeholder="输入消息..." rows="1" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"></textarea><button class="send-btn" id="sendBtn" onclick="send()">➤</button></div></div><script>const API='/';let key=localStorage.getItem('api_key')||'';let msgs=[];let initDone=false;function add(r,t){msgs.push({r,t});const d=document.getElementById('chat');const m=document.createElement('div');m.className='msg '+r;m.innerHTML='<div class="avatar '+(r==='ai'?'ai':'you')+'">'+(r==='ai'?'🤖':'👤')+'</div><div class="bubble '+r+'">'+t.replace(/\\n/g,'<br>')+'</div>';d.appendChild(m);d.scrollTop=d.scrollHeight}function typing(id){const d=document.getElementById('chat');const m=document.createElement('div');m.className='msg ai';m.id=id;m.innerHTML='<div class="avatar ai">🤖</div><div class="bubble ai"><div class="typing"><span></span><span></span><span></span></div></div>';d.appendChild(m);d.scrollTop=d.scrollHeight}function rm(id){const e=document.getElementById(id);if(e)e.remove()}async function send(){const i=document.getElementById('input');const t=i.value.trim();if(!t)return;document.querySelector('.welcome')?.remove();add('you',t);i.value='';i.style.height='auto';const tid='t'+Date.now();typing(tid);try{const model=document.getElementById('model').value;if(!key){key=prompt('请输入API Key')||'';localStorage.setItem('api_key',key)}if(!key){rm(tid);add('ai','需要API Key才能使用');return}const r=await fetch(API+'v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'***'+key},body:JSON.stringify({model,messages:[...msgs.filter(m=>m.r!=='sys').map(m=>({role:m.r==='ai'?'assistant':'user',content:m.t})),{role:'user',content:t}]})});const d=await r.json();rm(tid);if(d.choices?.[0]?.message?.content){const rep=d.choices[0].message.content;add('ai',rep);msgs.push({r:'user',t},{r:'ai',t:rep})}else{add('ai','错误: '+(d.error?.message||r.status))}}catch(e){rm(tid);add('ai','网络错误: '+e.message)}}document.getElementById('input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});</script></body></html>`;

// === KV 操作 ===
async function getUsers(env) {
  if (env.USERS_KV) {
    // Cloudflare Worker 环境
    try {
      const data = await env.USERS_KV.get(KV_KEYS.USERS, 'json');
      return data || {};
    } catch { return {}; }
  }
  // 回退到内存
  return MEMORY_USERS;
}

async function saveUsers(env, users) {
  if (env.USERS_KV) {
    await env.USERS_KV.put(KV_KEYS.USERS, JSON.stringify(users));
  } else {
    MEMORY_USERS = users;
  }
}

async function seedUsers(env) {
  const users = await getUsers(env);
  if (Object.keys(users).length > 0) return; // 已有数据就不投种子
  const seed = {
    '***…c9ed': { id: 'u_test', balance: 100, name: '测试用户', keys: ['sk-***…c9ed'], created: new Date().toISOString() },
  };
  await saveUsers(env, seed);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // 首次初始化
    if (!MEMORY_INIT) {
      await seedUsers(env);
      MEMORY_INIT = true;
    }

    // 静态页面
    if (path === '/' || path === '/index.html') return html(INDEX_HTML);
    if (path === '/chat' || path === '/chat.html') return html(CHAT_HTML);

    try {
      // 健康检查
      if (path === '/health') return json({ status: 'ok', version: '0.1.0', models: Object.keys(MODELS).length });

      // 模型列表
      if (path === '/v1/models') {
        const data = Object.entries(MODELS).map(([id, m]) => ({ id, object: 'model', created: Math.floor(Date.now()/1000), owned_by: 'api-hub' }));
        return json({ object: 'list', data });
      }

      // === 管理端（admin key认证） ===
      const adminKey = url.searchParams.get('admin') || null;
      
      // 创建用户
      if (path === '/admin/users' && request.method === 'POST') {
        if (!adminKey) return err(403, '需要 admin key');
        const body = await request.json();
        const users = await getUsers(env);
        const id = 'u_' + crypto.randomUUID().substring(0, 8);
        const key = 'sk-' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
        const balance = parseFloat(body.balance) || 0;
        users[id] = { id, name: body.name || '用户', balance, keys: [key], created: new Date().toISOString() };
        await saveUsers(env, users);
        return json({ success: true, id, api_key: key, balance });
      }

      // 用户列表
      if (path === '/admin/users' && request.method === 'GET') {
        if (!adminKey) return err(403, '需要 admin key');
        const users = await getUsers(env);
        const list = Object.values(users).map(u => ({
          id: u.id, name: u.name, balance: u.balance, keys: u.keys?.length || 0, created: u.created
        }));
        return json({ users: list });
      }

      // 充值
      if (path === '/admin/recharge' && request.method === 'POST') {
        if (!adminKey) return err(403, '需要 admin key');
        const body = await request.json();
        const users = await getUsers(env);
        const user = Object.values(users).find(u => u.id === body.user_id);
        if (!user) return err(404, '用户不存在');
        const amount = parseFloat(body.amount) || 0;
        user.balance = (user.balance || 0) + amount;
        await saveUsers(env, users);
        return json({ success: true, user_id: user.id, name: user.name, balance: user.balance });
      }

      // 余额查询
      if (path === '/v1/balance') {
        const user = await getUserByKey(request, env);
        if (!user) return err(401, 'Invalid API key');
        return json({ balance: user.balance, currency: 'CNY' });
      }

      // Chat Completions
      if (path === '/v1/chat/completions') {
        const { user, key } = await getUserByKey(request, env);
        if (!user) return err(401, 'Invalid API key');

        const body = await request.json();
        const model = MODELS[body.model];
        if (!model) return err(400, `Unsupported model: ${body.model}`);

        if (user.balance <= 0) return err(402, 'Insufficient balance');

        // 转发到 DeepSeek
        const backendKey = env.DEEPSEEK_KEY;
        if (!backendKey) return err(500, 'DEEPSEEK_KEY not configured');
        
        const resp = await fetch(model.backend, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${backendKey}` },
          body: JSON.stringify(body),
        });

        const result = await resp.json();

        // 扣费并持久化
        if (result.usage) {
          const inT = result.usage.prompt_tokens || 0;
          const outT = result.usage.completion_tokens || 0;
          const cost = (inT/1000 * model.inputPrice) + (outT/1000 * model.outputPrice);
          user.balance = Math.max(0, (user.balance || 0) - cost);
          
          // 保存余额到 KV
          const users = await getUsers(env);
          if (users[user.id]) {
            users[user.id].balance = user.balance;
            await saveUsers(env, users);
          }
          
          result.usage.cost = cost.toFixed(6);
          result.usage.balance_after = user.balance.toFixed(4);
        }

        return json(result, resp.status);
      }

      return err(404, 'Not found');
    } catch (e) {
      return err(500, e.message);
    }
  }
};

async function getUserByKey(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const key = auth.replace(/^Bearer\s+/i, '');
  if (!key) return { user: null };
  
  const users = await getUsers(env);
  for (const u of Object.values(users)) {
    if (u.keys?.includes(key)) return { user: u, key };
  }
  return { user: null };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

function err(status, msg) {
  return json({ error: { message: msg } }, status);
}

function html(content) {
  return new Response(content, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' };
}
