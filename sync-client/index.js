#!/usr/bin/env node

const readline = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const SyncEngine = require("./sync-engine");

const RUNTIME_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_FILE = path.join(RUNTIME_DIR, ".sync-config.json");

function createRL() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function loadSavedConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    }
  } catch {
    return null;
  }
  return null;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

async function interactiveSetup() {
  const rl = createRL();
  const saved = loadSavedConfig();

  console.log("");
  console.log("  Claude Nexus 文件同步客户端");
  console.log("");

  if (saved) {
    console.log(`  检测到上次的配置: ${saved.server} -> ${saved.localDir}`);
    const reuse = await ask(rl, "  是否复用？(Y/n): ");
    if (reuse.trim().toLowerCase() !== "n") {
      const token = await ask(rl, "  请粘贴 Token: ");
      rl.close();
      return { ...saved, token: token.trim() };
    }
  }

  const homeDir = os.homedir();
  const defaultLocal = saved?.localDir || path.join(homeDir, "ClaudeSync");
  const defaultServer = saved?.server || "";

  const server = (await ask(rl, `  服务器地址${defaultServer ? ` [${defaultServer}]` : ""}: `)).trim() || defaultServer;
  const token = (await ask(rl, "  请粘贴 Token: ")).trim();
  const localDir = (await ask(rl, `  本地目录 [${defaultLocal}]: `)).trim() || defaultLocal;

  rl.close();

  if (!server || !token || !localDir) {
    throw new Error("服务器地址、Token、本地目录都不能为空");
  }

  saveConfig({ server, localDir });
  return { server, token, localDir };
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return null;
  }

  const config = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === "-s" || current === "--server") {
      config.server = args[index + 1];
      index += 1;
    } else if (current === "-t" || current === "--token") {
      config.token = args[index + 1];
      index += 1;
    } else if (current === "-l" || current === "--local") {
      config.localDir = args[index + 1];
      index += 1;
    }
  }

  if (!config.server || !config.token || !config.localDir) {
    console.log("用法: node index.js -s <服务器地址> -t <Token> -l <本地目录>");
    process.exit(1);
  }

  return config;
}

async function main() {
  const config = parseArgs() || await interactiveSetup();
  const engine = new SyncEngine({
    serverUrl: config.server,
    token: config.token,
    localDir: config.localDir,
  });

  await engine.start();

  process.on("SIGINT", async () => {
    console.log("\n  正在停止同步...");
    await engine.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("  启动失败:", error.message);
  process.exit(1);
});
