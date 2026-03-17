# 项目自动 Git 初始化方案

## 概述

在用户通过 Claude Nexus 创建项目时，自动执行 `git init` 并提交初始 commit。这样用户通过 VS Code Remote-SSH 或任何 IDE 连接远端时，可以直接看到 Claude Code 修改了哪些文件、改了什么内容。

**核心：这是本地 git 仓库，不涉及 GitHub/GitLab 远程推送，每个用户的项目独立隔离。**

---

## 目录隔离结构

每个用户有独立的 `baseCwd`，项目的 git 仓库天然按用户隔离：

```
# admin 用户
/Volumes/xm/
├── ProjectA/          ← 独立 git 仓库
│   └── .git/
├── ProjectB/          ← 独立 git 仓库
│   └── .git/
└── ...

# alice 用户
~/Desktop/alice/
├── my-project-1/      ← 独立 git 仓库
│   └── .git/
├── my-project-2/      ← 独立 git 仓库
│   └── .git/
└── ...

# bob 用户
~/Desktop/bob/
├── web-app/           ← 独立 git 仓库
│   └── .git/
└── ...
```

**每个项目是独立的 git 仓库**，不是共用一个。不同用户之间完全隔离，互相看不到。

---

## 后端实现

### 修改 `server/ws-handler.js` 中的 POST /api/projects

**当前代码（第 607-635 行）：**

```javascript
if (req.method === "POST" && url.pathname === "/api/projects") {
    const body = await readJsonBody(req);
    if (!body || !body.base || !body.name) {
      sendJson(res, 400, { error: "Missing base or name" });
      return;
    }

    const requestedBase = normalizePath(body.base);
    const expectedBase = normalizePath(user.baseCwd);
    if (requestedBase !== expectedBase) {
      sendJson(res, 403, { error: "Projects can only be created in your root workspace" });
      return;
    }

    const safeName = String(body.name).replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, "");
    if (!safeName) {
      sendJson(res, 400, { error: "Invalid project name" });
      return;
    }

    const fullPath = path.join(expectedBase, safeName);
    try {
      await fs.mkdir(fullPath, { recursive: true });
      sendJson(res, 200, { name: safeName, path: fullPath });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Failed to create project" });
    }
    return;
  }
```

**改为：**

```javascript
if (req.method === "POST" && url.pathname === "/api/projects") {
    const body = await readJsonBody(req);
    if (!body || !body.base || !body.name) {
      sendJson(res, 400, { error: "Missing base or name" });
      return;
    }

    const requestedBase = normalizePath(body.base);
    const expectedBase = normalizePath(user.baseCwd);
    if (requestedBase !== expectedBase) {
      sendJson(res, 403, { error: "Projects can only be created in your root workspace" });
      return;
    }

    const safeName = String(body.name).replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, "");
    if (!safeName) {
      sendJson(res, 400, { error: "Invalid project name" });
      return;
    }

    const fullPath = path.join(expectedBase, safeName);
    try {
      await fs.mkdir(fullPath, { recursive: true });

      // ===== 自动 git init =====
      const gitDir = path.join(fullPath, ".git");
      let gitInited = false;
      try {
        await fs.access(gitDir);
        // .git 已存在，跳过
      } catch {
        // .git 不存在，执行初始化
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileAsync = promisify(execFile);

        // git init
        await execFileAsync("git", ["init"], { cwd: fullPath });

        // 创建 .gitignore
        const gitignoreContent = [
          "node_modules/",
          ".env",
          ".env.*",
          ".DS_Store",
          "*.log",
          "",
        ].join("\n");
        await fs.writeFile(path.join(fullPath, ".gitignore"), gitignoreContent);

        // 配置仓库级别的 user（不影响全局 git 配置）
        await execFileAsync("git", ["config", "user.name", user.username], { cwd: fullPath });
        await execFileAsync("git", ["config", "user.email", `${user.username}@claude-nexus.local`], { cwd: fullPath });

        // 初始提交
        await execFileAsync("git", ["add", "-A"], { cwd: fullPath });
        await execFileAsync("git", ["commit", "-m", "init: project created", "--allow-empty"], { cwd: fullPath });

        gitInited = true;
      }
      // ===== 自动 git init 结束 =====

      sendJson(res, 200, { name: safeName, path: fullPath, gitInited });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Failed to create project" });
    }
    return;
  }
```

### 关键细节说明

#### 1. git config 是仓库级别的

```javascript
// 这两行设置的是项目级别的 git 配置（存在 .git/config 里）
// 不会影响服务器的全局 ~/.gitconfig
await execFileAsync("git", ["config", "user.name", user.username], { cwd: fullPath });
await execFileAsync("git", ["config", "user.email", `${user.username}@claude-nexus.local`], { cwd: fullPath });
```

效果：
- admin 创建的项目 → git log 显示 `admin <admin@claude-nexus.local>`
- alice 创建的项目 → git log 显示 `alice <alice@claude-nexus.local>`
- 每个项目的 `.git/config` 里单独存储，互不干扰

#### 2. 已有 git 仓库不会重复初始化

```javascript
try {
  await fs.access(gitDir);  // 检查 .git 是否存在
  // 存在 → 跳过
} catch {
  // 不存在 → 初始化
}
```

如果用户 clone 了一个已有的仓库到项目目录，不会被覆盖。

#### 3. .gitignore 自动创建

自动排除常见的不需要跟踪的文件，避免 `node_modules` 等大目录污染 git 状态。

---

## 使用效果

### 场景：用户 alice 通过 Claude Nexus 创建项目并让 Claude 写代码

```
1. alice 在 Web 界面创建项目 "my-app"
   → 服务端自动: git init + initial commit
   → 目录: ~/Desktop/alice/my-app/

2. alice 在 Claude Nexus 中跟 Claude 对话，Claude 创建/修改了文件

3. alice 用 VS Code Remote-SSH 连到服务器，打开 ~/Desktop/alice/my-app/
   → Source Control 面板显示:
     M  src/index.js        (Claude 修改了这个文件)
     A  src/utils.js        (Claude 新建了这个文件)
     D  old-file.js         (Claude 删除了这个文件)
   → 点击文件可以看到具体的 diff（红绿对比）
```

### 场景：想保存 Claude 的某次修改为一个版本

可以在 VS Code 的终端或 Claude Nexus 的终端中手动提交：

```bash
git add -A
git commit -m "feat: Claude 帮我实现了登录功能"
```

这样下次 Claude 再改代码时，diff 是相对于上次提交的，更清晰。

---

## 自动提交：Claude 会话断开时自动 commit

当 Claude Code 的 PTY 会话退出（用户关闭对话、Claude 完成任务、或会话超时断开）时，自动将项目中的所有变更提交为一个 git commit。

### 触发时机

```
用户打开项目 → Claude Code 会话启动（PTY spawn）
     ↓
Claude 修改文件...
     ↓
会话结束（以下任一情况触发自动 commit）：
  1. Claude 任务完成，进程正常退出（exitCode = 0）
  2. 用户在 Web 界面关闭/断开会话
  3. 会话空闲 30 分钟超时被 kill（已有的 IDLE_TIMEOUT_MS 机制）
     ↓
自动 git add -A && git commit
```

### 实现方式

#### 1. 新增 `server/git-auto-commit.js`

```javascript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

/**
 * 检查目录是否是 git 仓库
 */
async function isGitRepo(cwd) {
  try {
    await access(path.join(cwd, ".git"));
    return true;
  } catch {
    return false;
  }
}

/**
 * 自动提交项目中的所有变更
 * @param {string} projectPath - 项目目录路径
 * @param {string} username - 用户名（用于 commit message）
 * @returns {Promise<{committed: boolean, message?: string, error?: string}>}
 */
export async function autoCommit(projectPath, username) {
  try {
    // 1. 检查是否是 git 仓库
    if (!(await isGitRepo(projectPath))) {
      return { committed: false, message: "not a git repo" };
    }

    // 2. 检查是否有变更
    const { stdout: status } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: projectPath,
    });

    if (!status.trim()) {
      return { committed: false, message: "no changes" };
    }

    // 3. 统计变更文件
    const changedFiles = status
      .trim()
      .split("\n")
      .map((line) => line.trim());
    const fileCount = changedFiles.length;

    // 4. 构建 commit message
    //    格式: "auto: Claude 会话结束 (alice, 2026-03-16 14:30:25, 5个文件)"
    const timestamp = new Date().toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const commitMsg = `auto: Claude 会话结束 (${username}, ${timestamp}, ${fileCount}个文件)`;

    // 5. git add -A && git commit
    await execFileAsync("git", ["add", "-A"], { cwd: projectPath });
    await execFileAsync("git", ["commit", "-m", commitMsg], { cwd: projectPath });

    console.log(`[git-auto-commit] ${projectPath}: committed ${fileCount} files`);
    return { committed: true, message: commitMsg, fileCount };
  } catch (error) {
    // 静默失败，不影响主流程
    console.error(`[git-auto-commit] ${projectPath}: ${error.message}`);
    return { committed: false, error: error.message };
  }
}
```

#### 2. 修改 `server/pty-manager.js`

在 PtyManager 的 `getOrStartSession` 中，监听会话退出事件，触发自动 commit：

**当前代码（第 160-208 行）：**

```javascript
class PtyManager {
  constructor() {
    this.sessions = new Map();
  }

  getOrStartSession(sessionId, cwd, { cols, rows, continueId = "" } = {}) {
    const existing = this.sessions.get(sessionId);
    if (existing?.alive) {
      if (cols || rows) {
        existing.resize(cols, rows);
      }
      return existing;
    }

    const session = new PtySession(sessionId, { cwd, cols, rows, continueId });
    session.on("exit", () => {
      session.clearIdleTimer();
      this.sessions.delete(sessionId);
    });
    this.sessions.set(sessionId, session);
    return session;
  }
  // ...
}
```

**改为：**

```javascript
import { autoCommit } from "./git-auto-commit.js";

class PtyManager {
  constructor() {
    this.sessions = new Map();
  }

  getOrStartSession(sessionId, cwd, { cols, rows, continueId = "", username = "" } = {}) {
    const existing = this.sessions.get(sessionId);
    if (existing?.alive) {
      if (cols || rows) {
        existing.resize(cols, rows);
      }
      return existing;
    }

    const session = new PtySession(sessionId, { cwd, cols, rows, continueId });
    session.on("exit", () => {
      session.clearIdleTimer();
      this.sessions.delete(sessionId);

      // ===== 会话退出时自动 git commit =====
      if (username && cwd) {
        autoCommit(cwd, username).catch(() => {});
      }
    });
    this.sessions.set(sessionId, session);
    return session;
  }
  // ...
}
```

#### 3. 修改 `server/ws-handler.js` 中调用 getOrStartSession 的地方

在创建 PTY 会话时传入 `username`：

**找到调用 `getOrStartSession` 的代码，加上 username 参数：**

```javascript
// 改前：
const session = ptyManager.getOrStartSession(sessionId, cwd, { cols, rows, continueId });

// 改后：
const session = ptyManager.getOrStartSession(sessionId, cwd, { cols, rows, continueId, username: user.username });
```

### 完整工作流时间线

```
[创建项目]
  POST /api/projects { name: "my-app" }
  → mkdir ~/Desktop/alice/my-app
  → git init
  → git add -A && git commit -m "init: project created"

[第一次对话]
  用户连接 PTY 会话 → Claude 创建了 index.js, utils.js, package.json
  用户关闭对话（或 Claude 完成退出）
  → PTY exit 事件触发
  → autoCommit("~/Desktop/alice/my-app", "alice")
  → git add -A
  → git commit -m "auto: Claude 会话结束 (alice, 2026/03/16 14:30:25, 3个文件)"

[第二次对话]
  用户继续对话 → Claude 修改了 index.js, 新建 auth.js
  会话结束
  → autoCommit(...)
  → git commit -m "auto: Claude 会话结束 (alice, 2026/03/16 15:10:03, 2个文件)"

[用 VS Code 查看]
  git log 显示：
    commit abc123  auto: Claude 会话结束 (alice, 2026/03/16 15:10:03, 2个文件)
    commit def456  auto: Claude 会话结束 (alice, 2026/03/16 14:30:25, 3个文件)
    commit 789ghi  init: project created

  每个 commit 之间的 diff 就是那次 Claude 对话的所有修改
```

### git log 效果示例

```bash
$ cd ~/Desktop/alice/my-app
$ git log --oneline

a1b2c3d  auto: Claude 会话结束 (alice, 2026/03/16 15:10:03, 2个文件)
d4e5f6g  auto: Claude 会话结束 (alice, 2026/03/16 14:30:25, 3个文件)
h7i8j9k  init: project created

# 查看某次 Claude 做了什么
$ git show a1b2c3d --stat

 src/index.js  | 15 +++++++++------
 src/auth.js   | 42 ++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 51 insertions(+), 6 deletions(-)

# 查看详细 diff
$ git show a1b2c3d
```

---

## 对现有功能的影响

| 功能 | 影响 |
|------|------|
| 双向文件同步 | 无影响。同步忽略 `.git/` 目录（已在 IGNORED_PATTERNS 中配置） |
| PTY 会话 | 无影响。Claude Code 正常工作 |
| 项目列表 | 无影响。`.git` 是隐藏目录，项目列表已过滤 `entry.name.startsWith(".")` |
| 服务器性能 | 极小影响。`git init` 仅在创建项目时执行一次 |

---

## 不需要配置的东西

- **不需要** GitHub/GitLab 账号
- **不需要** SSH key
- **不需要** 远程仓库（push/pull）
- **不需要** 修改服务器全局 git 配置
- **不需要** 用户手动操作任何 git 命令

一切都是本地 git 仓库，仅用于**查看 diff 和版本记录**。
