import { useMemo, useState } from "react";

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "radial-gradient(circle at top, rgba(99,102,241,0.15), transparent 40%), #09090b",
    padding: 24,
    color: "#fafafa",
  },
  card: {
    width: "min(460px, 100%)",
    borderRadius: 20,
    padding: 32,
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.4)",
    display: "flex",
    flexDirection: "column",
  },
  logoContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  logo: {
    width: 48,
    height: 48,
    background: "rgba(99,102,241,0.1)",
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    color: "#6366f1",
  },
  modeSwitch: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 8,
    marginBottom: 24,
    padding: 6,
    borderRadius: 14,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  modeButton: {
    border: "none",
    borderRadius: 10,
    background: "transparent",
    color: "#a1a1aa",
    padding: "10px 12px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  activeModeButton: {
    background: "#6366f1",
    color: "#fff",
  },
  title: {
    margin: "0 0 8px",
    fontSize: 24,
    fontWeight: 600,
    textAlign: "center",
    letterSpacing: "-0.01em",
  },
  subtitle: {
    margin: "0 0 28px",
    color: "#a1a1aa",
    fontSize: 14,
    lineHeight: 1.6,
    textAlign: "center",
  },
  field: {
    display: "grid",
    gap: 8,
    marginBottom: 18,
    position: "relative",
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: "#a1a1aa",
  },
  inputWrap: {
    display: "flex",
    alignItems: "center",
    position: "relative",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 40px 12px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#fafafa",
    outline: "none",
    fontSize: 14,
  },
  helper: {
    marginTop: 6,
    fontSize: 12,
    color: "#71717a",
    lineHeight: 1.5,
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    background: "none",
    border: "none",
    color: "#a1a1aa",
    cursor: "pointer",
    padding: 4,
    display: "grid",
    placeItems: "center",
  },
  button: {
    width: "100%",
    background: "#6366f1",
    border: "1px solid #4f46e5",
    color: "#fff",
    borderRadius: 12,
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: 14,
    marginTop: 8,
  },
  error: {
    marginTop: 16,
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    color: "#ef4444",
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13,
    minHeight: 20,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
};

export default function Login({ apiBase, needSetup, hasUsers, onSuccess }) {
  const [mode] = useState(needSetup ? "register" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [baseCwd, setBaseCwd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const effectiveMode = needSetup ? "register" : mode;
  const isRegister = effectiveMode === "register";
  const showBaseCwd = isRegister && !hasUsers;

  const subtitle = useMemo(() => {
    if (needSetup) {
      return "首次使用需要创建管理员账号。用户名用于区分工作空间，首个账号可自定义根目录。";
    }
    if (hasUsers) {
      return "请输入用户名和密码登录。已有用户时，新账号只能由管理员在设置面板中创建。";
    }
    return "输入用户名和密码，验证通过后进入属于你的 Claude Nexus 工作空间。";
  }, [hasUsers, needSetup]);

  const handleSubmit = async () => {
    if (!username.trim()) {
      setError("请输入用户名。");
      return;
    }

    if (password.length < 4) {
      setError("密码至少需要 4 个字符。");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const response = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          ...(showBaseCwd && baseCwd.trim() ? { baseCwd: baseCwd.trim() } : {}),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || (isRegister ? "注册失败" : "登录失败"));
      }

      onSuccess(data.token, data.user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card} className="glass-card">
        <div style={styles.logoContainer}>
          <div style={styles.logo}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0110 0v4"></path>
            </svg>
          </div>
        </div>

        <h1 style={styles.title}>
          {needSetup ? "创建管理员账号" : isRegister ? "注册新用户" : "工作台登录"}
        </h1>
        <p style={styles.subtitle}>{subtitle}</p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <div style={styles.field}>
            <label style={styles.label}>用户名</label>
            <div style={styles.inputWrap}>
              <input
                type="text"
                className="input-focus"
                style={{ ...styles.input, paddingRight: 14 }}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="例如 admin / alice"
                autoComplete="username"
              />
            </div>
            <div style={styles.helper}>仅支持字母、数字、下划线，长度 3-20。</div>
          </div>

          {showBaseCwd ? (
            <div style={styles.field}>
              <label style={styles.label}>管理员根目录（可选）</label>
              <div style={styles.inputWrap}>
                <input
                  type="text"
                  className="input-focus"
                  style={{ ...styles.input, paddingRight: 14 }}
                  value={baseCwd}
                  onChange={(event) => setBaseCwd(event.target.value)}
                  placeholder="留空则默认使用 Desktop/用户名"
                />
              </div>
            </div>
          ) : null}

          <div style={styles.field}>
            <label style={styles.label}>密码</label>
            <div style={styles.inputWrap}>
              <input
                type={showPassword ? "text" : "password"}
                className="input-focus"
                style={styles.input}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
              <button
                type="button"
                style={styles.eyeBtn}
                onClick={() => setShowPassword(!showPassword)}
                title="切换显示"
              >
                {showPassword ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {isRegister ? (
            <div style={styles.field}>
              <label style={styles.label}>确认密码</label>
              <div style={styles.inputWrap}>
                <input
                  type={showConfirm ? "text" : "password"}
                  className="input-focus"
                  style={styles.input}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="请再次输入密码"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  style={styles.eyeBtn}
                  onClick={() => setShowConfirm(!showConfirm)}
                  title="切换显示"
                >
                  {showConfirm ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
          ) : null}

          <button className="btn" type="submit" style={styles.button} disabled={submitting}>
            {submitting ? "提交中..." : isRegister ? "创建并进入" : "登录系统"}
          </button>
        </form>

        {error ? (
          <div style={styles.error}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
