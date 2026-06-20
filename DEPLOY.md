# API Hub - Cloudflare Workers 部署指南

## 前置条件
- Cloudflare 账号（老板正在注册中）
- 找到 Cloudflare 账户 ID

## 一键部署

```bash
cd ~/.openclaw/workspace/api-hub

# 1. 登录 Cloudflare
npx wrangler login

# 2. 创建 KV 命名空间（存用户数据）
npx wrangler kv:namespace create "API_HUB_USERS"

# 3. 把上面返回的 id 填到 wrangler.toml 的 [kv_namespaces] 里
#    编辑 wrangler.toml → 把 YOUR_KV_NAMESPACE_ID 替换成真id

# 4. 设置 DeepSeek Key 为加密变量
npx wrangler secret put DEEPSEEK_KEY
# 输入: sk-121…79cb

# 5. 部署！
npx wrangler deploy
```

## 成功后

部署成功后会显示一个 `*.workers.dev` 域名，比如：
```
https://api-hub.你的子域名.workers.dev
```

## 管理后台

### 用 admin 参数管理用户（不用登录CF面板）

**创建用户：**
```bash
curl -X POST 'https://你的域名.workers.dev/admin/users?admin=你的密码' \
  -H 'Content-Type: application/json' \
  -d '{"name":"张三","balance":50}'
```

**查用户列表：**
```bash
curl 'https://你的域名.workers.dev/admin/users?admin=你的密码'
```

**充值：**
```bash
curl -X POST 'https://你的域名.workers.dev/admin/recharge?admin=你的密码' \
  -H 'Content-Type: application/json' \
  -d '{"user_id":"u_xxx","amount":100}'
```

### 用户使用

完全兼容 OpenAI SDK：
```python
from openai import OpenAI
client = OpenAI(
    base_url="https://你的域名.workers.dev/v1",
    api_key="你给用户的sk-xxx"
)
```

Web 聊天：`https://你的域名.workers.dev/chat`

---

现在本地服务一直在跑，可以先通过 Windows 端口转发给局域网用。要不要先试试 ngrok 临时对外暴露一下？
