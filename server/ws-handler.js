import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { WebSocket, WebSocketServer } from "ws";
import {
  getAuthStatus,
  login,
  register,
  setup,
  updateSyncEnabled,
  verify,
} from "./auth.js";
import { buildFileTree, createFileHash, fileSyncManager, MAX_FILE_SIZE, isIgnoredPath } from "./file-sync.js";
import { ptyManager } from "./pty-manager.js";

const PORT = 8091;
const HOST = "0.0.0.0";
const execFileAsync = promisify(execFile);
const SYNC_CLIENT_DIR = path.resolve(process.cwd(), "sync-client", "build");
const SYNC_CLIENT_FILES = {
  macos: "claude-nexus-sync-macos",
  linux: "claude-nexus-sync-linux",
  win: "claude-nexus-sync-win.exe",
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return "";
  }
  return token;
}

function normalizePath(targetPath) {
  return path.resolve(targetPath || process.cwd());
}

function normalizeOptionalPath(targetPath) {
  return typeof targetPath === "string" && targetPath.trim() ? normalizePath(targetPath) : "";
}

function isPathAllowed(requestPath, userBaseCwd) {
  if (!requestPath || !userBaseCwd) {
    return false;
  }

  const resolvedRequest = normalizePath(requestPath);
  const resolvedBase = normalizePath(userBaseCwd);
  const relativePath = path.relative(resolvedBase, resolvedRequest);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function cwdToProjectDir(cwd) {
  return (cwd || "").replace(/\//g, "-");
}

function getProjectBaseDir(cwd) {
  const projectDir = cwdToProjectDir(cwd);
  return path.join(os.homedir(), ".claude", "projects", projectDir);
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function normalizeAssistantContent(content) {
  if (!Array.isArray(content)) {
    return typeof content === "string" ? content : "";
  }

  const textParts = content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text.trim())
    .filter(Boolean);

  if (textParts.length > 0) {
    return textParts.join("\n");
  }

  const toolNames = content
    .filter((item) => item?.type === "tool_use" && item.name)
    .map((item) => `[tool] ${item.name}`);

  return toolNames.join("\n");
}

async function readConversationSummary(filePath) {
  const stat = await fs.stat(filePath);
  const fileName = path.basename(filePath);
  const fallbackTitle = path.basename(filePath, ".jsonl");
  let title = fallbackTitle;
  let firstTimestamp = null;

  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  for await (const line of rl) {
    if (lineCount++ >= 50) {
      break;
    }

    const record = parseJsonLine(line);
    if (!record) {
      continue;
    }

    if (!firstTimestamp && typeof record.timestamp === "string") {
      firstTimestamp = record.timestamp;
    }

    if (record.type === "user" && typeof record.message?.content === "string") {
      title = record.message.content.slice(0, 50);
      if (firstTimestamp) {
        break;
      }
    }
  }

  rl.close();

  return {
    id: fileName,
    conversationId: fileName.replace(/\.jsonl$/, ""),
    title,
    createdAt: firstTimestamp || stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
    messageCount: null,
  };
}

async function listConversations(cwd) {
  if (!cwd) {
    return [];
  }

  const baseDir = getProjectBaseDir(cwd);
  let entries = [];
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const jsonlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"));
  const conversations = [];

  for (const entry of jsonlFiles) {
    try {
      const summary = await readConversationSummary(path.join(baseDir, entry.name));
      conversations.push(summary);
    } catch {
      continue;
    }
  }

  return conversations.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

async function getConversation(cwd, id) {
  if (!cwd || !id) {
    return null;
  }

  const fullPath = path.join(getProjectBaseDir(cwd), path.basename(id));
  let raw = "";
  try {
    raw = await fs.readFile(fullPath, "utf8");
  } catch {
    return null;
  }

  const records = raw.split("\n").map(parseJsonLine).filter(Boolean);
  const messages = records
    .filter((record) => record.type === "user" || record.type === "assistant")
    .map((record) => {
      if (record.type === "user") {
        return {
          role: "user",
          content: typeof record.message?.content === "string" ? record.message.content : "",
          timestamp: record.timestamp || null,
        };
      }

      return {
        role: "assistant",
        content: normalizeAssistantContent(record.message?.content),
        timestamp: record.timestamp || null,
      };
    });

  const firstUser = messages.find((message) => message.role === "user");
  return {
    id: path.basename(id),
    title: firstUser?.content?.slice(0, 50) || path.basename(id, ".jsonl"),
    messages,
  };
}

function getUserSessionId(username, sessionId) {
  const prefix = `${username}-`;
  return sessionId.startsWith(prefix) ? sessionId : `${prefix}${sessionId}`;
}

async function requireApiUser(req, res) {
  const verification = await verify(getBearerToken(req));
  if (!verification.valid || !verification.user) {
    sendJson(res, 401, { error: "Unauthorized" });
    return null;
  }

  return verification.user;
}

function resolveUserPath(relativePath, userBaseCwd) {
  const safeRelative = String(relativePath || "").replace(/^[/\\]+/, "");
  const fullPath = path.resolve(userBaseCwd, safeRelative);
  if (!isPathAllowed(fullPath, userBaseCwd)) {
    throw new Error("Path is outside your workspace");
  }
  return fullPath;
}

function getSyncClientPlatform(value, userAgent = "") {
  if (value && SYNC_CLIENT_FILES[value]) {
    return value;
  }

  const ua = userAgent.toLowerCase();
  if (ua.includes("mac")) {
    return "macos";
  }
  if (ua.includes("win")) {
    return "win";
  }
  return "linux";
}

async function readFileAsSyncPayload(filePath) {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error("File too large");
  }
  const content = await fs.readFile(filePath);
  return {
    content: content.toString("base64"),
    hash: createFileHash(content),
    mtime: stat.mtimeMs,
    size: stat.size,
  };
}

async function ensureProjectGitRepo(projectPath, username) {
  const gitDir = path.join(projectPath, ".git");
  let gitInited = false;

  try {
    await fs.access(gitDir);
    return { gitInited };
  } catch {
    // 仓库不存在时才初始化。
  }

  await execFileAsync("git", ["init"], { cwd: projectPath });

  const gitignoreContent = [
    "node_modules/",
    ".env",
    ".env.*",
    ".DS_Store",
    "*.log",
    "",
  ].join("\n");
  await fs.writeFile(path.join(projectPath, ".gitignore"), gitignoreContent, "utf8");

  await execFileAsync("git", ["config", "user.name", username], { cwd: projectPath });
  await execFileAsync("git", ["config", "user.email", `${username}@claude-nexus.local`], {
    cwd: projectPath,
  });
  await execFileAsync("git", ["add", "-A"], { cwd: projectPath });
  await execFileAsync("git", ["commit", "-m", "init: project created", "--allow-empty"], {
    cwd: projectPath,
  });

  gitInited = true;
  return { gitInited };
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "Bad Request" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    const status = await getAuthStatus(getBearerToken(req));
    sendJson(res, 200, status);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/setup") {
    const body = await readJsonBody(req);
    if (!body || typeof body.password !== "string" || body.password.length < 4) {
      sendJson(res, 400, { error: "Invalid password" });
      return;
    }

    try {
      const result = await setup(body.password);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Setup failed" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJsonBody(req);
    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      sendJson(res, 400, { error: "Invalid username or password" });
      return;
    }

    try {
      const authStatus = await getAuthStatus(getBearerToken(req));
      if (authStatus.hasUsers) {
        const verification = await verify(getBearerToken(req));
        if (!verification.valid || verification.user?.role !== "admin") {
          sendJson(res, 403, { error: "Only administrators can create new users" });
          return;
        }
      }

      const result = await register(body.username, body.password, {
        baseCwd: typeof body.baseCwd === "string" ? body.baseCwd : "",
      });
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Register failed" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
      sendJson(res, 400, { error: "Invalid username or password" });
      return;
    }

    try {
      const result = await login(body.username, body.password);
      sendJson(res, 200, result);
    } catch {
      sendJson(res, 401, { error: "Unauthorized" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      status: "ok",
      sessions: ptyManager.listSessions().length,
    });
    return;
  }

  if (!url.pathname.startsWith("/api/")) {
    sendJson(res, 404, { error: "Not Found" });
    return;
  }

  const user = await requireApiUser(req, res);
  if (!user) {
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/sessions") {
    sendJson(res, 200, ptyManager.getSessionsByUser(user.username));
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/sessions/")) {
    const rawSessionId = decodeURIComponent(url.pathname.split("/").pop() || "");
    if (!rawSessionId) {
      sendJson(res, 400, { error: "Missing sessionId" });
      return;
    }

    const sessionId = getUserSessionId(user.username, rawSessionId);
    const killed = ptyManager.killSession(sessionId);
    sendJson(res, 200, { killed });
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/user/sync") {
    const body = await readJsonBody(req);
    if (!body || typeof body.enabled !== "boolean") {
      sendJson(res, 400, { error: "Missing enabled flag" });
      return;
    }

    try {
      const nextUser = await updateSyncEnabled(user.username, body.enabled);
      if (nextUser.syncEnabled) {
        await fileSyncManager.startWatching(nextUser.username, nextUser.baseCwd);
      } else {
        await fileSyncManager.stopWatching(nextUser.username);
      }
      sendJson(res, 200, {
        syncEnabled: Boolean(nextUser?.syncEnabled),
        user: nextUser,
        status: fileSyncManager.getSyncStatus(nextUser.username),
      });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Update failed" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/user/sync/status") {
    if (user.syncEnabled && !fileSyncManager.getSyncStatus(user.username).enabled) {
      await fileSyncManager.startWatching(user.username, user.baseCwd);
    }
    sendJson(res, 200, fileSyncManager.getSyncStatus(user.username));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/files/sync/init") {
    if (!user.syncEnabled) {
      sendJson(res, 403, { error: "File sync is disabled" });
      return;
    }

    try {
      if (!fileSyncManager.getSyncStatus(user.username).enabled) {
        await fileSyncManager.startWatching(user.username, user.baseCwd);
      }
      const files = await buildFileTree(user.baseCwd);
      sendJson(res, 200, { files });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Failed to build file tree" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/files/read") {
    if (!user.syncEnabled) {
      sendJson(res, 403, { error: "File sync is disabled" });
      return;
    }

    const relativePath = url.searchParams.get("path") || "";
    if (!relativePath) {
      sendJson(res, 400, { error: "Missing path parameter" });
      return;
    }

    try {
      const fullPath = resolveUserPath(relativePath, user.baseCwd);
      const payload = await readFileAsSyncPayload(fullPath);
      sendJson(res, 200, { path: relativePath, ...payload });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Failed to read file" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/files/write") {
    if (!user.syncEnabled) {
      sendJson(res, 403, { error: "File sync is disabled" });
      return;
    }

    const body = await readJsonBody(req);
    if (!body || typeof body.path !== "string" || typeof body.content !== "string") {
      sendJson(res, 400, { error: "Missing path or content" });
      return;
    }

    try {
      const fullPath = resolveUserPath(body.path, user.baseCwd);
      const buffer = Buffer.from(body.content, "base64");
      if (buffer.length > MAX_FILE_SIZE) {
        sendJson(res, 413, { error: "File too large" });
        return;
      }

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, buffer);
      fileSyncManager.markSynced(user.username);
      sendJson(res, 200, {
        ok: true,
        path: body.path,
        hash: createFileHash(buffer),
      });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Failed to write file" });
    }
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/files") {
    if (!user.syncEnabled) {
      sendJson(res, 403, { error: "File sync is disabled" });
      return;
    }

    const relativePath = url.searchParams.get("path") || "";
    if (!relativePath) {
      sendJson(res, 400, { error: "Missing path parameter" });
      return;
    }

    try {
      const fullPath = resolveUserPath(relativePath, user.baseCwd);
      await fs.rm(fullPath, { recursive: true, force: true });
      fileSyncManager.markSynced(user.username);
      sendJson(res, 200, { ok: true, path: relativePath });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Failed to delete path" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/sync-client/download") {
    const platform = getSyncClientPlatform(
      url.searchParams.get("platform") || "",
      req.headers["user-agent"] || "",
    );
    const fileName = SYNC_CLIENT_FILES[platform];
    const fullPath = path.join(SYNC_CLIENT_DIR, fileName);

    try {
      await fs.access(fullPath);
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename=\"${fileName}\"`,
      });
      createReadStream(fullPath).pipe(res);
    } catch {
      sendJson(res, 404, {
        error: "Sync client is not built yet",
        platform,
      });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    const base = normalizeOptionalPath(url.searchParams.get("base"));
    if (!base) {
      sendJson(res, 400, { error: "Missing base parameter" });
      return;
    }

    if (!isPathAllowed(base, user.baseCwd)) {
      sendJson(res, 403, { error: "Path is outside your workspace" });
      return;
    }

    try {
      const entries = await fs.readdir(base, { withFileTypes: true });
      const projects = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) {
          continue;
        }

        const fullPath = path.join(base, entry.name);
        let stat;
        try {
          stat = await fs.stat(fullPath);
        } catch {
          continue;
        }

        projects.push({
          name: entry.name,
          path: fullPath,
          updatedAt: stat.mtime.toISOString(),
        });
      }

      projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      sendJson(res, 200, projects);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Failed to list projects" });
    }
    return;
  }

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
      const { gitInited } = await ensureProjectGitRepo(fullPath, user.username);
      sendJson(res, 200, { name: safeName, path: fullPath, gitInited });
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Failed to create project" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/conversations") {
    const cwd = normalizeOptionalPath(url.searchParams.get("cwd"));
    if (!cwd) {
      sendJson(res, 400, { error: "Missing cwd parameter" });
      return;
    }
    if (!isPathAllowed(cwd, user.baseCwd)) {
      sendJson(res, 403, { error: "Path is outside your workspace" });
      return;
    }

    const conversations = await listConversations(cwd);
    sendJson(res, 200, conversations);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/conversations/")) {
    const cwd = normalizeOptionalPath(url.searchParams.get("cwd"));
    if (!cwd) {
      sendJson(res, 400, { error: "Missing cwd parameter" });
      return;
    }
    if (!isPathAllowed(cwd, user.baseCwd)) {
      sendJson(res, 403, { error: "Path is outside your workspace" });
      return;
    }

    const id = decodeURIComponent(url.pathname.split("/").pop() || "");
    const conversation = await getConversation(cwd, id);
    if (!conversation) {
      sendJson(res, 404, { error: "Not Found" });
      return;
    }

    sendJson(res, 200, conversation);
    return;
  }

  sendJson(res, 404, { error: "Not Found" });
});

const wss = new WebSocketServer({ server });

async function handleSyncConnection(ws, user) {
  if (!user.syncEnabled) {
    ws.close(4003, "File sync is disabled");
    return;
  }

  if (!fileSyncManager.getSyncStatus(user.username).enabled) {
    await fileSyncManager.startWatching(user.username, user.baseCwd);
  }

  fileSyncManager.registerClient(user.username, ws);
  ws.send(JSON.stringify({ type: "SYNC_CONNECTED", username: user.username }));

  ws.on("message", async (raw, isBinary) => {
    if (isBinary) {
      return;
    }

    try {
      const message = JSON.parse(raw.toString());
      if (!message || typeof message !== "object") {
        return;
      }

      if (message.type === "PING") {
        ws.send(JSON.stringify({ type: "PONG" }));
        return;
      }

      if (message.type !== "SYNC_ACTION") {
        return;
      }

      await fileSyncManager.handleClientSync(
        user.username,
        message,
        user.baseCwd,
        (relativePath) => resolveUserPath(relativePath, user.baseCwd),
      );
      ws.send(
        JSON.stringify({
          type: "SYNC_ACK",
          event: message.event,
          path: message.path,
          timestamp: Date.now(),
        }),
      );
    } catch (error) {
      fileSyncManager.markError(user.username);
      ws.send(
        JSON.stringify({
          type: "SYNC_ERROR",
          message: error instanceof Error ? error.message : "Sync failed",
        }),
      );
    }
  });
}

function handleTerminalConnection(ws, url, user) {
  const rawSessionId = url.searchParams.get("sessionId") || "default";
  const sessionId = getUserSessionId(user.username, rawSessionId);
  const cwd = normalizePath(url.searchParams.get("cwd") || process.cwd());
  const cols = Number(url.searchParams.get("cols")) || 120;
  const rows = Number(url.searchParams.get("rows")) || 30;
  const continueId = url.searchParams.get("continueId") || "";

  if (!isPathAllowed(cwd, user.baseCwd)) {
    ws.close(4003, "Forbidden");
    return;
  }

  let session;
  try {
    session = ptyManager.getOrStartSession(sessionId, cwd, {
      cols,
      rows,
      continueId,
      username: user.username,
    });
  } catch (error) {
    ws.send(
      JSON.stringify({
        type: "ERROR",
        message: error instanceof Error ? error.message : "Failed to start PTY session",
      }),
    );
    ws.close();
    return;
  }

  const unsubscribe = session.subscribe(({ raw }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(raw, { binary: true });
    }
  });

  const onExit = ({ exitCode, signal }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "SESSION_EXIT", exitCode, signal }));
    }
  };

  session.on("exit", onExit);
  ws.send(JSON.stringify({ type: "CONNECTED", sessionId, pid: session.pid, cwd: session.cwd }));

  const scrollback = session.getScrollbackData();
  if (scrollback) {
    ws.send(scrollback, { binary: true });
  }

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    unsubscribe();
    session.off("exit", onExit);
  };

  ws.on("message", (raw, isBinary) => {
    if (isBinary) {
      return;
    }

    const str = raw.toString();
    try {
      const message = JSON.parse(str);
      if (message && typeof message === "object" && message.type) {
        if (message.type === "RESIZE") {
          session.resize(message.cols, message.rows);
        } else if (message.type === "PING") {
          ws.send(JSON.stringify({ type: "PONG" }));
        }
        return;
      }
    } catch {
      // 非 JSON 控制消息时，继续当作终端输入处理。
    }

    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        str.trim(),
      )
    ) {
      return;
    }

    session.write(str);
  });

  ws.on("close", cleanup);
  ws.on("error", cleanup);
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const token = url.searchParams.get("token") || "";

  verify(token)
    .then(async (verification) => {
      if (!verification.valid || !verification.user) {
        ws.close(4001, "Unauthorized");
        return;
      }

      const user = verification.user;
      if (url.pathname === "/sync") {
        await handleSyncConnection(ws, user);
        return;
      }

      handleTerminalConnection(ws, url, user);
    })
    .catch(() => {
      ws.close(4001, "Unauthorized");
    });
});

server.listen(PORT, HOST, () => {
  console.log(`[WS Handler] 已启动 ws://${HOST}:${PORT}`);
});
