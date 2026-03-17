# 多用户环境设计文档

## 概述

为 Claude Nexus 添加多用户支持。每个用户通过用户名登录，拥有独立的工作根目录，在其中创建和管理项目。可选开启双向文件同步功能，通过本地客户端实现远程与本地的实时同步。

---

## 当前架构（单用户）

| 组件 | 现状 |
|------|------|
| 认证方式 | 单密码登录，无用户名概念 |
| 配置存储 | `~/.claudehub/config.json`（passwordHash, jwtSecret） |
| 工作目录 | 前端配置 baseCwd，所有项目在其下 |
| 会话历史 | `~/.claude/projects/{project-dir}/` |
| PTY 会话 | sessionId = `session-{path}` |
| JWT Token | 仅包含 `{ purpose: 'auth' }` |

---

## 目标架构（多用户）

### 1. 用户工作目录结构

**核心概念：每个用户有独立的工作根目录（baseCwd），所有项目在其下创建。**

```
# 管理员（你）的工作目录（已有）
/Volumes/xm/
├── ClaudeNexus/          # 本项目
├── ProjectA/             # 你的项目
├── ProjectB/             # 你的项目
└── ...

# 新用户的工作目录（注册时自动创建）
~/Desktop/
├── alice/                # 用户 alice 的根目录（注册时自动创建）
│   ├── my-project-1/     # alice 创建的项目
│   ├── my-project-2/
│   └── ...
├── bob/                  # 用户 bob 的根目录
│   ├── web-app/
│   └── ...
└── ...
```

### 2. 用户配置存储

```
~/.claudehub/
├── config.json           # 全局配置（jwtSecret）
└── users.json            # 用户列表
```

**users.json 格式：**

```json
{
  "users": [
    {
      "username": "admin",
      "passwordHash": "$2a$10$...",
      "baseCwd": "/Volumes/xm",
      "role": "admin",
      "syncEnabled": false,
      "createdAt": "2026-03-16T00:00:00Z"
    },
    {
      "username": "alice",
      "passwordHash": "$2a$10$...",
      "baseCwd": "/Users/bitshare/Desktop/alice",
      "role": "user",
      "syncEnabled": true,
      "createdAt": "2026-03-16T00:00:00Z"
    }
  ]
}
```

**关键字段说明：**
- `baseCwd`：用户的工作根目录，登录后前端自动使用此路径作为项目列表的根路径
- `syncEnabled`：是否开启文件同步功能（默认 false）
- 管理员可以自定义 baseCwd（如 `/Volumes/xm`）
- 普通用户 baseCwd 自动设为 `~/Desktop/{username}/`

---

## 需要修改的文件及具体改动

### 3. 后端改动

#### 3.1 `server/auth.js`

**现有逻辑：**
- `setup(password)` → 设置全局密码
- `login(password)` → 验证全局密码，返回 JWT
- `verifyToken(token)` → 验证 JWT

**改为：**

```javascript
const os = require('os');
const path = require('path');

const USERS_FILE = path.join(os.homedir(), '.claudehub', 'users.json');
const DEFAULT_USER_BASE = path.join(os.homedir(), 'Desktop');

// 读取/写入用户列表
function readUsers() { /* 读取 users.json，不存在则返回 { users: [] } */ }
function writeUsers(data) { /* 写入 users.json */ }

// 用户注册
async function register(username, password) {
  // 1. 验证用户名格式（字母、数字、下划线，3-20字符）
  // 2. 检查用户名是否已存在
  // 3. bcrypt 哈希密码
  // 4. 确定 baseCwd：
  //    - 如果是第一个用户（admin），baseCwd 可在注册时指定，或默认 ~/Desktop/{username}
  //    - 普通用户：~/Desktop/{username}/
  // 5. 创建 baseCwd 目录（如果不存在）: fs.mkdirSync(baseCwd, { recursive: true })
  // 6. syncEnabled 默认 false
  // 7. 写入 users.json
  // 8. 返回 JWT（包含 username, role, baseCwd, syncEnabled）
}

// 用户登录
async function login(username, password) {
  // 1. 从 users.json 查找用户
  // 2. bcrypt 比对密码
  // 3. 返回 JWT（包含 username, role, baseCwd, syncEnabled）
}

// JWT payload
// { username: 'alice', role: 'user', baseCwd: '/Users/bitshare/Desktop/alice', purpose: 'auth' }

function verifyToken(token) {
  // 返回 { username, role, baseCwd } 或 null
}

// 更新用户同步设置
async function updateSyncEnabled(username, enabled) {
  // 读取 users.json，找到用户，更新 syncEnabled，写回
}
```

#### 3.2 `server/ws-handler.js`

**API 路由修改：**

```javascript
// === 认证相关 ===

// GET /api/auth/status
// 返回: { needSetup: boolean, hasUsers: boolean, user: { username, role, baseCwd, syncEnabled } | null }

// POST /api/auth/register
// Body: { username, password, baseCwd? }
// - baseCwd 可选，仅 admin 注册时可自定义
// - 普通用户自动设为 ~/Desktop/{username}/
// 返回: { token, user: { username, role, baseCwd, syncEnabled } }

// POST /api/auth/login
// Body: { username, password }
// 返回: { token, user: { username, role, baseCwd, syncEnabled } }

// === 同步设置 ===

// PUT /api/user/sync
// Body: { enabled: true/false }
// - 更新当前用户的 syncEnabled
// - 如果开启：启动服务端文件监听（file-sync.js）
// - 如果关闭：停止服务端文件监听
// 返回: { syncEnabled: true/false }

// GET /api/user/sync/status
// 返回当前同步状态
// {
//   enabled: boolean,
//   clientConnected: boolean,    // 同步客户端是否在线
//   lastSyncTime: timestamp,     // 上次同步时间
//   syncedFiles: number,         // 已同步文件数
// }

// === 项目相关（需加入用户隔离）===

// GET /api/projects?base={baseCwd}
// - 后端校验：base 必须等于或位于当前用户的 baseCwd 下
// - 防止用户越权访问其他用户的目录
// 返回: 该用户 baseCwd 下的项目列表

// POST /api/projects
// Body: { base, name }
// - base 必须是当前用户的 baseCwd
// - 在 baseCwd 下创建项目文件夹

// === 会话历史 ===

// GET /api/conversations?cwd=/path
// - 校验 cwd 在当前用户的 baseCwd 下
// - 读取 ~/.claude/projects/{normalized_cwd}/ 下的 .jsonl 文件

// === WebSocket ===

// PTY sessionId 包含用户名前缀
// {username}-session-{path}
// 确保不同用户即使操作同路径也不会冲突
```

**路径安全校验函数：**

```javascript
// 校验请求路径是否在用户允许的范围内
function isPathAllowed(requestPath, userBaseCwd) {
  const resolved = path.resolve(requestPath);
  return resolved.startsWith(userBaseCwd);
}
```

#### 3.3 `server/pty-manager.js`

```javascript
// 无需修改核心逻辑
// sessionId 已在 ws-handler 层面包含用户名前缀
// 不同用户的 PTY 会话自然隔离

// 可选：添加按用户查询会话
getSessionsByUser(username) {
  return [...this.sessions.entries()]
    .filter(([key]) => key.startsWith(`${username}-`));
}
```

#### 3.4 新增 `server/file-sync.js`（文件同步服务端模块）

**可选功能：用户手动开启后才激活。服务端默认运行同步服务，但仅为开启了 syncEnabled 的用户提供服务。**

```javascript
// server/file-sync.js

const chokidar = require('chokidar');
const path = require('path');

class FileSyncManager {
  constructor() {
    this.watchers = new Map();      // username -> chokidar watcher
    this.syncClients = new Map();   // username -> WebSocket connection
    this.syncStats = new Map();     // username -> { lastSyncTime, syncedFiles, errors }
  }

  // 为用户启动文件监听（当用户开启 sync 时调用）
  startWatching(username, baseCwd) {
    if (this.watchers.has(username)) return; // 已在监听

    const watcher = chokidar.watch(baseCwd, {
      ignored: [
        /(^|[\/\\])\../,          // 忽略隐藏文件
        /node_modules/,
        /\.git/,
        /\.env/,
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    watcher
      .on('add', (fp) => this.notifyClient(username, 'FILE_ADD', fp, baseCwd))
      .on('change', (fp) => this.notifyClient(username, 'FILE_CHANGE', fp, baseCwd))
      .on('unlink', (fp) => this.notifyClient(username, 'FILE_DELETE', fp, baseCwd))
      .on('addDir', (dp) => this.notifyClient(username, 'DIR_ADD', dp, baseCwd))
      .on('unlinkDir', (dp) => this.notifyClient(username, 'DIR_DELETE', dp, baseCwd));

    this.watchers.set(username, watcher);
    this.syncStats.set(username, { lastSyncTime: null, syncedFiles: 0, errors: 0 });
  }

  // 停止用户文件监听（当用户关闭 sync 时调用）
  stopWatching(username) {
    const watcher = this.watchers.get(username);
    if (watcher) {
      watcher.close();
      this.watchers.delete(username);
    }
    this.syncStats.delete(username);
  }

  // 注册同步客户端的 WebSocket 连接
  registerClient(username, ws) {
    this.syncClients.set(username, ws);
    ws.on('close', () => this.syncClients.delete(username));
  }

  // 客户端是否在线
  isClientConnected(username) {
    const ws = this.syncClients.get(username);
    return ws && ws.readyState === 1; // WebSocket.OPEN
  }

  // 获取同步状态
  getSyncStatus(username) {
    const stats = this.syncStats.get(username) || {};
    return {
      watching: this.watchers.has(username),
      clientConnected: this.isClientConnected(username),
      lastSyncTime: stats.lastSyncTime,
      syncedFiles: stats.syncedFiles || 0,
    };
  }

  // 通知客户端文件变更
  notifyClient(username, event, fullPath, baseCwd) {
    const ws = this.syncClients.get(username);
    if (!ws || ws.readyState !== 1) return;

    const relativePath = path.relative(baseCwd, fullPath);
    ws.send(JSON.stringify({
      type: 'SYNC_EVENT',
      event,
      path: relativePath,
      timestamp: Date.now(),
    }));
  }

  // 处理客户端上传的文件变更
  async handleClientSync(username, message, baseCwd) {
    const { event, path: relativePath, content } = message;
    const fullPath = path.join(baseCwd, relativePath);

    // 安全校验
    if (!path.resolve(fullPath).startsWith(path.resolve(baseCwd))) {
      throw new Error('Path traversal detected');
    }

    switch (event) {
      case 'FILE_UPLOAD':
        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.promises.writeFile(fullPath, Buffer.from(content, 'base64'));
        break;
      case 'FILE_DELETE':
        await fs.promises.unlink(fullPath).catch(() => {});
        break;
      case 'DIR_CREATE':
        await fs.promises.mkdir(fullPath, { recursive: true });
        break;
      case 'DIR_DELETE':
        await fs.promises.rm(fullPath, { recursive: true, force: true });
        break;
    }

    // 更新统计
    const stats = this.syncStats.get(username);
    if (stats) {
      stats.lastSyncTime = Date.now();
      stats.syncedFiles++;
    }
  }
}

module.exports = FileSyncManager;
```

**同步相关 API 端点（在 ws-handler.js 中添加）：**

```javascript
// POST /api/files/sync/init
// 初始化同步：返回用户 baseCwd 下完整的文件树（含哈希）
// 仅当 syncEnabled=true 时可调用
// 返回: { files: [{ path, hash, mtime, size }] }

// WebSocket 端点: ws://HOST:PORT/sync?token=JWT
// 专用同步通道，仅当用户 syncEnabled=true 时允许连接
// 连接后自动注册到 FileSyncManager
```

#### 3.5 新增 `sync-client/`（本地同步客户端 — 打包为独立可执行程序）

**由于浏览器安全沙箱限制无法访问本地文件系统，双向自动同步必须通过本地客户端实现。**

**使用 `pkg` 将 Node.js 项目打包为独立可执行文件，内嵌 Node.js 运行时，用户无需安装任何环境，下载后双击即可运行。**

##### 3.5.1 目录结构

```
sync-client/
├── package.json            # 依赖 + pkg 打包配置
├── index.js                # 入口：交互式引导 或 命令行参数模式
├── sync-engine.js          # 核心同步逻辑
└── build/                  # 打包输出目录（构建后生成）
    ├── claude-nexus-sync-macos       # macOS 可执行文件
    ├── claude-nexus-sync-linux       # Linux 可执行文件
    └── claude-nexus-sync-win.exe     # Windows 可执行文件
```

##### 3.5.2 package.json（含 pkg 打包配置）

```json
{
  "name": "claude-nexus-sync",
  "version": "1.0.0",
  "description": "Claude Nexus 文件同步客户端",
  "main": "index.js",
  "bin": "index.js",
  "pkg": {
    "targets": [
      "node18-macos-x64",
      "node18-macos-arm64",
      "node18-linux-x64",
      "node18-win-x64"
    ],
    "outputPath": "build",
    "assets": []
  },
  "scripts": {
    "build": "pkg . --compress GZip",
    "build:mac": "pkg . --targets node18-macos-arm64 --output build/claude-nexus-sync-macos --compress GZip",
    "build:linux": "pkg . --targets node18-linux-x64 --output build/claude-nexus-sync-linux --compress GZip",
    "build:win": "pkg . --targets node18-win-x64 --output build/claude-nexus-sync-win.exe --compress GZip"
  },
  "dependencies": {
    "chokidar": "^3.6.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@yao-pkg/pkg": "^5.0.0"
  }
}
```

> **注意**：使用 `@yao-pkg/pkg`（社区维护的 pkg fork，支持最新 Node.js）

##### 3.5.3 构建和分发流程

```bash
# 开发者（你）在服务器上构建:
cd sync-client
npm install
npm run build          # 一次性生成 macOS/Linux/Windows 三平台可执行文件

# 产物:
# build/claude-nexus-sync-macos       (~45MB, 单文件)
# build/claude-nexus-sync-linux       (~45MB, 单文件)
# build/claude-nexus-sync-win.exe     (~45MB, 单文件)
```

**服务端提供下载端点（在 ws-handler.js 中）：**

```javascript
// GET /api/sync-client/download?platform=macos|linux|win
// 根据 platform 参数返回对应的可执行文件
// 前端根据 navigator.platform 自动判断用户系统，提供对应下载按钮
//
// 文件存放在: sync-client/build/ 目录
// 服务端检测 build/ 目录是否存在对应文件，不存在则返回 404 提示管理员先构建

// 可选：自动检测平台
// GET /api/sync-client/download (不传 platform)
// → 根据请求 User-Agent 自动判断平台
```

##### 3.5.4 用户使用流程（零依赖）

```
用户视角:

1. 在 Web 界面开启"文件同步"
2. 点击"下载同步客户端 (macOS)" 按钮
3. 下载得到一个文件: claude-nexus-sync-macos
4. 终端中运行:
   chmod +x claude-nexus-sync-macos    ← 仅首次需要
   ./claude-nexus-sync-macos           ← 双击或命令行运行

5. 进入交互式引导（见下方 3.5.5），按提示填写即可
6. 同步自动开始
```

##### 3.5.5 交互式引导入口 `sync-client/index.js`

**客户端入口 `sync-client/index.js`（交互式引导）：**

```javascript
#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');
const SyncEngine = require('./sync-engine');

const CONFIG_FILE = path.join(__dirname, '.sync-config.json');

// ========== 交互式引导 ==========

function createRL() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

// 读取上次保存的配置
function loadSavedConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {}
  return null;
}

// 保存配置（token 不保存，每次需要重新输入或从缓存中获取）
function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function interactiveSetup() {
  const rl = createRL();
  const saved = loadSavedConfig();

  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   Claude Nexus 文件同步客户端        ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');

  // 如果有上次的配置，询问是否使用
  if (saved) {
    console.log('  检测到上次的配置:');
    console.log(`    服务器: ${saved.server}`);
    console.log(`    本地目录: ${saved.localDir}`);
    console.log('');
    const reuse = await ask(rl, '  是否使用上次的配置？(Y/n): ');
    if (reuse.toLowerCase() !== 'n') {
      // 仅需要重新输入 token（安全起见不缓存）
      console.log('');
      console.log('  ┌─────────────────────────────────────────┐');
      console.log('  │ 💡 Token 获取方式:                       │');
      console.log('  │    登录 Web 界面 → 设置 → 文件同步       │');
      console.log('  │    → 点击「复制令牌」按钮                 │');
      console.log('  └─────────────────────────────────────────┘');
      console.log('');
      const token = await ask(rl, '  请粘贴你的 Token: ');
      rl.close();
      return { ...saved, token: token.trim() };
    }
    console.log('');
  }

  // ---- 第 1 步: 服务器地址 ----
  console.log('  📡 第 1 步: 服务器地址');
  console.log('  ─────────────────────');
  console.log('  输入远程服务器的 IP 和端口');
  console.log('  示例: http://192.168.1.100:8091');
  console.log('        https://my-server.com:8091');
  console.log('');
  const defaultServer = saved?.server || '';
  const serverPrompt = defaultServer
    ? `  服务器地址 [${defaultServer}]: `
    : '  服务器地址: ';
  let server = await ask(rl, serverPrompt);
  server = server.trim() || defaultServer;

  if (!server) {
    console.log('  ❌ 服务器地址不能为空');
    rl.close();
    process.exit(1);
  }

  // ---- 第 2 步: Token ----
  console.log('');
  console.log('  🔑 第 2 步: 登录令牌 (Token)');
  console.log('  ─────────────────────────────');
  console.log('  ┌─────────────────────────────────────────┐');
  console.log('  │ Token 获取方式:                          │');
  console.log('  │                                          │');
  console.log('  │  1. 在浏览器中打开 Claude Nexus 并登录    │');
  console.log('  │  2. 点击右上角用户名 → 「设置」           │');
  console.log('  │  3. 找到「文件同步」，确保开关已开启       │');
  console.log('  │  4. 点击「复制令牌」按钮                  │');
  console.log('  │  5. 回到这里粘贴                          │');
  console.log('  └─────────────────────────────────────────┘');
  console.log('');
  const token = await ask(rl, '  请粘贴你的 Token: ');

  if (!token.trim()) {
    console.log('  ❌ Token 不能为空');
    rl.close();
    process.exit(1);
  }

  // ---- 第 3 步: 本地目录 ----
  console.log('');
  console.log('  📁 第 3 步: 本地同步目录');
  console.log('  ────────────────────────');
  console.log('  选择一个本地文件夹，远程项目文件将同步到此处');
  console.log('  如果文件夹不存在会自动创建');
  console.log('');
  const homeDir = os.homedir();
  const examples = [
    path.join(homeDir, 'ClaudeSync'),
    path.join(homeDir, 'Desktop', 'my-projects'),
    path.join(homeDir, 'Documents', 'claude-sync'),
  ];
  console.log('  示例路径:');
  examples.forEach((ex, i) => console.log(`    ${i + 1}. ${ex}`));
  console.log('');
  const defaultLocal = saved?.localDir || examples[0];
  const localDir = await ask(rl, `  本地目录 [${defaultLocal}]: `);

  rl.close();

  const config = {
    server: server.trim(),
    token: token.trim(),
    localDir: (localDir.trim() || defaultLocal),
  };

  // 保存配置（不保存 token）
  saveConfig({ server: config.server, localDir: config.localDir });

  // ---- 确认 ----
  console.log('');
  console.log('  ✓ 配置完成！');
  console.log('  ─────────────');
  console.log(`  服务器:   ${config.server}`);
  console.log(`  本地目录: ${config.localDir}`);
  console.log('');

  return config;
}

// ========== 命令行参数模式 ==========

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) return null; // 无参数 → 走交互模式

  const config = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-s': case '--server': config.server = args[++i]; break;
      case '-t': case '--token':  config.token = args[++i]; break;
      case '-l': case '--local':  config.localDir = args[++i]; break;
    }
  }

  if (!config.server || !config.token || !config.localDir) {
    console.log('用法: node index.js -s <服务器地址> -t <Token> -l <本地目录>');
    console.log('  或直接运行 node index.js 进入交互式引导');
    process.exit(1);
  }
  return config;
}

// ========== 主入口 ==========

async function main() {
  // 优先命令行参数，无参数则交互引导
  const config = parseArgs() || await interactiveSetup();

  const engine = new SyncEngine({
    serverUrl: config.server,
    token: config.token,
    localDir: config.localDir,
  });

  await engine.start();

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n  正在停止同步...');
    engine.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('  ❌ 启动失败:', err.message);
  process.exit(1);
});
```

**配置缓存机制：**

```
首次运行时（交互引导）:
  → 用户填写 服务器地址、Token、本地目录
  → 服务器地址和本地目录保存到 .sync-config.json（Token 不保存，安全考虑）
  → 启动同步

再次运行时:
  → 检测到 .sync-config.json
  → 提示 "检测到上次的配置，是否使用？"
  → 用户按回车确认 → 仅需重新粘贴 Token
  → 启动同步

命令行参数模式（高级用户/自动化）:
  → ./claude-nexus-sync -s http://192.168.1.100:8091 -t <token> -l ~/sync
  → 跳过交互，直接启动
```

> **注意**：配置缓存文件 `.sync-config.json` 在 pkg 打包后保存在可执行文件所在目录。

**同步引擎 `sync-client/sync-engine.js`：**

```javascript
const chokidar = require('chokidar');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SyncEngine {
  constructor({ serverUrl, token, localDir }) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.localDir = path.resolve(localDir);
    this.ignoreNextChange = new Set(); // 防回环
    this.ws = null;
    this.watcher = null;
  }

  async start() {
    // 确保本地目录存在
    fs.mkdirSync(this.localDir, { recursive: true });

    // 1. 初始同步
    console.log('正在执行初始同步...');
    await this.initialSync();

    // 2. 连接 WebSocket（监听远程变更）
    this.connectWebSocket();

    // 3. 监听本地文件变更
    this.startLocalWatcher();

    console.log(`✓ 同步已启动: ${this.localDir} ↔ ${this.serverUrl}`);
    console.log('按 Ctrl+C 停止同步');
  }

  async initialSync() {
    // 获取远程文件树
    const resp = await fetch(`${this.serverUrl}/api/files/sync/init`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!resp.ok) throw new Error(`初始化失败: ${resp.status}`);
    const { files: remoteFiles } = await resp.json();

    // 扫描本地文件树
    const localFiles = await this.scanLocalFiles();

    // 构建对比 Map
    const remoteMap = new Map(remoteFiles.map(f => [f.path, f]));
    const localMap = new Map(localFiles.map(f => [f.path, f]));

    let downloaded = 0, uploaded = 0;

    // 远程有、本地无 或 hash 不同且远程更新 → 下载
    for (const [rPath, rFile] of remoteMap) {
      const lFile = localMap.get(rPath);
      if (!lFile || (lFile.hash !== rFile.hash && rFile.mtime > (lFile.mtime || 0))) {
        await this.downloadFile(rPath);
        downloaded++;
      }
    }

    // 本地有、远程无 或 hash 不同且本地更新 → 上传
    for (const [lPath, lFile] of localMap) {
      const rFile = remoteMap.get(lPath);
      if (!rFile || (rFile.hash !== lFile.hash && lFile.mtime > (rFile.mtime || 0))) {
        await this.uploadFile(lPath);
        uploaded++;
      }
    }

    console.log(`初始同步完成: 下载 ${downloaded} 个文件, 上传 ${uploaded} 个文件`);
  }

  connectWebSocket() {
    const wsUrl = this.serverUrl.replace(/^http/, 'ws') + `/sync?token=${this.token}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => console.log('✓ 远程同步通道已连接'));

    this.ws.on('message', async (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'SYNC_EVENT') {
        this.ignoreNextChange.add(msg.path);
        switch (msg.event) {
          case 'FILE_ADD':
          case 'FILE_CHANGE':
            await this.downloadFile(msg.path);
            console.log(`↓ ${msg.path}`);
            break;
          case 'FILE_DELETE':
            const delPath = path.join(this.localDir, msg.path);
            await fs.promises.unlink(delPath).catch(() => {});
            console.log(`✕ ${msg.path}`);
            break;
          case 'DIR_ADD':
            await fs.promises.mkdir(path.join(this.localDir, msg.path), { recursive: true });
            break;
          case 'DIR_DELETE':
            await fs.promises.rm(path.join(this.localDir, msg.path), { recursive: true, force: true });
            break;
        }
      }
    });

    this.ws.on('close', () => {
      console.log('远程连接断开，3秒后重连...');
      setTimeout(() => this.connectWebSocket(), 3000);
    });

    this.ws.on('error', (err) => console.error('WebSocket 错误:', err.message));
  }

  startLocalWatcher() {
    this.watcher = chokidar.watch(this.localDir, {
      ignored: [/(^|[\/\\])\./, /node_modules/, /\.git/],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this.watcher
      .on('add', (fp) => this.onLocalChange('FILE_UPLOAD', fp))
      .on('change', (fp) => this.onLocalChange('FILE_UPLOAD', fp))
      .on('unlink', (fp) => this.onLocalChange('FILE_DELETE', fp))
      .on('addDir', (dp) => this.onLocalChange('DIR_CREATE', dp))
      .on('unlinkDir', (dp) => this.onLocalChange('DIR_DELETE', dp));
  }

  async onLocalChange(event, fullPath) {
    const relativePath = path.relative(this.localDir, fullPath);
    if (this.ignoreNextChange.has(relativePath)) {
      this.ignoreNextChange.delete(relativePath);
      return;
    }

    if (event === 'FILE_UPLOAD') {
      await this.uploadFile(relativePath);
      console.log(`↑ ${relativePath}`);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'SYNC_ACTION', event, path: relativePath }));
      console.log(`↑ [${event}] ${relativePath}`);
    }
  }

  async uploadFile(relativePath) {
    const localPath = path.join(this.localDir, relativePath);
    const content = await fs.promises.readFile(localPath);
    await fetch(`${this.serverUrl}/api/files/write`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: relativePath, content: content.toString('base64') }),
    });
  }

  async downloadFile(relativePath) {
    const resp = await fetch(
      `${this.serverUrl}/api/files/read?path=${encodeURIComponent(relativePath)}`,
      { headers: { Authorization: `Bearer ${this.token}` } }
    );
    const { content } = await resp.json();
    const localPath = path.join(this.localDir, relativePath);
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
    await fs.promises.writeFile(localPath, Buffer.from(content, 'base64'));
  }

  async scanLocalFiles() {
    const files = [];
    const scan = async (dir) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else {
          const stat = await fs.promises.stat(fullPath);
          const content = await fs.promises.readFile(fullPath);
          files.push({
            path: path.relative(this.localDir, fullPath),
            hash: crypto.createHash('md5').update(content).digest('hex'),
            mtime: stat.mtimeMs,
            size: stat.size,
          });
        }
      }
    };
    await scan(this.localDir);
    return files;
  }

  stop() {
    if (this.watcher) this.watcher.close();
    if (this.ws) this.ws.close();
  }
}

module.exports = SyncEngine;
```

---

### 4. 前端改动

#### 4.1 `src/components/Login.jsx`

```jsx
// 改为支持用户名 + 密码登录/注册
//
// 两种模式:
// 1. 注册模式（needSetup=true 时默认，或用户点击"注册"）
//    - 用户名输入框
//    - 密码输入框
//    - 确认密码输入框
//    - 提交按钮: "注册" / "创建管理员账户"
//    - 调用: POST /api/auth/register { username, password }
//
// 2. 登录模式（hasUsers=true 时默认）
//    - 用户名输入框
//    - 密码输入框
//    - 提交按钮: "登录"
//    - 底部链接: "没有账户？注册"
//    - 调用: POST /api/auth/login { username, password }
//
// 成功后:
// - localStorage 存储 token（key: claudehub_v2_token）
// - localStorage 存储用户信息（key: claudehub_v2_user，JSON 字符串）
// - 调用 onLogin(token, user)
```

#### 4.2 `src/components/App.jsx`

```jsx
// 1. state 增加 currentUser: { username, role, baseCwd, syncEnabled }
// 2. checkAuthStatus 解析 user 信息
// 3. onLogin 接收 (token, user)
// 4. 传递给 Workspace:
<Workspace
  token={token}
  currentUser={currentUser}
  onLogout={handleLogout}
/>
```

#### 4.3 `src/components/Workspace.jsx`

```jsx
// 1. 接收 currentUser prop
// 2. baseCwd 使用 currentUser.baseCwd 而非前端配置
//    - 移除前端 localStorage 中的 baseCwd 配置
//    - baseCwd 来源改为登录时从服务端返回的用户信息
// 3. 状态栏显示当前用户名（右上角区域）
// 4. sessionId 包含用户名:
//    `${currentUser.username}-session-${cwd.replace(/\//g, '-')}`
// 5. 同步功能开关和状态显示（见下文 4.5）
```

#### 4.4 `src/components/TerminalView.jsx`

```
// 基本无需改动
// WebSocket 通过 token 自动携带用户信息
// sessionId 已包含用户名前缀
```

#### 4.5 同步功能的前端交互设计

**核心原则：同步功能默认关闭，用户手动开启。关闭时不显示任何同步相关 UI。**

##### 4.5.1 同步开关（在设置/用户菜单中）

```jsx
// 位置：状态栏用户菜单下拉 或 设置弹窗中
//
// UI:
// ┌─────────────────────────────────┐
// │ 文件同步  [开关 Toggle]          │
// │                                  │
// │ （关闭状态下无其他内容）           │
// └─────────────────────────────────┘
//
// 当用户打开开关时:
// 1. 调用 PUT /api/user/sync { enabled: true }
// 2. 显示同步客户端下载和使用教程（见 4.5.2）
// 3. 状态栏出现同步状态指示器（见 4.5.3）
//
// 当用户关闭开关时:
// 1. 调用 PUT /api/user/sync { enabled: false }
// 2. 隐藏教程、下载链接和状态指示器
```

##### 4.5.2 同步客户端下载和使用教程（仅开启后显示）

```jsx
// 开启同步后，在设置弹窗/同步面板中显示:
//
// ┌─────────────────────────────────────────────────────────────┐
// │ 文件同步  [开关: 已开启 ✓]                                    │
// │                                                               │
// │ 📦 下载同步客户端                                              │
// │ ┌───────────────────────────────────────────────────────────┐ │
// │ │  自动检测系统:                                              │ │
// │ │  [下载客户端 (macOS)]     ← 根据 navigator.platform 高亮    │ │
// │ │  [下载客户端 (Windows)]                                     │ │
// │ │  [下载客户端 (Linux)]                                       │ │
// │ └───────────────────────────────────────────────────────────┘ │
// │                                                               │
// │ 📖 使用方法                                                    │
// │ ┌───────────────────────────────────────────────────────────┐ │
// │ │  1. 点击上方按钮下载客户端（单个文件，无需安装）              │ │
// │ │                                                            │ │
// │ │  2. macOS/Linux 用户首次需要授权:                           │ │
// │ │     chmod +x claude-nexus-sync-macos                       │ │
// │ │                                                            │ │
// │ │  3. 双击运行 或 在终端中执行:                                │ │
// │ │     ./claude-nexus-sync-macos                              │ │
// │ │                                                            │ │
// │ │  4. 按提示填写:                                             │ │
// │ │     • 服务器地址（已为你自动复制）                           │ │
// │ │     • Token 令牌（点击下方按钮复制）                         │ │
// │ │     • 本地同步目录                                          │ │
// │ │                                                            │ │
// │ │  5. 完成！文件将自动双向同步                                 │ │
// │ └───────────────────────────────────────────────────────────┘ │
// │                                                               │
// │ 🔑 快捷操作                                                    │
// │ [复制服务器地址] [复制令牌 Token]                                │
// └─────────────────────────────────────────────────────────────┘
//
// 下载链接实现:
// - 服务端提供 GET /api/sync-client/download?platform=macos|linux|win
// - 返回 sync-client/build/ 下对应平台的可执行文件
// - 前端根据 navigator.platform 自动高亮推荐的平台按钮
// - 不存在时返回提示"管理员尚未构建同步客户端"
```

##### 4.5.3 同步状态指示器（仅开启后显示在状态栏）

```jsx
// 位置：状态栏，在用户名旁边
//
// 状态显示逻辑：
//
// 1. 已开启但客户端未连接:
//    [⟳ 等待客户端连接]  （灰色/黄色）
//
// 2. 客户端已连接，同步正常:
//    [↕ 同步中]  （绿色）
//
// 3. 正在同步文件:
//    [↕ 同步中 (3个文件)]  （绿色+动画）
//
// 4. 同步出错:
//    [⚠ 同步异常]  （红色）
//
// 5. 同步已关闭（不显示任何内容）

// 实现方式：
// - 轮询 GET /api/user/sync/status 每 5 秒一次
// - 或通过现有 WebSocket 推送同步状态更新
//
// 组件示例：
function SyncStatusIndicator({ syncEnabled, token, serverUrl }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!syncEnabled) return;

    const poll = setInterval(async () => {
      const resp = await fetch(`${serverUrl}/api/user/sync/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStatus(await resp.json());
    }, 5000);

    return () => clearInterval(poll);
  }, [syncEnabled]);

  if (!syncEnabled || !status) return null;

  if (!status.clientConnected) {
    return <span className="sync-status waiting">⟳ 等待客户端连接</span>;
  }

  return <span className="sync-status active">↕ 同步中</span>;
}
```

---

## 5. 迁移策略（兼容现有单用户）

```javascript
// 服务器启动时自动检查并迁移:

async function migrateFromSingleUser() {
  const configPath = path.join(os.homedir(), '.claudehub', 'config.json');
  const usersPath = path.join(os.homedir(), '.claudehub', 'users.json');

  // 如果已有 users.json，跳过迁移
  if (fs.existsSync(usersPath)) return;

  // 读取旧配置
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (config.passwordHash) {
      // 将旧密码迁移为 admin 用户
      const users = {
        users: [{
          username: 'admin',
          passwordHash: config.passwordHash,
          baseCwd: '/Volumes/xm',  // 管理员默认工作目录
          role: 'admin',
          syncEnabled: false,
          createdAt: new Date().toISOString(),
        }]
      };

      fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));

      // 从旧配置中移除 passwordHash
      delete config.passwordHash;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      console.log('已将旧单用户配置迁移为 admin 用户');
    }
  }
}
```

---

## 6. 新增依赖

| 包名 | 用途 | 安装位置 |
|------|------|----------|
| `chokidar` | 文件系统监听（服务端同步） | server/package.json |
| `chokidar` | 文件系统监听（同步客户端） | sync-client/package.json |
| `ws` | WebSocket（同步客户端） | sync-client/package.json |
| `@yao-pkg/pkg` | 打包为独立可执行文件（开发依赖） | sync-client/package.json (devDeps) |

---

## 7. 实现优先级

### 第一阶段：多用户认证（优先实现）
1. 修改 `server/auth.js` — 添加 register/login 逻辑、users.json 管理
2. 修改 `server/ws-handler.js` — 注册 API、登录 API 改造、路径权限校验
3. 修改 `src/components/Login.jsx` — 用户名输入框、注册/登录切换
4. 修改 `src/components/App.jsx` — currentUser 状态管理
5. 修改 `src/components/Workspace.jsx` — baseCwd 从用户信息获取、sessionId 前缀、状态栏用户名
6. 迁移脚本 — 单用户 → 多用户

### 第二阶段：文件同步基础设施
7. 新增 `server/file-sync.js` — 服务端文件监听 + WebSocket 同步通道
8. 在 `server/ws-handler.js` 中添加文件同步 API（sync/init、files/read、files/write）
9. 同步开关 API（PUT /api/user/sync）
10. 同步状态 API（GET /api/user/sync/status）

### 第三阶段：本地同步客户端
11. 新增 `sync-client/` — 同步客户端源码 + 交互式引导
12. 使用 `@yao-pkg/pkg` 打包为 macOS/Linux/Windows 独立可执行文件（无需 Node.js）
13. 初始同步（文件树哈希对比 + 差异传输）
14. 实时同步（chokidar 监听 + WebSocket 推送）
15. 服务端下载端点（GET /api/sync-client/download?platform=macos|linux|win）

### 第四阶段：前端同步 UI
16. 同步开关 UI（设置中）
17. 同步客户端下载和使用教程页面（仅开启后显示）
18. 状态栏同步状态指示器（仅开启后显示）
19. 复制令牌 / 复制完整命令按钮

---

## 8. 安全注意事项

- **用户名验证**：仅允许 `[a-zA-Z0-9_]`，长度 3-20
- **密码要求**：最少 4 个字符
- **路径安全**：所有文件操作 API 必须校验路径在用户 baseCwd 内，防止路径遍历（`../`）
- **PTY 隔离**：sessionId 含用户名前缀，不同用户会话完全隔离
- **同步安全**：文件同步 WebSocket 需验证 JWT，只同步用户自己的目录
- **文件大小限制**：上传/同步应限制单文件大小（如 50MB），防止滥用
- **忽略敏感文件**：同步时忽略 `.env`、`.git/`、`node_modules/` 等

---

## 9. 关键文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/auth.js` | **重构** | 多用户注册/登录、users.json 管理 |
| `server/ws-handler.js` | **修改** | 注册 API、同步 API、路径校验 |
| `server/pty-manager.js` | **小改** | 可选：按用户查询会话 |
| `server/file-sync.js` | **新增** | 文件监听 + WebSocket 同步服务端 |
| `src/components/Login.jsx` | **重构** | 用户名+密码、注册/登录切换 |
| `src/components/App.jsx` | **修改** | currentUser 状态 |
| `src/components/Workspace.jsx` | **修改** | baseCwd 从用户获取、sessionId 前缀、同步状态显示 |
| `src/components/TerminalView.jsx` | 无需改动 | — |
| `sync-client/index.js` | **新增** | 同步客户端入口（交互式引导 + 命令行参数） |
| `sync-client/sync-engine.js` | **新增** | 同步核心引擎 |
| `sync-client/package.json` | **新增** | 依赖 + pkg 打包配置 |
| `sync-client/build/` | **构建产物** | macOS/Linux/Windows 独立可执行文件（无需 Node.js） |
