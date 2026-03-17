import { useCallback, useEffect, useState } from "react";

export default function ProjectList({
  apiBase,
  baseCwd,
  currentProject,
  token,
  onSelect,
  onCreateProject,
}) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!apiBase || !baseCwd) {
      setProjects([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `${apiBase}/api/projects?base=${encodeURIComponent(baseCwd)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setProjects(Array.isArray(data) ? data : []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, baseCwd, token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>选择项目</h2>
        <p style={subtitleStyle}>选择一个项目文件夹开始 Claude 会话</p>
      </div>

      {loading ? <div style={loadingStyle}>加载中...</div> : null}

      {!loading ? (
        <div style={gridStyle}>
          {projects.map((project) => (
            <button
              key={project.path}
              className="btn"
              style={{
                ...cardStyle,
                ...(currentProject === project.path ? cardActiveStyle : {}),
              }}
              onClick={() => {
                Promise.resolve(onSelect(project.path)).catch((error) => {
                  console.error("[ProjectList] 打开项目失败", error);
                });
              }}
              title={project.path}
            >
              <span style={cardIconStyle}>📁</span>
              <span style={cardNameStyle}>{project.name}</span>
            </button>
          ))}

          <button className="btn" style={newCardStyle} onClick={onCreateProject}>
            <span style={{ fontSize: 24, color: "#6366f1" }}>+</span>
            <span style={cardNameStyle}>新建项目</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

const containerStyle = {
  width: "100%",
  maxWidth: 640,
};

const headerStyle = {
  textAlign: "center",
  marginBottom: 24,
};

const titleStyle = {
  fontSize: 20,
  fontWeight: 600,
  color: "#fafafa",
  margin: "0 0 8px",
};

const subtitleStyle = {
  fontSize: 13,
  color: "#a1a1aa",
  margin: 0,
};

const loadingStyle = {
  textAlign: "center",
  color: "#a1a1aa",
  fontSize: 13,
  padding: 24,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
  gap: 12,
};

const cardStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 8,
  padding: "20px 12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#fafafa",
  borderRadius: 12,
  cursor: "pointer",
  textAlign: "center",
};

const cardActiveStyle = {
  borderColor: "#6366f1",
  background: "rgba(99,102,241,0.1)",
};

const cardIconStyle = {
  fontSize: 28,
};

const cardNameStyle = {
  fontSize: 13,
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  width: "100%",
};

const newCardStyle = {
  ...cardStyle,
  borderStyle: "dashed",
  borderColor: "rgba(255,255,255,0.12)",
  background: "transparent",
};
