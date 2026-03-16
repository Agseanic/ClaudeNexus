import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { WebSocket, WebSocketServer } from "ws";
import { login, needSetup, setup, verify } from "./auth.js";
import { ptyManager } from "./pty-manager.js";

const PORT = 8091;
const HOST = "0.0.0.0";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "Bad Request" });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    const token = getBearerToken(req);
    const verification = await verify(token);
    sendJson(res, 200, {
      needSetup: await needSetup(),
      authenticated: verification.valid,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/setup") {
    const body = await readJsonBody(req);
    if (!body || typeof body.password !== "string" || body.password.length < 4) {
      sendJson(res, 400, { error: "Invalid password" });
      return;
    }

    try {
      await setup(body.password);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Setup failed" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    if (!body || typeof body.password !== "string") {
      sendJson(res, 400, { error: "Invalid password" });
      return;
    }

    try {
      const result = await login(body.password);
      sendJson(res, 200, result);
    } catch {
      sendJson(res, 401, { error: "Unauthorized" });
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    const verification = await verify(getBearerToken(req));
    if (!verification.valid) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      status: "ok",
      sessions: ptyManager.listSessions().length,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/sessions") {
    sendJson(res, 200, ptyManager.listSessions());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    const base = url.searchParams.get("base") || "";
    if (!base) {
      sendJson(res, 400, { error: "Missing base parameter" });
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
      sendJson(res, 500, { error: error.message || "Failed to list projects" });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    const body = await readJsonBody(req);
    if (!body || !body.base || !body.name) {
      sendJson(res, 400, { error: "Missing base or name" });
      return;
    }

    const safeName = body.name.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, "");
    if (!safeName) {
      sendJson(res, 400, { error: "Invalid project name" });
      return;
    }

    const fullPath = path.join(body.base, safeName);
    try {
      await fs.mkdir(fullPath, { recursive: true });
      sendJson(res, 200, { name: safeName, path: fullPath });
    } catch (error) {
      sendJson(res, 500, { error: error.message || "Failed to create project" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/conversations") {
    const cwd = url.searchParams.get("cwd") || "";
    const conversations = await listConversations(cwd);
    sendJson(res, 200, conversations);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/conversations/")) {
    const cwd = url.searchParams.get("cwd") || "";
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

wss.on("connection", (ws, req) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const token = url.searchParams.get("token") || "";
  verify(token).then(async (verification) => {
    if (!verification.valid) {
      ws.close(4001, "Unauthorized");
      return;
    }

    const sessionId = url.searchParams.get("sessionId") || "default";
    const cwd = url.searchParams.get("cwd") || process.cwd();
    const cols = Number(url.searchParams.get("cols")) || 120;
    const rows = Number(url.searchParams.get("rows")) || 30;
    let continueId = url.searchParams.get("continueId") || "";

    // 如果要恢复最近会话，先检查是否有会话存在；没有则自动创建新会话
    if (continueId === "__latest__") {
      try {
        const baseDir = getProjectBaseDir(cwd);
        const entries = await fs.readdir(baseDir, { withFileTypes: true });
        const hasConversation = entries.some((e) => e.isFile() && e.name.endsWith(".jsonl"));
        if (!hasConversation) {
          console.log(`[WS] No conversations found for "${cwd}", starting fresh session`);
          continueId = "";
        }
      } catch {
        // 目录不存在，说明没有会话
        console.log(`[WS] No conversation dir for "${cwd}", starting fresh session`);
        continueId = "";
      }
    }

    let session;
    try {
      session = ptyManager.getOrStartSession(sessionId, cwd, { cols, rows, continueId });
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
        if (message.type === "RESIZE") {
          session.resize(message.cols, message.rows);
          return;
        }
        if (message.type === "PING") {
          ws.send(JSON.stringify({ type: "PONG" }));
        }
        return;
      } catch {
        session.write(str);
      }
    });

    ws.on("close", cleanup);
    ws.on("error", cleanup);
  }).catch(() => {
    ws.close(4001, "Unauthorized");
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[WS Handler] 已启动 ws://${HOST}:${PORT}`);
});
