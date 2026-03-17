import { useEffect, useState } from "react";
import { useServerConfig } from "../hooks/useServerConfig.js";
import Login from "./Login.jsx";
import ServerSetup from "./ServerSetup.jsx";
import Workspace from "./Workspace.jsx";

const TOKEN_KEY = "claudehub_v2_token";

export default function App() {
  const { config, isConfigured, wsUrl, apiBase, saveConfig } = useServerConfig();
  const [showSettings, setShowSettings] = useState(false);
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) || "");
  const [currentUser, setCurrentUser] = useState(null);
  const [authState, setAuthState] = useState({
    loading: true,
    authenticated: false,
    needSetup: false,
    hasUsers: false,
  });

  useEffect(() => {
    if (!isConfigured) {
      setAuthState({
        loading: false,
        authenticated: false,
        needSetup: false,
        hasUsers: false,
      });
      return;
    }

    let cancelled = false;

    const loadAuthStatus = async () => {
      setAuthState((current) => ({ ...current, loading: true }));
      try {
        const response = await fetch(`${apiBase}/api/auth/status`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await response.json();
        if (!cancelled) {
          const authenticated = Boolean(data.authenticated && token && data.user);
          if (!authenticated && token) {
            window.localStorage.removeItem(TOKEN_KEY);
            setToken("");
            setCurrentUser(null);
          }
          setAuthState({
            loading: false,
            authenticated,
            needSetup: Boolean(data.needSetup),
            hasUsers: Boolean(data.hasUsers),
          });
          setCurrentUser(authenticated ? data.user : null);
        }
      } catch {
        if (!cancelled) {
          setAuthState({
            loading: false,
            authenticated: false,
            needSetup: false,
            hasUsers: false,
          });
          setCurrentUser(null);
        }
      }
    };

    loadAuthStatus();

    return () => {
      cancelled = true;
    };
  }, [apiBase, isConfigured, token]);

  if (!isConfigured) {
    return <ServerSetup config={config} onSave={saveConfig} />;
  }

  const handleLoginSuccess = (nextToken, user) => {
    window.localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setCurrentUser(user || null);
  };

  const handleLogout = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setCurrentUser(null);
  };

  const handleUserUpdate = (nextUser) => {
    setCurrentUser(nextUser || null);
  };

  if (authState.loading) {
    return (
      <div style={loadingStyle}>
        <div style={loadingCardStyle}>
          <div style={loadingTitleStyle}>正在验证访问权限...</div>
          <div style={loadingSubtleStyle}>Claude Nexus 正在检查本地令牌和服务端认证状态。</div>
        </div>
      </div>
    );
  }

  if (!authState.authenticated) {
    return (
      <Login
        apiBase={apiBase}
        needSetup={authState.needSetup}
        hasUsers={authState.hasUsers}
        onSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <>
      <Workspace
        wsUrl={wsUrl}
        apiBase={apiBase}
        config={config}
        token={token}
        currentUser={currentUser}
        onLogout={handleLogout}
        onUserUpdate={handleUserUpdate}
        onOpenSettings={() => setShowSettings(true)}
      />
      {showSettings ? (
        <ServerSetup
          config={config}
          isModal
          currentUser={currentUser}
          onUserUpdate={handleUserUpdate}
          onCancel={() => setShowSettings(false)}
          onSave={(patch) => {
            saveConfig(patch);
            setShowSettings(false);
          }}
        />
      ) : null}
    </>
  );
}

const loadingStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background: "#09090b",
  color: "#fafafa",
  fontFamily: "'Inter', sans-serif",
};

const loadingCardStyle = {
  width: 300,
  padding: "24px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "#111114",
};

const loadingTitleStyle = {
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 10,
};

const loadingSubtleStyle = {
  fontSize: 13,
  color: "#a1a1aa",
  lineHeight: 1.6,
};
