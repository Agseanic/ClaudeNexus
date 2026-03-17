import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import chokidar from "chokidar";
import { WebSocket } from "ws";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const IGNORED_PATTERNS = [/(^|[/\\])\./, /node_modules/, /\.git/, /\.env/];

function isIgnoredPath(targetPath) {
  return IGNORED_PATTERNS.some((pattern) => pattern.test(targetPath));
}

export function createFileHash(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

export async function buildFileTree(baseCwd) {
  const files = [];

  async function walk(currentDir) {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseCwd, fullPath);
      if (!relativePath || isIgnoredPath(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stat = await fs.stat(fullPath);
      if (stat.size > MAX_FILE_SIZE) {
        continue;
      }

      const content = await fs.readFile(fullPath);
      files.push({
        path: relativePath,
        hash: createFileHash(content),
        mtime: stat.mtimeMs,
        size: stat.size,
      });
    }
  }

  await walk(baseCwd);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export class FileSyncManager {
  constructor() {
    this.watchers = new Map();
    this.syncClients = new Map();
    this.syncStats = new Map();
  }

  ensureStats(username) {
    if (!this.syncStats.has(username)) {
      this.syncStats.set(username, {
        lastSyncTime: null,
        syncedFiles: 0,
        errors: 0,
      });
    }
    return this.syncStats.get(username);
  }

  markSynced(username) {
    const stats = this.ensureStats(username);
    stats.lastSyncTime = Date.now();
    stats.syncedFiles += 1;
  }

  markError(username) {
    const stats = this.ensureStats(username);
    stats.errors += 1;
  }

  async startWatching(username, baseCwd) {
    if (this.watchers.has(username)) {
      return;
    }

    await fs.mkdir(baseCwd, { recursive: true });
    this.ensureStats(username);

    const watcher = chokidar.watch(baseCwd, {
      ignored: IGNORED_PATTERNS,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    watcher
      .on("add", (fullPath) => this.notifyClient(username, "FILE_ADD", fullPath, baseCwd))
      .on("change", (fullPath) => this.notifyClient(username, "FILE_CHANGE", fullPath, baseCwd))
      .on("unlink", (fullPath) => this.notifyClient(username, "FILE_DELETE", fullPath, baseCwd))
      .on("addDir", (fullPath) => this.notifyClient(username, "DIR_ADD", fullPath, baseCwd))
      .on("unlinkDir", (fullPath) => this.notifyClient(username, "DIR_DELETE", fullPath, baseCwd))
      .on("error", () => this.markError(username));

    this.watchers.set(username, watcher);
  }

  async stopWatching(username) {
    const watcher = this.watchers.get(username);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(username);
    }
    this.syncStats.delete(username);
  }

  registerClient(username, ws) {
    const previous = this.syncClients.get(username);
    if (previous && previous !== ws && previous.readyState === WebSocket.OPEN) {
      previous.close(4000, "Replaced by a newer sync client");
    }

    this.syncClients.set(username, ws);
    ws.on("close", () => {
      if (this.syncClients.get(username) === ws) {
        this.syncClients.delete(username);
      }
    });
  }

  isClientConnected(username) {
    const ws = this.syncClients.get(username);
    return Boolean(ws && ws.readyState === WebSocket.OPEN);
  }

  getSyncStatus(username) {
    const stats = this.syncStats.get(username) || {};
    return {
      enabled: this.watchers.has(username),
      clientConnected: this.isClientConnected(username),
      lastSyncTime: stats.lastSyncTime || null,
      syncedFiles: stats.syncedFiles || 0,
      errors: stats.errors || 0,
    };
  }

  notifyClient(username, event, fullPath, baseCwd) {
    const ws = this.syncClients.get(username);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const relativePath = path.relative(baseCwd, fullPath);
    if (!relativePath || relativePath.startsWith("..") || isIgnoredPath(relativePath)) {
      return;
    }

    ws.send(
      JSON.stringify({
        type: "SYNC_EVENT",
        event,
        path: relativePath,
        timestamp: Date.now(),
      }),
    );
  }

  async handleClientSync(username, message, baseCwd, resolvePath) {
    const { event, path: relativePath, content } = message;
    const fullPath = resolvePath(relativePath);

    switch (event) {
      case "FILE_UPLOAD": {
        const buffer = Buffer.from(content || "", "base64");
        if (buffer.length > MAX_FILE_SIZE) {
          throw new Error("File too large");
        }
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, buffer);
        this.markSynced(username);
        break;
      }
      case "FILE_DELETE":
        await fs.rm(fullPath, { force: true });
        this.markSynced(username);
        break;
      case "DIR_CREATE":
        await fs.mkdir(fullPath, { recursive: true });
        this.markSynced(username);
        break;
      case "DIR_DELETE":
        await fs.rm(fullPath, { recursive: true, force: true });
        this.markSynced(username);
        break;
      default:
        throw new Error("Unsupported sync action");
    }
  }
}

export const fileSyncManager = new FileSyncManager();
export { MAX_FILE_SIZE, isIgnoredPath };
