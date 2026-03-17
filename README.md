# Claude Nexus

基于浏览器的 Claude Code 远程工作台 —— 让你在任何设备上通过 Web 终端与 Claude Code 交互。

## 功能特性

- **远程终端** — 基于 xterm.js + WebSocket + node-pty，在浏览器中获得原生终端体验
- **多用户支持** — 用户名 + 密码登录，每个用户拥有独立工作目录，互不干扰
- **项目管理** — 创建、切换、浏览多个项目目录，新建项目自动 git init
- **会话管理** — 自动记录 Claude 对话历史，支持恢复任意历史会话
- **多标签页** — 同时打开多个终端标签，并行处理不同任务
- **智能续接** — 打开项目时自动查询并恢复最近会话；新项目自动创建新会话
- **双向文件同步** — 可选开启，通过本地客户端实现远程与本地文件实时同步
- **自动 Git 提交** — Claude 会话结束时自动提交代码变更
- **管理员面板** — 管理员可在设置中创建新用户
- **会话保活** — 切换标签页时后台进程持续运行（30 分钟无连接后自动回收）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + Vite 6 + xterm.js |
| 后端 | Node.js + WebSocket (ws) + node-pty + chokidar |
| 认证 | bcryptjs + jsonwebtoken（多用户 users.json） |
| 同步客户端 | Node.js + chokidar + ws，通过 pkg 打包为独立可执行文件 |

## 快速开始

### 前置条件

- Node.js >= 18
- 已安装 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)

### 安装与启动

```bash
# 安装所有依赖（前端 + 后端）
npm run install:all

# 启动开发环境（同时启动前端和后端）
npm run dev
```

- 前端：`http://localhost:5173`
- 后端 WebSocket：`ws://localhost:8091`

首次访问时会要求创建管理员账户（用户名 + 密码）。

### 生产构建

```bash
npm run build
cd server && npm start
```

## 多用户机制

### 用户目录

- **管理员**：工作目录可自定义（默认 `/Volumes/xm`，可通过环境变量 `ADMIN_BASE_CWD` 修改）
- **普通用户**：注册时自动在 `~/Desktop/{username}/` 下创建工作目录
- 用户数据存储在 `~/.claudehub/users.json`

### 用户管理

| 操作 | 说明 |
|------|------|
| 首个用户注册 | 无需认证，自动成为管理员 |
| 后续用户创建 | 管理员在设置面板中创建 |
| 路径隔离 | 每个用户只能访问自己 baseCwd 下的文件和项目 |
| 会话隔离 | PTY sessionId 包含用户名前缀，互不干扰 |

## 文件同步

可选功能，用于将远程服务器上的项目文件双向同步到本地。

### 开启方式

1. 登录 Web 界面 → 设置 → 文件同步 → 打开开关
2. 下载对应平台的同步客户端（macOS / Windows / Linux，单文件无需安装）
3. 运行客户端，按交互引导填写服务器地址、Token、本地目录
4. 同步自动开始，状态栏会显示同步状态

### 构建同步客户端

```bash
cd sync-client
npm install
npm run build    # 生成 build/ 下三平台可执行文件
```

### 状态指示器

| 状态 | 颜色 | 说明 |
|------|------|------|
| 等待客户端连接 | 黄色 | 同步已开启但本地客户端未连接 |
| 同步中 | 绿色 | 本地客户端已连接，文件正常同步 |
| 同步异常 | 红色 | 同步过程中发生错误 |

## 项目结构

```
claude-nexus/
├── index.html              # 入口 HTML
├── vite.config.js          # Vite 配置
├── package.json            # 前端依赖与脚本
├── src/
│   ├── main.jsx            # React 入口
│   ├── styles.css          # 全局样式
│   ├── components/
│   │   ├── App.jsx         # 路由、认证与用户状态
│   │   ├── Workspace.jsx   # 主工作台（标签页、项目切换、同步状态）
│   │   ├── TerminalView.jsx # xterm 终端（WebSocket + PTY）
│   │   ├── Sidebar.jsx     # 侧边栏（会话历史）
│   │   ├── ProjectList.jsx # 项目选择与创建
│   │   ├── ChatHistory.jsx # 历史对话列表
│   │   ├── Login.jsx       # 登录 / 注册页
│   │   └── ServerSetup.jsx # 服务配置 + 同步管理 + 用户管理
│   └── hooks/
│       └── useServerConfig.js
├── server/
│   ├── ws-handler.js       # HTTP + WebSocket 服务（含同步 API）
│   ├── pty-manager.js      # PTY 会话池管理
│   ├── auth.js             # 多用户认证模块
│   ├── file-sync.js        # 文件同步服务端（chokidar 监听 + WebSocket 推送）
│   ├── git-auto-commit.js  # 会话结束自动 git commit
│   └── package.json        # 后端依赖
└── sync-client/            # 本地同步客户端（独立可执行程序）
    ├── index.js            # 入口（交互式引导 + 命令行参数）
    ├── sync-engine.js      # 同步核心引擎
    ├── package.json        # 依赖 + pkg 打包配置
    └── build/              # 构建产物（macOS/Linux/Windows）
```

## 会话管理机制

| 操作 | Claude CLI 命令 | 说明 |
|------|-----------------|------|
| 打开项目（有历史） | `claude --resume <uuid>` | 查询最新对话 UUID 并恢复 |
| 打开项目（无历史） | `claude` | 创建全新对话 |
| 点击历史对话 | `claude --resume <uuid>` | 恢复指定对话 |
| 新建会话（+ 按钮） | `claude` | 创建全新对话 |
| 切换标签页 | — | 后台进程持续运行，切回时自动重连 |
| 关闭标签页 | — | 终止对应 PTY 进程，自动 git commit |

## API 端点

### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/status` | 获取认证状态和用户信息 |
| POST | `/api/auth/register` | 注册新用户（首个用户无需认证，后续需 admin token） |
| POST | `/api/auth/login` | 用户名 + 密码登录 |

### 文件同步

| 方法 | 路径 | 说明 |
|------|------|------|
| PUT | `/api/user/sync` | 开启/关闭文件同步 |
| GET | `/api/user/sync/status` | 获取同步状态 |
| POST | `/api/files/sync/init` | 获取远程文件树（用于初始同步） |
| GET | `/api/files/read?path=` | 读取文件内容（base64） |
| POST | `/api/files/write` | 写入文件 |
| DELETE | `/api/files?path=` | 删除文件或目录 |
| GET | `/api/sync-client/download?platform=` | 下载同步客户端 |
| WebSocket | `/sync?token=` | 实时同步通道 |

## 许可证

MIT
