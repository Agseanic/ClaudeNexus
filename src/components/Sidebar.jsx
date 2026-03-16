import { useState } from "react";
import ChatHistory from "./ChatHistory.jsx";

export default function Sidebar({
  apiBase,
  currentProject,
  token,
  onOpenConversation,
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside style={{ ...sidebarStyle, width: collapsed ? 48 : 260, minWidth: collapsed ? 48 : 260 }}>
      {collapsed ? (
        <div style={collapsedInnerStyle}>
          <button className="icon-btn" style={toggleStyle} onClick={() => setCollapsed(false)} title="展开侧边栏">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
          </button>
        </div>
      ) : (
        <div style={expandedInnerStyle}>
          <div style={headerActionsStyle}>
            <button className="icon-btn" style={toggleStyle} onClick={() => setCollapsed(true)} title="收起侧边栏">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
            </button>
          </div>

          {currentProject ? (
            <ChatHistory
              apiBase={apiBase}
              cwd={currentProject}
              token={token}
              onSelect={onOpenConversation}
            />
          ) : (
            <div style={placeholderStyle}>选择项目后显示历史</div>
          )}
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
  gap: 12,
  overflow: "hidden",
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

const headerActionsStyle = {
  display: "flex",
  justifyContent: "flex-end",
};

const placeholderStyle = {
  color: "#52525b",
  fontSize: 12,
  padding: "8px",
};
