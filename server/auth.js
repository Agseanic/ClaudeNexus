import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const CONFIG_DIR = path.join(os.homedir(), ".claudehub");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const USERS_PATH = path.join(CONFIG_DIR, "users.json");
const TOKEN_EXPIRES_IN = "24h";
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
const DEFAULT_USER_ROOT = path.join(os.homedir(), "Desktop");
const DEFAULT_ADMIN_BASE_CWD = process.env.ADMIN_BASE_CWD || "/Volumes/xm";

async function ensureConfigDir() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, data) {
  await ensureConfigDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function readConfig() {
  return readJsonFile(CONFIG_PATH, null);
}

async function writeConfig(config) {
  await writeJsonFile(CONFIG_PATH, config);
}

async function readUsers() {
  const data = await readJsonFile(USERS_PATH, { users: [] });
  return Array.isArray(data?.users) ? data : { users: [] };
}

async function writeUsers(data) {
  await writeJsonFile(USERS_PATH, data);
}

function createSecret() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeBaseCwd(baseCwd) {
  return path.resolve(baseCwd);
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    username: user.username,
    role: user.role,
    baseCwd: user.baseCwd,
    syncEnabled: Boolean(user.syncEnabled),
    createdAt: user.createdAt || null,
  };
}

function createAuthPayload(user) {
  return {
    purpose: "auth",
    username: user.username,
    role: user.role,
    baseCwd: user.baseCwd,
    syncEnabled: Boolean(user.syncEnabled),
  };
}

async function getJwtSecret() {
  const config = await readConfig();
  if (config?.jwtSecret) {
    return config.jwtSecret;
  }

  const nextConfig = {
    ...(config || {}),
    jwtSecret: createSecret(),
  };
  await writeConfig(nextConfig);
  return nextConfig.jwtSecret;
}

function getPreferredAdminBaseCwd() {
  return normalizeBaseCwd(DEFAULT_ADMIN_BASE_CWD);
}

async function migrateLegacyAuthIfNeeded() {
  const config = await readConfig();
  if (!config) {
    return;
  }

  const usersData = await readUsers();
  let nextConfig = { ...config };
  let configChanged = false;
  let usersChanged = false;

  if (usersData.users.length === 0 && config.passwordHash) {
    const adminBaseCwd = getPreferredAdminBaseCwd();

    const adminUser = {
      username: "admin",
      passwordHash: config.passwordHash,
      baseCwd: adminBaseCwd,
      role: "admin",
      syncEnabled: false,
      createdAt: new Date().toISOString(),
    };

    await fs.mkdir(adminBaseCwd, { recursive: true });
    usersData.users = [adminUser];
    usersChanged = true;
  }

  const adminUser = usersData.users.find((entry) => entry.username === "admin");
  if (
    adminUser &&
    adminUser.baseCwd === normalizeBaseCwd(DEFAULT_USER_ROOT)
  ) {
    adminUser.baseCwd = getPreferredAdminBaseCwd();
    usersChanged = true;
  }

  if (Object.prototype.hasOwnProperty.call(nextConfig, "passwordHash")) {
    delete nextConfig.passwordHash;
    configChanged = true;
  }

  if (!nextConfig.jwtSecret) {
    nextConfig.jwtSecret = createSecret();
    configChanged = true;
  }

  if (usersChanged) {
    await writeUsers(usersData);
  }

  if (configChanged) {
    await writeConfig(nextConfig);
  }

  if (!config.passwordHash && !configChanged) {
    return;
  }
}

function validateUsername(username) {
  if (!USERNAME_PATTERN.test(username || "")) {
    throw new Error("Username must be 3-20 characters using letters, numbers, or underscores");
  }
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 4) {
    throw new Error("Password must be at least 4 characters");
  }
}

export async function getAuthStatus(token) {
  await migrateLegacyAuthIfNeeded();

  const usersData = await readUsers();
  const verification = await verify(token);
  return {
    needSetup: usersData.users.length === 0,
    hasUsers: usersData.users.length > 0,
    authenticated: verification.valid,
    user: verification.user,
  };
}

export async function needSetup() {
  const status = await getAuthStatus("");
  return status.needSetup;
}

export async function setup(password) {
  return register("admin", password, { role: "admin" });
}

export async function register(username, password, options = {}) {
  await migrateLegacyAuthIfNeeded();
  validateUsername(username);
  validatePassword(password);

  const usersData = await readUsers();
  if (usersData.users.some((user) => user.username === username)) {
    throw new Error("Username already exists");
  }

  const isFirstUser = usersData.users.length === 0;
  const role = isFirstUser ? "admin" : "user";
  const requestedBase = typeof options.baseCwd === "string" ? options.baseCwd.trim() : "";
  const baseCwd = normalizeBaseCwd(
    role === "admin" && requestedBase ? requestedBase : path.join(DEFAULT_USER_ROOT, username),
  );

  await fs.mkdir(baseCwd, { recursive: true });

  const user = {
    username,
    passwordHash: await bcrypt.hash(password, 10),
    baseCwd,
    role,
    syncEnabled: false,
    createdAt: new Date().toISOString(),
  };

  usersData.users.push(user);
  await writeUsers(usersData);

  const jwtSecret = await getJwtSecret();
  const token = jwt.sign(createAuthPayload(user), jwtSecret, { expiresIn: TOKEN_EXPIRES_IN });
  return { token, user: sanitizeUser(user) };
}

export async function login(username, password) {
  await migrateLegacyAuthIfNeeded();
  validateUsername(username);
  validatePassword(password);

  const config = await readConfig();
  if (!config?.jwtSecret) {
    throw new Error("Authentication is not configured");
  }

  const usersData = await readUsers();
  const user = usersData.users.find((entry) => entry.username === username);
  if (!user) {
    throw new Error("Invalid credentials");
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign(createAuthPayload(user), config.jwtSecret, {
    expiresIn: TOKEN_EXPIRES_IN,
  });

  return { token, user: sanitizeUser(user) };
}

export async function verify(token) {
  if (!token) {
    return { valid: false, user: null };
  }

  const config = await readConfig();
  if (!config?.jwtSecret) {
    return { valid: false, user: null };
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload?.purpose !== "auth" || !payload.username) {
      return { valid: false, user: null };
    }

    const usersData = await readUsers();
    const user = usersData.users.find((entry) => entry.username === payload.username);
    if (!user) {
      return { valid: false, user: null };
    }

    return { valid: true, user: sanitizeUser(user) };
  } catch {
    return { valid: false, user: null };
  }
}

export async function updateSyncEnabled(username, enabled) {
  await migrateLegacyAuthIfNeeded();
  const usersData = await readUsers();
  const user = usersData.users.find((entry) => entry.username === username);
  if (!user) {
    throw new Error("User not found");
  }

  user.syncEnabled = Boolean(enabled);
  await writeUsers(usersData);
  return sanitizeUser(user);
}
