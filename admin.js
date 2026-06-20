// 管理工具 - 创建用户、充值、查账
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import crypto from 'crypto';

const DB_FILE = './data/users.json';
const USAGE_FILE = './data/usage.json';

function readJSON(file) {
  try { return JSON.parse(readFileSync(file, 'utf-8')); } catch { return {}; }
}
function writeJSON(file, data) {
  const dir = file.substring(0, file.lastIndexOf('/'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateKey() {
  return 'sk-' + crypto.randomBytes(24).toString('hex');
}

const cmd = process.argv[2];
const args = process.argv.slice(3);

switch (cmd) {
  case 'create-user': {
    const name = args[0] || 'user-' + Date.now();
    const balance = parseFloat(args[1]) || 0;
    const key = generateKey();
    const users = readJSON(DB_FILE);
    const id = 'u_' + crypto.randomBytes(4).toString('hex');
    users[id] = { name, balance, apiKeys: [key], created: new Date().toISOString() };
    writeJSON(DB_FILE, users);
    console.log(`✅ 用户创建成功`);
    console.log(`   ID: ${id}`);
    console.log(`   名称: ${name}`);
    console.log(`   余额: ¥${balance}`);
    console.log(`   API Key: ${key}`);
    break;
  }

  case 'add-key': {
    const userId = args[0];
    if (!userId) { console.log('用法: node admin.js add-key <userId>'); break; }
    const users = readJSON(DB_FILE);
    if (!users[userId]) { console.log('❌ 用户不存在'); break; }
    const key = generateKey();
    users[userId].apiKeys.push(key);
    writeJSON(DB_FILE, users);
    console.log(`✅ 已为用户 ${userId} 添加Key: ${key}`);
    break;
  }

  case 'recharge': {
    const userId = args[0];
    const amount = parseFloat(args[1]);
    if (!userId || !amount) { console.log('用法: node admin.js recharge <userId> <金额>'); break; }
    const users = readJSON(DB_FILE);
    if (!users[userId]) { console.log('❌ 用户不存在'); break; }
    users[userId].balance = (users[userId].balance || 0) + amount;
    writeJSON(DB_FILE, users);
    console.log(`✅ 已充值 ¥${amount}，当前余额: ¥${users[userId].balance}`);
    break;
  }

  case 'list': {
    const users = readJSON(DB_FILE);
    console.log('📋 用户列表:');
    for (const [id, u] of Object.entries(users)) {
      console.log(`   ${id} | ${u.name} | ¥${u.balance || 0} | Keys: ${u.apiKeys?.length || 0}`);
    }
    break;
  }

  case 'usage': {
    const userId = args[0];
    const usage = readJSON(USAGE_FILE);
    if (userId) {
      const logs = usage[userId] || [];
      const totalCost = logs.reduce((s, l) => s + (l.cost || 0), 0);
      console.log(`📊 ${userId} 用量统计:`);
      console.log(`   总请求: ${logs.length}`);
      console.log(`   总花费: ¥${totalCost.toFixed(4)}`);
      console.log(`   最近5条:`);
      logs.slice(-5).forEach(l => 
        console.log(`   ${l.time.substring(0,19)} | ${l.model} | ${l.tokens} tokens | ¥${(l.cost||0).toFixed(4)}`)
      );
    } else {
      console.log('📊 所有用户用量:');
      for (const [uid, logs] of Object.entries(usage)) {
        const total = logs.reduce((s, l) => s + (l.cost || 0), 0);
        console.log(`   ${uid}: ${logs.length} 次请求, ¥${total.toFixed(4)}`);
      }
    }
    break;
  }

  default:
    console.log(`
API Hub 管理工具
用法: node admin.js <命令> [参数]

命令:
  create-user [名称] [余额]    创建新用户
  list                         列出所有用户
  recharge <userId> <金额>     用户充值
  add-key <userId>             添加API Key
  usage [userId]               查看用量
`);
}
