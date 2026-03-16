# Claude Nexus

基于浏览器的 Claude Code 远程工作台 —— 让你在任何设备上通过 Web 终端与 Claude Code 交互。

## 功能特性

- **远程终端** — 基于 xterm.js + WebSocket + node-pty，在浏览器中获得原生终端体验
- **项目管理** — 创建、切换、浏览多个项目目录
- **会话管理** — 自动记录 Claude 对话历史，支持恢复（`--resume`）任意历史会话
- **多标签页** — 同时打开多个终端标签，并行处理不同任务
- **智能续接** — 打开项目时自动恢复最近会话（`--continue`）；新项目则自动创建新会话
- **密码保护** — JWT 认证机制，安全访问远程服务
- **会话保活** — 切换标签页时后台进程持续运行（30 分钟无连接后自动回收）

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + Vite 6 + xterm.js |
| 后端 | Node.js + WebSocket (ws) + node-pty |
| 认证 | bcryptjs + jsonwebtoken |

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

首次访问时会要求设置访问密码。

### 生产构建

```bash
npm run build
cd server && npm start
```

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
│   │   ├── App.jsx         # 路由与认证
│   │   ├── Workspace.jsx   # 主工作台（标签页、项目切换）
│   │   ├── TerminalView.jsx # xterm 终端（WebSocket + PTY）
│   │   ├── Sidebar.jsx     # 侧边栏（会话历史）
│   │   ├── ProjectList.jsx # 项目选择与创建
│   │   ├── ChatHistory.jsx # 历史对话列表
│   │   ├── Login.jsx       # 登录页
│   │   └── ServerSetup.jsx # 服务地址配置
│   └── hooks/
│       └── useServerConfig.js
└── server/
    ├── ws-handler.js       # HTTP + WebSocket 服务
    ├── pty-manager.js      # PTY 会话池管理
    ├── auth.js             # 认证模块
    └── package.json        # 后端依赖
```

## 会话管理机制

| 操作 | Claude CLI 命令 | 说明 |
|------|-----------------|------|
| 打开项目（有历史） | `claude --continue` | 恢复最近一次对话 |
| 打开项目（无历史） | `claude` | 创建全新对话 |
| 点击历史对话 | `claude --resume <uuid>` | 恢复指定对话 |
| 新建会话（+ 按钮） | `claude` | 创建全新对话 |
| 切换标签页 | — | 后台进程持续运行，切回时自动重连 |
| 关闭标签页 | — | 终止对应 PTY 进程 |

## 许可证

MIT
