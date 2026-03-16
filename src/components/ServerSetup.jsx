import { useMemo, useState } from "react";

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
    width: "min(440px, 100%)",
    borderRadius: 20,
    padding: 32,
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.4)",
    display: "flex",
    flexDirection: "column",
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
    margin: "0 0 32px",
    color: "#a1a1aa",
    fontSize: 14,
    lineHeight: 1.6,
  },
  field: {
    display: "grid",
    gap: 8,
    marginBottom: 20,
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
};

export default function ServerSetup({ config, onSave, onCancel, isModal = false }) {
  const [draft, setDraft] = useState(config);
  const [status, setStatus] = useState("");
  const [testing, setTesting] = useState(false);

  const apiBase = useMemo(() => {
    if (!draft.host.trim()) {
      return "";
    }
    return `http://${draft.host.trim()}:${draft.port.trim() || "8091"}`;
  }, [draft.host, draft.port]);

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
        配置远程 Claude Code 服务地址，保存后会进入完整终端工作台。
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

      {isModal ? (
        <div style={styles.field}>
          <label style={styles.label}>基础工作路径</label>
          <input
            className="input-focus"
            style={styles.input}
            value={draft.defaultCwd}
            onChange={(event) =>
              setDraft((current) => ({ ...current, defaultCwd: event.target.value }))
            }
            placeholder="/Volumes/xm"
          />
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
            取消
          </button>
        ) : null}
      </div>

      <div style={styles.status}>
        {status}
        {!isModal && !status && <div style={styles.footer}>Powered by Claude Code</div>}
      </div>
    </div>
  );

  if (isModal) {
    return <div style={styles.overlay}>{content}</div>;
  }

  return <div style={styles.page}>{content}</div>;
}
