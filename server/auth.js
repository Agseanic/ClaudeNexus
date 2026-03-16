import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const CONFIG_DIR = path.join(os.homedir(), ".claudehub");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const TOKEN_EXPIRES_IN = "24h";

async function ensureConfigDir() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeConfig(config) {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function createSecret() {
  return crypto.randomBytes(32).toString("hex");
}

export async function needSetup() {
  const config = await readConfig();
  return !config?.passwordHash;
}

export async function setup(password) {
  const existingConfig = await readConfig();
  if (existingConfig?.passwordHash) {
    throw new Error("Password already configured");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const config = {
    passwordHash,
    jwtSecret: existingConfig?.jwtSecret || createSecret(),
  };

  await writeConfig(config);
  return { ok: true };
}

export async function login(password) {
  const config = await readConfig();
  if (!config?.passwordHash || !config.jwtSecret) {
    throw new Error("Authentication is not configured");
  }

  const matches = await bcrypt.compare(password, config.passwordHash);
  if (!matches) {
    throw new Error("Invalid password");
  }

  const token = jwt.sign({ scope: "claudehub" }, config.jwtSecret, {
    expiresIn: TOKEN_EXPIRES_IN,
  });

  return { token };
}

export async function verify(token) {
  if (!token) {
    return { valid: false };
  }

  const config = await readConfig();
  if (!config?.jwtSecret) {
    return { valid: false };
  }

  try {
    jwt.verify(token, config.jwtSecret);
    return { valid: true };
  } catch {
    return { valid: false };
  }
}
