import { EventEmitter } from "node:events";
import os from "node:os";
import process from "node:process";
import pty from "node-pty";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

function buildEnv(cwd) {
  const home = process.env.HOME || os.homedir();
  const pathParts = [
    `${home}/.local/bin`,
    "/opt/homebrew/bin",
    process.env.PATH || "",
  ].filter(Boolean);

  return {
    ...process.env,
    PATH: pathParts.join(":"),
    TERM: process.env.TERM || "xterm-256color",
    COLORTERM: process.env.COLORTERM || "truecolor",
    PWD: cwd,
  };
}

class PtySession extends EventEmitter {
  constructor(sessionId, { cwd, cols = 120, rows = 30, continueId = "" }) {
    super();
    this.sessionId = sessionId;
    this.cwd = cwd || process.cwd();
    this.cols = Number(cols) || 120;
    this.rows = Number(rows) || 30;
    this.createdAt = new Date().toISOString();
    this.lastActivity = this.createdAt;
    this.subscribers = new Set();
    this.idleTimer = null;

    const command = process.env.CLAUDE_PATH || `${process.env.HOME}/.local/bin/claude`;
    let args = [];
    if (continueId === "__latest__") {
      // claude --continue（不带 ID）= 恢复最近一次对话
      args = ["--continue"];
    } else if (continueId) {
      // claude --resume <uuid> = 恢复指定对话
      args = ["--resume", continueId];
    }
    this.pty = pty.spawn(command, args, {
      name: "xterm-256color",
      cwd: this.cwd,
      cols: this.cols,
      rows: this.rows,
      env: buildEnv(this.cwd),
    });

    this.pid = this.pty.pid;
    this.alive = true;
    this.scrollbackBuffer = [];
    this.scrollbackSize = 0;
    this.maxScrollbackSize = 50 * 1024;

    this.pty.onData((data) => {
      this.touch();
      const buf = Buffer.from(data, "utf8");
      this.scrollbackBuffer.push(buf);
      this.scrollbackSize += buf.length;
      while (this.scrollbackSize > this.maxScrollbackSize && this.scrollbackBuffer.length > 1) {
        this.scrollbackSize -= this.scrollbackBuffer.shift().length;
      }
      this.emit("data", { raw: buf });
    });

    this.pty.onExit(({ exitCode, signal }) => {
      this.alive = false;
      this.touch();
      this.clearIdleTimer();
      this.emit("exit", { exitCode, signal });
    });
  }

  touch() {
    this.lastActivity = new Date().toISOString();
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    this.clearIdleTimer();
    const wrapped = (payload) => listener(payload);
    this.on("data", wrapped);

    return () => {
      this.off("data", wrapped);
      this.subscribers.delete(listener);
      this.scheduleIdleCleanup();
    };
  }

  scheduleIdleCleanup() {
    if (!this.alive || this.subscribers.size > 0 || this.idleTimer) {
      return;
    }

    this.idleTimer = setTimeout(() => {
      this.kill();
    }, IDLE_TIMEOUT_MS);
  }

  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  write(data) {
    if (!this.alive) {
      return;
    }
    this.touch();
    this.pty.write(data);
  }

  resize(cols, rows) {
    if (!this.alive) {
      return;
    }
    const nextCols = Number(cols) || this.cols;
    const nextRows = Number(rows) || this.rows;
    this.cols = nextCols;
    this.rows = nextRows;
    this.touch();
    this.pty.resize(nextCols, nextRows);
  }

  kill() {
    if (!this.alive) {
      return;
    }
    this.alive = false;
    this.clearIdleTimer();
    this.pty.kill();
  }

  getScrollbackData() {
    if (this.scrollbackBuffer.length === 0) {
      return null;
    }
    return Buffer.concat(this.scrollbackBuffer);
  }

  toJSON() {
    return {
      sessionId: this.sessionId,
      pid: this.pid,
      alive: this.alive,
      cwd: this.cwd,
      cols: this.cols,
      rows: this.rows,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
    };
  }
}

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

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    return session?.alive ? session : null;
  }

  killSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.kill();
    return true;
  }

  listSessions() {
    return [...this.sessions.values()]
      .filter((session) => session.alive)
      .map((session) => session.toJSON());
  }
}

export const ptyManager = new PtyManager();
