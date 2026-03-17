import { useEffect, useMemo, useState } from "react";

const PLATFORM_OPTIONS = [
  { key: "macos", label: "macOS", fileName: "claude-nexus-sync-macos" },
  { key: "win", label: "Windows", fileName: "claude-nexus-sync-win.exe" },
  { key: "linux", label: "Linux", fileName: "claude-nexus-sync-linux" },
];

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(9, 9, 11, 0.8)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "grid",
    placeItems: "center",
    padding: 24,
    zIndex: 10,
  },
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "radial-gradient(circle at top, rgba(99,102,241,0.15), transparent 40%), #09090b",
    padding: 24,
    color: "#fafafa",
  },
  card: {
    width: "min(560px, 100%)",
    borderRadius: 20,
    padding: 32,
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.4)",
    display: "flex",
    flexDirection: "column",
    maxHeight: "min(90vh, 920px)",
    overflowY: "auto",
  },
  logoContainer: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: "-0.01em",
  },
  subtitle: {
    margin: "0 0 24px",
    color: "#a1a1aa",
    fontSize: 14,
    lineHeight: 1.6,
  },
  field: {
    display: "grid",
    gap: 8,
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "#a1a1aa",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#fafafa",
    outline: "none",
    fontSize: 14,
  },
  section: {
    marginTop: 12,
    padding: 18,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
  },
  sectionTitle: {
    margin: "0 0 8px",
    fontSize: 16,
    fontWeight: 600,
  },
  sectionBody: {
    margin: 0,
    color: "#a1a1aa",
    fontSize: 13,
    lineHeight: 1.6,
  },
  row: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 12,
  },
  button: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.05)",
    color: "#fafafa",
    borderRadius: 12,
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: 14,
    flex: 1,
    textAlign: "center",
  },
  primary: {
    background: "#6366f1",
    borderColor: "#4f46e5",
    color: "#ffffff",
  },
  danger: {
    background: "rgba(239,68,68,0.1)",
    borderColor: "rgba(239,68,68,0.2)",
    color: "#ef4444",
  },
  subtleButton: {
    flex: "unset",
    minWidth: 120,
  },
  status: {
    marginTop: 16,
    color: "#a1a1aa",
    fontSize: 13,
    minHeight: 20,
    textAlign: "center",
  },
  footer: {
    marginTop: 24,
    textAlign: "center",
    fontSize: 12,
    color: "#52525b",
  },
  helperText: {
    fontSize: 12,
    color: "#71717a",
    lineHeight: 1.5,
  },
  syncHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 12,
  },
  toggle: {
    position: "relative",
    width: 52,
    height: 30,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.08)",
    cursor: "pointer",
    padding: 0,
  },
  toggleActive: {
    background: "#22c55e",
    borderColor: "#16a34a",
  },
  toggleThumb: {
    position: "absolute",
    top: 3,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "#fff",
    transition: "transform 0.2s ease",
  },
  syncStatusBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    background: "rgba(15,23,42,0.4)",
    border: "1px solid rgba(148,163,184,0.16)",
    fontSize: 13,
    color: "#cbd5e1",
  },
  orderedList: {
    margin: "12px 0 0",
    paddingLeft: 18,
    color: "#d4d4d8",
    fontSize: 13,
    lineHeight: 1.7,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)",
  },
};

function detectPlatform() {
  if (typeof navigator === "undefined") {
    return "macos";
  }

  const platform = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (platform.includes("win")) {
    return "win";
  }
  if (platform.includes("linux")) {
    return "linux";
  }
  return "macos";
}

async function copyText(value) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export default function ServerSetup({
  config,
  onSave,
  onCancel,
  isModal = false,
  currentUser = null,
  onUserUpdate,
}) {
  const [draft, setDraft] = useState(config);
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [recommendedPlatform] = useState(detectPlatform);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const apiBase = useMemo(() => {
    if (!draft.host.trim()) {
      return "";
    }
    return `http://${draft.host.trim()}:${draft.port.trim() || "8091"}`;
  }, [draft.host, draft.port]);

  const syncCommand = useMemo(() => {
    const platform = PLATFORM_OPTIONS.find((item) => item.key === recommendedPlatform) || PLATFORM_OPTIONS[0];
    return `./${platform.fileName} -s ${apiBase} -t <TOKEN> -l ~/ClaudeSync`;
  }, [apiBase, recommendedPlatform]);

  useEffect(() => {
    if (!isModal || !currentUser?.syncEnabled || !apiBase) {
      setSyncStatus(null);
      return;
    }

    const token = window.localStorage.getItem("claudehub_v2_token") || "";
    if (!token) {
      return;
    }

    let cancelled = false;
    const loadStatus = async () => {
      try {
        const response = await fetch(`${apiBase}/api/user/sync/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (!cancelled) {
          setSyncStatus(data);
        }
      } catch {
        if (!cancelled) {
          setSyncStatus(null);
        }
      }
    };

    loadStatus();
    const timer = window.setInterval(loadStatus, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiBase, currentUser?.syncEnabled, isModal]);

  const handleTestConnection = async () => {
    if (!apiBase) {
      setStatus("请先填写服务器地址。");
      return;
    }

    setTesting(true);
    setStatus("正在测试连接...");
    try {
      const response = await fetch(`${apiBase}/health`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setStatus(`连接成功，当前会话数 ${data.sessions}。`);
    } catch (error) {
      setStatus(`连接失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setTesting(false);
    }
  };

  const handleCreateUser = async () => {
    if (!currentUser || currentUser.role !== "admin") {
      setStatus("只有管理员可以创建新用户。");
      return;
    }

    if (!newUsername.trim() || newPassword.length < 4) {
      setStatus("请填写用户名，并确保密码至少 4 位。");
      return;
    }

    const token = window.localStorage.getItem("claudehub_v2_token") || "";
    if (!token) {
      setStatus("缺少管理员令牌，请重新登录后再试。");
      return;
    }

    setCreatingUser(true);
    setStatus("正在创建用户...");
    try {
      const response = await fetch(`${apiBase}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "创建用户失败");
      }

      setNewUsername("");
      setNewPassword("");
      setStatus(`用户 ${data.user?.username || newUsername.trim()} 创建成功。`);
    } catch (error) {
      setStatus(`创建失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setCreatingUser(false);
    }
  };

  const handleToggleSync = async () => {
    if (!currentUser) {
      return;
    }

    const token = window.localStorage.getItem("claudehub_v2_token") || "";
    if (!token) {
      setStatus("缺少登录令牌，请重新登录后再试。");
      return;
    }

    setSyncBusy(true);
    setStatus(currentUser.syncEnabled ? "正在关闭文件同步..." : "正在开启文件同步...");
    try {
      const response = await fetch(`${apiBase}/api/user/sync`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: !currentUser.syncEnabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "更新同步状态失败");
      }

      onUserUpdate?.(data.user || { ...currentUser, syncEnabled: data.syncEnabled });
      setSyncStatus(data.status || null);
      setStatus(data.syncEnabled ? "文件同步已开启。" : "文件同步已关闭。");
    } catch (error) {
      setStatus(`更新失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setSyncBusy(false);
    }
  };

  const handleCopyServer = async () => {
    try {
      await copyText(apiBase);
      setStatus("服务器地址已复制。");
    } catch {
      setStatus("复制服务器地址失败。");
    }
  };

  const handleCopyToken = async () => {
    try {
      const token = window.localStorage.getItem("claudehub_v2_token") || "";
      await copyText(token);
      setStatus("Token 已复制。");
    } catch {
      setStatus("复制 Token 失败。");
    }
  };

  const handleCopyCommand = async () => {
    try {
      await copyText(syncCommand);
      setStatus("启动命令模板已复制。");
    } catch {
      setStatus("复制命令失败。");
    }
  };

  const handleDownloadClient = async (platform) => {
    const token = window.localStorage.getItem("claudehub_v2_token") || "";
    if (!token) {
      setStatus("缺少登录令牌，请重新登录后再试。");
      return;
    }

    setStatus(`正在准备 ${platform} 客户端下载...`);
    try {
      const response = await fetch(
        `${apiBase}/api/sync-client/download?platform=${encodeURIComponent(platform)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "下载失败");
      }

      const blob = await response.blob();
      const option = PLATFORM_OPTIONS.find((item) => item.key === platform);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = option?.fileName || "claude-nexus-sync";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setStatus(`${option?.label || platform} 客户端已开始下载。`);
    } catch (error) {
      setStatus(`下载失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  const content = (
    <div style={styles.card} className="glass-card">
      <div style={styles.logoContainer}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 17L10 11L4 5" />
          <path d="M12 19L20 19" />
        </svg>
        <h1 style={styles.title}>Claude Nexus</h1>
      </div>
      <p style={styles.subtitle}>
        配置远程 Claude Code 服务地址，保存后进入工作台。同步功能开启后，可以下载本地客户端做双向文件同步。
      </p>

      <div style={styles.field}>
        <label style={styles.label}>服务器地址</label>
        <input
          className="input-focus"
          style={styles.input}
          value={draft.host}
          onChange={(event) => setDraft((current) => ({ ...current, host: event.target.value }))}
          placeholder="例如 192.168.1.12"
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label}>端口</label>
        <input
          className="input-focus"
          style={styles.input}
          value={draft.port}
          onChange={(event) => setDraft((current) => ({ ...current, port: event.target.value }))}
          placeholder="8091"
        />
      </div>

      {isModal && currentUser?.baseCwd ? (
        <div style={styles.field}>
          <label style={styles.label}>基础工作路径</label>
          <div
            style={{
              ...styles.input,
              background: "rgba(255,255,255,0.02)",
              color: "#a1a1aa",
              cursor: "default",
            }}
          >
            {currentUser.baseCwd}
          </div>
        </div>
      ) : null}

      <div style={styles.row}>
        <button className="btn" style={{ ...styles.button, ...styles.primary }} onClick={() => onSave(draft)}>
          保存配置
        </button>
        <button className="btn" style={styles.button} onClick={handleTestConnection} disabled={testing}>
          {testing ? "测试中..." : "测试连接"}
        </button>
        {isModal ? (
          <button className="btn" style={{ ...styles.button, ...styles.danger }} onClick={onCancel}>
            关闭
          </button>
        ) : null}
      </div>

      {isModal && currentUser ? (
        <section style={styles.section}>
          <div style={styles.syncHeader}>
            <div>
              <h2 style={styles.sectionTitle}>文件同步</h2>
              <p style={styles.sectionBody}>
                {currentUser.syncEnabled
                  ? "同步已开启。下载客户端后即可将本地目录与服务器工作区保持双向同步。"
                  : "默认关闭。开启后才会出现同步客户端下载与状态指示。"}
              </p>
            </div>
            <button
              type="button"
              style={{
                ...styles.toggle,
                ...(currentUser.syncEnabled ? styles.toggleActive : null),
                opacity: syncBusy ? 0.7 : 1,
              }}
              onClick={handleToggleSync}
              disabled={syncBusy}
              title={currentUser.syncEnabled ? "关闭同步" : "开启同步"}
            >
              <span
                style={{
                  ...styles.toggleThumb,
                  transform: currentUser.syncEnabled ? "translateX(21px)" : "translateX(0)",
                }}
              />
            </button>
          </div>

          {currentUser.syncEnabled ? (
            <>
              <div style={styles.syncStatusBox}>
                <div>
                  状态:
                  {" "}
                  {syncStatus?.clientConnected ? "客户端已连接" : "等待客户端连接"}
                </div>
                <div>已同步文件: {syncStatus?.syncedFiles || 0}</div>
                <div>
                  最近同步:
                  {" "}
                  {syncStatus?.lastSyncTime
                    ? new Date(syncStatus.lastSyncTime).toLocaleString()
                    : "暂无记录"}
                </div>
              </div>

              <section style={styles.section}>
                <h3 style={styles.sectionTitle}>下载同步客户端</h3>
                <p style={styles.sectionBody}>系统已自动识别推荐平台，未构建的平台会在下载时提示。</p>
                <div style={styles.row}>
                  {PLATFORM_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      className="btn"
                      style={{
                        ...styles.button,
                        ...(option.key === recommendedPlatform ? styles.primary : null),
                        ...styles.subtleButton,
                      }}
                      onClick={() => handleDownloadClient(option.key)}
                    >
                      下载客户端 ({option.label})
                    </button>
                  ))}
                </div>
              </section>

              <section style={styles.section}>
                <h3 style={styles.sectionTitle}>使用方法</h3>
                <ol style={styles.orderedList}>
                  <li>下载对应平台的同步客户端，得到单个可执行文件。</li>
                  <li>macOS / Linux 首次运行前执行 `chmod +x 文件名`。</li>
                  <li>双击运行，或在终端执行客户端文件。</li>
                  <li>按提示输入服务器地址、Token 和本地同步目录。</li>
                  <li>配置完成后，远程工作区会与本地目录自动双向同步。</li>
                </ol>
              </section>

              <section style={styles.section}>
                <h3 style={styles.sectionTitle}>快捷操作</h3>
                <div style={styles.row}>
                  <button className="btn" style={{ ...styles.button, ...styles.subtleButton }} onClick={handleCopyServer}>
                    复制服务器地址
                  </button>
                  <button className="btn" style={{ ...styles.button, ...styles.subtleButton }} onClick={handleCopyToken}>
                    复制令牌 Token
                  </button>
                  <button className="btn" style={{ ...styles.button, ...styles.subtleButton }} onClick={handleCopyCommand}>
                    复制启动命令
                  </button>
                </div>
                <div style={{ ...styles.helperText, marginTop: 12 }}>
                  命令模板: <span style={styles.badge}>{syncCommand}</span>
                </div>
              </section>
            </>
          ) : null}
        </section>
      ) : null}

      {isModal && currentUser?.role === "admin" ? (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>创建用户</h2>
          <p style={styles.sectionBody}>已有用户环境下，只有管理员可以从这里创建新账号。</p>
          <div style={{ marginTop: 14 }}>
            <div style={styles.field}>
              <label style={styles.label}>新用户名</label>
              <input
                className="input-focus"
                style={styles.input}
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                placeholder="例如 alice"
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>新用户密码</label>
              <input
                className="input-focus"
                style={styles.input}
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="至少 4 位"
              />
            </div>
            <div style={styles.row}>
              <button
                className="btn"
                style={styles.button}
                onClick={handleCreateUser}
                disabled={creatingUser}
              >
                {creatingUser ? "创建中..." : "创建用户"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div style={styles.status}>
        {status}
        {!isModal && !status ? <div style={styles.footer}>Powered by Claude Code</div> : null}
      </div>
    </div>
  );

  if (isModal) {
    return <div style={styles.overlay}>{content}</div>;
  }

  return <div style={styles.page}>{content}</div>;
}
