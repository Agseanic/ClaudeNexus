const chokidar = require("chokidar");
const WebSocket = require("ws");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function hashBuffer(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

class SyncEngine {
  constructor({ serverUrl, token, localDir }) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
    this.token = token;
    this.localDir = path.resolve(localDir);
    this.ignoreNextChange = new Set();
    this.ws = null;
    this.watcher = null;
    this.reconnectTimer = null;
  }

  async start() {
    await fsp.mkdir(this.localDir, { recursive: true });
    console.log("正在执行初始同步...");
    await this.initialSync();
    this.connectWebSocket();
    this.startLocalWatcher();
    console.log(`✓ 同步已启动: ${this.localDir} ↔ ${this.serverUrl}`);
    console.log("按 Ctrl+C 停止同步");
  }

  async initialSync() {
    const response = await fetch(`${this.serverUrl}/api/files/sync/init`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) {
      throw new Error(`初始化失败: HTTP ${response.status}`);
    }

    const { files: remoteFiles } = await response.json();
    const localFiles = await this.scanLocalFiles();
    const remoteMap = new Map(remoteFiles.map((item) => [item.path, item]));
    const localMap = new Map(localFiles.map((item) => [item.path, item]));

    let downloaded = 0;
    let uploaded = 0;

    for (const [remotePath, remoteFile] of remoteMap) {
      const localFile = localMap.get(remotePath);
      if (!localFile || (localFile.hash !== remoteFile.hash && remoteFile.mtime > (localFile.mtime || 0))) {
        await this.downloadFile(remotePath);
        downloaded += 1;
      }
    }

    for (const [localPath, localFile] of localMap) {
      const remoteFile = remoteMap.get(localPath);
      if (!remoteFile || (remoteFile.hash !== localFile.hash && localFile.mtime > (remoteFile.mtime || 0))) {
        await this.uploadFile(localPath);
        uploaded += 1;
      }
    }

    console.log(`初始同步完成: 下载 ${downloaded} 个文件，上传 ${uploaded} 个文件`);
  }

  connectWebSocket() {
    const wsUrl = this.serverUrl.replace(/^http/, "ws") + `/sync?token=${encodeURIComponent(this.token)}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.on("open", () => {
      console.log("✓ 远程同步通道已连接");
    });

    this.ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type !== "SYNC_EVENT") {
          return;
        }

        this.ignoreNextChange.add(message.path);
        if (message.event === "FILE_ADD" || message.event === "FILE_CHANGE") {
          await this.downloadFile(message.path);
          console.log(`↓ ${message.path}`);
        } else if (message.event === "FILE_DELETE") {
          await fsp.rm(path.join(this.localDir, message.path), { force: true });
          console.log(`✕ ${message.path}`);
        } else if (message.event === "DIR_ADD") {
          await fsp.mkdir(path.join(this.localDir, message.path), { recursive: true });
        } else if (message.event === "DIR_DELETE") {
          await fsp.rm(path.join(this.localDir, message.path), { recursive: true, force: true });
        }
      } catch (error) {
        console.error("同步消息处理失败:", error.message);
      }
    });

    this.ws.on("close", () => {
      console.log("远程连接断开，3 秒后重连...");
      this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 3000);
    });

    this.ws.on("error", (error) => {
      console.error("WebSocket 错误:", error.message);
    });
  }

  startLocalWatcher() {
    this.watcher = chokidar.watch(this.localDir, {
      ignored: [/(^|[/\\])\./, /node_modules/, /\.git/],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });

    this.watcher
      .on("add", (fullPath) => this.onLocalChange("FILE_UPLOAD", fullPath))
      .on("change", (fullPath) => this.onLocalChange("FILE_UPLOAD", fullPath))
      .on("unlink", (fullPath) => this.onLocalChange("FILE_DELETE", fullPath))
      .on("addDir", (fullPath) => this.onLocalChange("DIR_CREATE", fullPath))
      .on("unlinkDir", (fullPath) => this.onLocalChange("DIR_DELETE", fullPath));
  }

  async onLocalChange(event, fullPath) {
    const relativePath = path.relative(this.localDir, fullPath);
    if (this.ignoreNextChange.has(relativePath)) {
      this.ignoreNextChange.delete(relativePath);
      return;
    }

    try {
      if (event === "FILE_UPLOAD") {
        await this.uploadFile(relativePath);
        console.log(`↑ ${relativePath}`);
        return;
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "SYNC_ACTION", event, path: relativePath }));
        console.log(`↑ [${event}] ${relativePath}`);
      }
    } catch (error) {
      console.error(`本地变更同步失败 (${relativePath}):`, error.message);
    }
  }

  async uploadFile(relativePath) {
    const localPath = path.join(this.localDir, relativePath);
    const content = await fsp.readFile(localPath);
    const response = await fetch(`${this.serverUrl}/api/files/write`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: relativePath,
        content: content.toString("base64"),
      }),
    });

    if (!response.ok) {
      throw new Error(`上传失败: HTTP ${response.status}`);
    }
  }

  async downloadFile(relativePath) {
    const response = await fetch(
      `${this.serverUrl}/api/files/read?path=${encodeURIComponent(relativePath)}`,
      { headers: { Authorization: `Bearer ${this.token}` } },
    );
    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status}`);
    }

    const { content } = await response.json();
    const localPath = path.join(this.localDir, relativePath);
    await fsp.mkdir(path.dirname(localPath), { recursive: true });
    await fsp.writeFile(localPath, Buffer.from(content, "base64"));
  }

  async scanLocalFiles() {
    const files = [];

    const walk = async (dir) => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const stat = await fsp.stat(fullPath);
        const content = await fsp.readFile(fullPath);
        files.push({
          path: path.relative(this.localDir, fullPath),
          hash: hashBuffer(content),
          mtime: stat.mtimeMs,
          size: stat.size,
        });
      }
    };

    await walk(this.localDir);
    return files;
  }

  async stop() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.watcher) {
      await this.watcher.close();
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

module.exports = SyncEngine;
