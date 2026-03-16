import { useState } from "react";
import ChatHistory from "./ChatHistory.jsx";
import QuickCommands from "./QuickCommands.jsx";

export default function Sidebar({
  apiBase,
  currentProject,
  token,
  onCommand,
  onOpenConversation,
  onNewSession,
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside style={{ ...sidebarStyle, width: collapsed ? 48 : 260, minWidth: collapsed ? 48 : 260 }}>
      {collapsed ? (
        <div style={collapsedInnerStyle}>
          <button className="icon-btn" style={toggleStyle} onClick={() => setCollapsed(false)} title="展开侧边栏">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
          </button>
          
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
             {/* Collapsed command icons could go here */}
          </div>
        </div>
      ) : (
        <div style={expandedInnerStyle}>
          <QuickCommands onCommand={onCommand} />

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "8px 0" }}></div>

          {currentProject ? (
            <div style={{ minHeight: 0, display: "flex", flexDirection: "column", flex: "0 1 auto", maxHeight: "40%", overflow: "hidden" }}>
              <ChatHistory
                apiBase={apiBase}
                cwd={currentProject}
                token={token}
                onSelect={onOpenConversation}
                onNewSession={onNewSession}
              />
            </div>
          ) : (
            <div style={{ color: "#52525b", fontSize: 12, padding: "8px" }}>
              选择项目后显示历史
            </div>
          )}

          <button className="btn" style={collapseButtonStyle} onClick={() => setCollapsed(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
            收起侧边栏
          </button>
        </div>
      )}
    </aside>
  );
}

const sidebarStyle = {
  transition: "width 0.2s ease, min-width 0.2s ease",
  display: "flex",
  flexDirection: "column",
  background: "#09090b",
  borderRight: "1px solid rgba(255,255,255,0.06)",
  position: "relative",
  overflow: "hidden",
};

const expandedInnerStyle = {
  width: 260,
  minWidth: 260,
  display: "flex",
  flexDirection: "column",
  height: "100%",
  padding: 16,
  boxSizing: "border-box",
  gap: 16,
};

const collapsedInnerStyle = {
  width: 48,
  minWidth: 48,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  paddingTop: 16,
};

const toggleStyle = {
  background: "transparent",
  color: "#a1a1aa",
  border: "none",
  cursor: "pointer",
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  borderRadius: 6,
};

const collapseButtonStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(255,255,255,0.06)",
  background: "rgba(255,255,255,0.03)",
  color: "#a1a1aa",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 13,
  marginTop: "auto",
};
