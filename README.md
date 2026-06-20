# API Hub - AI 聚合中转服务

兼容 OpenAI API 格式的 AI 模型聚合服务。

## 特性

- 🔄 **多模型聚合** — DeepSeek / GPT / Claude 等
- 🔑 **API Key 管理** — 兼容 OpenAI SDK
- 💰 **按量计费** — 按 token 扣费
- 📊 **用量统计** — 实时查看消费记录
- 🚀 **轻量部署** — Node.js / Cloudflare Workers

## 快速开始

```bash
# 安装依赖
npm install

# 配置后端 API Key
cp .env.example .env
# 编辑 .env 填入你的 DeepSeek/OpenAI/Anthropic Key

# 创建测试用户
node admin.js create-user 测试用户 10

# 启动
npm start
```

## 使用方式（客户端）

完全兼容 OpenAI SDK，只需改 base_url 和 api_key：

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://your-server:3000/v1",
    api_key="sk-你的key"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[{"role": "user", "content": "你好"}]
)
print(response.choices[0].message.content)
```

## 支持的模型

| 模型 | 输入(¥/1K tokens) | 输出(¥/1K tokens) |
|------|-------------------|-------------------|
| deepseek-chat | 0.001 | 0.002 |
| deepseek-reasoner | 0.004 | 0.016 |
| gpt-4o-mini | 0.0015 | 0.006 |
| gpt-4o | 0.05 | 0.15 |
| claude-3-haiku | 0.003 | 0.015 |
| claude-3-sonnet | 0.03 | 0.15 |

## 管理命令

```bash
# 创建用户
node admin.js create-user "张三" 20

# 列用户
node admin.js list

# 充值
node admin.js recharge u_abc123 50

# 查用量
node admin.js usage u_abc123
```

## 收款方案

- 💳 Stripe / LemonSqueezy — 国际信用卡
- 💎 Mixin — USDT 自动充值
- 💰 支付宝/微信 — 个人收款

## 部署

```bash
# VPS 部署（推荐）
node index.js

# 或使用 pm2
npm install -g pm2
pm2 start index.js --name api-hub
```
