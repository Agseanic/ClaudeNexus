import { useEffect, useRef, useState } from "react";
import ProjectList from "./ProjectList.jsx";
import Sidebar from "./Sidebar.jsx";
import TerminalView from "./TerminalView.jsx";

function cwdToSessionId(username, cwd) {
  return `${username}-session-${(cwd || "default").replace(/\//g, "-")}`;
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function SyncStatusIndicator({ apiBase, token, enabled }) {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${apiBase}/api/user/sync/status`, {
          headers: authHeaders(token),
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (!cancelled) {
          setStatus(data);
        }
      } catch {
        if (!cancelled) {
          setStatus({ clientConnected: false, errors: 1 });
        }
      }
    };

    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiBase, enabled, token]);

  if (!enabled) {
    return null;
  }

  if (status?.errors) {
    return <span style={{ ...syncBadgeStyle, ...syncErrorStyle }}>同步异常</span>;
  }

  if (!status?.clientConnected) {
    return <span style={{ ...syncBadgeStyle, ...syncWaitingStyle }}>等待客户端连接</span>;
  }

  const suffix = status?.syncedFiles ? ` (${status.syncedFiles})` : "";
  return <span style={{ ...syncBadgeStyle, ...syncActiveStyle }}>同步中{suffix}</span>;
}

function UsageIndicator({ apiBase, token }) {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(`${apiBase}/api/usage`, {
          headers: authHeaders(token),
        });
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setUsage(data);
        }
      } catch {
        if (!cancelled) {
          setUsage(null);
        }
      }
    };

    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiBase, token]);

  if (!usage?.available) {
    return null;
  }

  const fiveHourPct = Math.round(usage.fiveHour?.utilization || 0);
  const sevenDayPct = Math.round(usage.sevenDay?.utilization || 0);

  const getColor = (pct) => {
    if (pct >= 80) return "#f87171";
    if (pct >= 50) return "#facc15";
    return "#4ade80";
  };

  const title = [
    `5h 重置: ${usage.fiveHour?.resetsAt ? new Date(usage.fiveHour.resetsAt).toLocaleString() : "-"}`,
    `7d 重置: ${usage.sevenDay?.resetsAt ? new Date(usage.sevenDay.resetsAt).toLocaleString() : "-"}`,
  ].join("\n");

  return (
    <span style={usageBadgeStyle} title={title}>
      <span style={{ color: getColor(fiveHourPct) }}>5h {fiveHourPct}%</span>
      <span style={{ color: "#52525b" }}> · </span>
      <span style={{ color: getColor(sevenDayPct) }}>7d {sevenDayPct}%</span>
    </span>
  );
}

function StatusBar({ apiBase, token, onOpenSettings, onLogout, projectName, currentUser }) {
  const [health, setHealth] = useState({ status: "checking" });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const healthResponse = await fetch(`${apiBase}/health`, {
          headers: authHeaders(token),
        });
        const healthData = await healthResponse.json();

        if (!cancelled) {
          setHealth({
            status: healthData.status || "ok",
          });
        }
      } catch {
        if (!cancelled) {
          setHealth({ status: "offline" });
        }
      }
    };

    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiBase, token]);

  return (
    <header style={statusBarStyle}>
      <div style={brandStyle}>
        <span>Claude Nexus</span>
      </div>
      <div style={metaStyle}>
        {currentUser?.username ? (
          <span style={userBadgeStyle}>
            {currentUser.username}
            {currentUser.role === "admin" ? " · admin" : ""}
          </span>
        ) : null}
        <SyncStatusIndicator
          apiBase={apiBase}
          token={token}
          enabled={Boolean(currentUser?.syncEnabled)}
        />
        <UsageIndicator apiBase={apiBase} token={token} />
        {projectName ? (
          <span style={{ color: "#e4e4e7", fontWeight: 500 }}>{projectName}</span>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            className={health.status === "ok" ? "status-dot-pulse" : ""}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: health.status === "ok" ? "#22c55e" : "#ef4444",
            }}
          ></div>
          <span style={{ color: health.status === "ok" ? "#22c55e" : "#ef4444" }}>
            {health.status === "ok" ? "已连接" : "离线"}
          </span>
        </div>
      </div>
      <div style={actionGroupStyle}>
        <button className="icon-btn" style={iconButtonStyle} onClick={onOpenSettings} title="设置">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
        <button className="icon-btn" style={iconButtonStyle} onClick={onLogout} title="登出">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
        </button>
      </div>
    </header>
  );
}

export default function Workspace({
  wsUrl,
  apiBase,
  config,
  token,
  currentUser,
  onLogout,
  onUserUpdate,
  onOpenSettings,
}) {
  const baseCwd = currentUser?.baseCwd || config.defaultCwd;
  const username = currentUser?.username || "anonymous";
  const termRefs = useRef({});
  const [currentProject, setCurrentProject] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!activeTabId) return;

    const timer = window.setTimeout(() => {
      termRefs.current[activeTabId]?.refit();
    }, 150);

    return () => window.clearTimeout(timer);
  }, [activeTabId]);

  const openProject = async (projectPath) => {
    setCurrentProject(projectPath);
    const projectName = projectPath.split("/").filter(Boolean).pop() || "Terminal";

    const existing = tabs.find((tab) => tab.cwd === projectPath);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    // 查询最新对话的 UUID，用 --resume <uuid> 打开，避免 __latest__ 匹配不上
    let continueId = "";
    try {
      const res = await fetch(
        `${apiBase}/api/conversations?cwd=${encodeURIComponent(projectPath)}`,
        { headers: authHeaders(token) },
      );
      if (res.ok) {
        const conversations = await res.json();
        if (Array.isArray(conversations) && conversations.length > 0) {
          continueId = conversations[0].conversationId || conversations[0].id.replace(/\.jsonl$/, "");
        }
      }
    } catch {
      // 查询失败就新建空会话
    }

    const sessionId = continueId
      ? `${cwdToSessionId(username, projectPath)}-${continueId}`
      : cwdToSessionId(username, projectPath);

    const tab = {
      id: `tab-${sessionId}`,
      label: projectName,
      cwd: projectPath,
      sessionId,
      continueId,
    };
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  };

  const openConversation = (conversationId, title) => {
    if (!currentProject) return;

    const existing = tabs.find(
      (tab) => tab.cwd === currentProject && tab.continueId === conversationId,
    );
    if (existing) {
      setActiveTabId(existing.id);
      window.setTimeout(() => {
        termRefs.current[existing.id]?.refit();
      }, 100);
      return;
    }

    const projectName = currentProject.split("/").filter(Boolean).pop() || "Terminal";
    const tab = {
      id: `tab-${currentProject}-${conversationId}`,
      label: title || projectName,
      cwd: currentProject,
      sessionId: `${cwdToSessionId(username, currentProject)}-${conversationId}`,
      continueId: conversationId,
    };
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  };

  const newSession = () => {
    const projectPath = currentProject || tabs.find((tab) => tab.id === activeTabId)?.cwd;
    if (!projectPath) {
      setActiveTabId(null);
      return;
    }

    const projectName = projectPath.split("/").filter(Boolean).pop() || "Terminal";
    const suffix = Date.now();
    const tab = {
      id: `tab-${suffix}`,
      label: `${projectName} (new)`,
      cwd: projectPath,
      sessionId: `${cwdToSessionId(username, projectPath)}-${suffix}`,
      continueId: "",
    };
    setTabs((current) => [...current, tab]);
    setCurrentProject(projectPath);
    setActiveTabId(tab.id);
  };

  const createProject = async () => {
    setShowNewProject(true);
    setNewProjectName("");
  };

  const confirmCreateProject = async () => {
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const response = await fetch(`${apiBase}/api/projects`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: JSON.stringify({ base: baseCwd, name: newProjectName.trim() }),
      });
      if (!response.ok) {
        const error = await response.json();
        window.alert(`创建失败：${error.error}`);
        return;
      }
      const data = await response.json();
      setShowNewProject(false);
      await openProject(data.path);
    } catch (error) {
      window.alert(`创建失败：${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  const closeTab = (tabId) => {
    if (tabs.length <= 1) return;

    const tab = tabs.find((item) => item.id === tabId);
    if (tab?.sessionId) {
      fetch(`${apiBase}/api/sessions/${encodeURIComponent(tab.sessionId)}`, {
        method: "DELETE",
        headers: authHeaders(token),
      }).catch(() => {});
    }

    setTabs((current) => {
      const next = current.filter((item) => item.id !== tabId);
      if (tabId === activeTabId) {
        const fallback = next[next.length - 1] || null;
        setActiveTabId(fallback?.id || null);
        setCurrentProject(fallback?.cwd || null);
      }
      return next;
    });
    delete termRefs.current[tabId];
  };

  return (
    <div style={rootStyle}>
      <StatusBar
        apiBase={apiBase}
        token={token}
        onOpenSettings={onOpenSettings}
        onLogout={onLogout}
        projectName={currentProject?.split("/").filter(Boolean).pop() || null}
        currentUser={currentUser}
      />
      <div style={bodyStyle}>
        <Sidebar
          apiBase={apiBase}
          currentProject={currentProject}
          token={token}
          onOpenConversation={openConversation}
        />
        <div style={mainStyle}>
          <div style={tabBarStyle}>
            <button
              className="icon-btn"
              style={projectsBtnStyle}
              onClick={() => setActiveTabId(null)}
              title="返回项目列表"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
            </button>
            <div className="tab-list-no-scrollbar" style={tabListStyle}>
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  style={{
                    ...tabItemStyle,
                    ...(tab.id === activeTabId ? activeTabItemStyle : {}),
                  }}
                  onClick={() => {
                    setActiveTabId(tab.id);
                    if (tab.cwd) {
                      setCurrentProject(tab.cwd);
                    }
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
                  <span style={tabLabelStyle}>{tab.label}</span>
                  {tabs.length > 1 ? (
                    <span
                      style={tabCloseStyle}
                      onClick={(event) => {
                        event.stopPropagation();
                        closeTab(tab.id);
                      }}
                      title="关闭"
                    >
                      ×
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            <button
              className="icon-btn"
              style={projectsBtnStyle}
              onClick={newSession}
              title="新建会话"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>

          {!activeTabId ? (
            <div style={emptyStateStyle}>
              <ProjectList
                apiBase={apiBase}
                baseCwd={baseCwd}
                currentProject={currentProject}
                token={token}
                onSelect={openProject}
                onCreateProject={createProject}
              />
            </div>
          ) : null}

          {tabs.map((tab) => (
            <div
              key={tab.id}
              style={{
                ...terminalWrapStyle,
                display: tab.id === activeTabId ? "block" : "none",
              }}
            >
              <TerminalView
                ref={(element) => {
                  if (element) {
                    termRefs.current[tab.id] = element;
                  } else {
                    delete termRefs.current[tab.id];
                  }
                }}
                wsUrl={wsUrl}
                sessionId={tab.sessionId}
                cwd={tab.cwd}
                token={token}
                continueId={tab.continueId}
              />
            </div>
          ))}
        </div>
      </div>
      {showNewProject ? (
        <div style={modalOverlayStyle} onClick={() => setShowNewProject(false)}>
          <div
            style={modalCardStyle}
            className="glass-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 style={modalTitleStyle}>新建项目</h3>
            <p style={modalSubtitleStyle}>将在 {baseCwd}/ 下创建文件夹</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                confirmCreateProject();
              }}
            >
              <input
                className="input-focus"
                style={modalInputStyle}
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                placeholder="输入项目名称"
                autoFocus
              />
              <div style={modalActionsStyle}>
                <button
                  type="button"
                  className="btn"
                  style={modalCancelBtnStyle}
                  onClick={() => setShowNewProject(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn"
                  style={modalConfirmBtnStyle}
                  disabled={!newProjectName.trim() || creating}
                >
                  {creating ? "创建中..." : "创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const rootStyle = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background: "#09090b",
  color: "#fafafa",
};

const statusBarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: 40,
  padding: "0 16px",
  background: "#0f0f12",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontSize: 13,
};

const brandStyle = {
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 200,
};

const metaStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 24,
  flex: 1,
  minWidth: 0,
};

const userBadgeStyle = {
  color: "#c4b5fd",
  fontSize: 12,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(99,102,241,0.12)",
  border: "1px solid rgba(99,102,241,0.24)",
};

const syncBadgeStyle = {
  fontSize: 12,
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.08)",
  whiteSpace: "nowrap",
};

const syncWaitingStyle = {
  color: "#facc15",
  background: "rgba(250,204,21,0.12)",
  borderColor: "rgba(250,204,21,0.2)",
};

const syncActiveStyle = {
  color: "#4ade80",
  background: "rgba(74,222,128,0.12)",
  borderColor: "rgba(74,222,128,0.2)",
};

const syncErrorStyle = {
  color: "#f87171",
  background: "rgba(248,113,113,0.12)",
  borderColor: "rgba(248,113,113,0.2)",
};

const usageBadgeStyle = {
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 999,
  background: "rgba(148,163,184,0.08)",
  border: "1px solid rgba(148,163,184,0.15)",
  whiteSpace: "nowrap",
  cursor: "default",
};

const actionGroupStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  minWidth: 200,
};

const iconButtonStyle = {
  background: "transparent",
  border: "none",
  color: "#a1a1aa",
  borderRadius: 6,
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const bodyStyle = {
  display: "flex",
  flex: 1,
  minHeight: 0,
};

const mainStyle = {
  display: "grid",
  gridTemplateRows: "36px minmax(0, 1fr)",
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
};

const terminalWrapStyle = {
  minHeight: 0,
  position: "relative",
  padding: 8,
};

const tabBarStyle = {
  display: "flex",
  alignItems: "center",
  height: 36,
  background: "#09090b",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  padding: "0 8px",
  gap: 8,
};

const tabListStyle = {
  display: "flex",
  alignItems: "flex-end",
  gap: 2,
  height: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  flex: 1,
  minWidth: 0,
  scrollbarWidth: "none",
};

const tabItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  fontSize: 12,
  color: "#a1a1aa",
  cursor: "pointer",
  borderTopLeftRadius: 6,
  borderTopRightRadius: 6,
  whiteSpace: "nowrap",
  position: "relative",
  bottom: -1,
  borderTop: "1px solid transparent",
  borderLeft: "1px solid transparent",
  borderRight: "1px solid transparent",
};

const activeTabItemStyle = {
  background: "#0f0f12",
  color: "#e4e4e7",
  borderTop: "1px solid rgba(255,255,255,0.06)",
  borderLeft: "1px solid rgba(255,255,255,0.06)",
  borderRight: "1px solid rgba(255,255,255,0.06)",
};

const tabLabelStyle = {
  maxWidth: 120,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const tabCloseStyle = {
  fontSize: 14,
  lineHeight: 1,
  color: "#52525b",
  cursor: "pointer",
  padding: "0 2px",
  borderRadius: 3,
};

const emptyStateStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background: "#0f0f12",
  margin: 8,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.06)",
  padding: 32,
};

const projectsBtnStyle = {
  background: "transparent",
  border: "none",
  color: "#a1a1aa",
  cursor: "pointer",
  width: 28,
  height: 28,
  display: "grid",
  placeItems: "center",
  borderRadius: 6,
  flexShrink: 0,
};

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(9, 9, 11, 0.7)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  display: "grid",
  placeItems: "center",
  zIndex: 50,
};

const modalCardStyle = {
  width: "min(400px, 90vw)",
  borderRadius: 16,
  padding: 24,
  background: "#18181b",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
};

const modalTitleStyle = {
  margin: "0 0 4px",
  fontSize: 16,
  fontWeight: 600,
  color: "#fafafa",
};

const modalSubtitleStyle = {
  margin: "0 0 16px",
  fontSize: 12,
  color: "#a1a1aa",
};

const modalInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "#fafafa",
  outline: "none",
  fontSize: 14,
  marginBottom: 16,
};

const modalActionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

const modalCancelBtnStyle = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#a1a1aa",
  borderRadius: 8,
  padding: "8px 16px",
  cursor: "pointer",
  fontSize: 13,
};

const modalConfirmBtnStyle = {
  background: "#6366f1",
  border: "1px solid #4f46e5",
  color: "#fff",
  borderRadius: 8,
  padding: "8px 16px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
};
