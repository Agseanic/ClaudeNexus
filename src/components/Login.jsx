import { useState } from "react";

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
  title: {
    margin: "0 0 8px",
    fontSize: 24,
    fontWeight: 600,
    textAlign: "center",
    letterSpacing: "-0.01em",
  },
  subtitle: {
    margin: "0 0 32px",
    color: "#a1a1aa",
    fontSize: 14,
    lineHeight: 1.6,
    textAlign: "center",
  },
  field: {
    display: "grid",
    gap: 8,
    marginBottom: 20,
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

export default function Login({ apiBase, needSetup, onSuccess }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (needSetup && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (needSetup) {
        const setupResponse = await fetch(`${apiBase}/api/auth/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!setupResponse.ok) {
          throw new Error("初始化密码失败");
        }
      }

      const loginResponse = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!loginResponse.ok) {
        throw new Error("密码错误或服务不可用");
      }

      const data = await loginResponse.json();
      onSuccess(data.token);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

        <h1 style={styles.title}>{needSetup ? "设置访问密码" : "工作台登录"}</h1>
        <p style={styles.subtitle}>
          {needSetup
            ? "首次使用需要设置密码，之后通过密码获取访问令牌。"
            : "输入已设置的访问密码，验证完成后即可进入你的 Claude Nexus。"}
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
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

          {needSetup ? (
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
            {submitting ? "提交中..." : needSetup ? "保存并进入" : "登录系统"}
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
