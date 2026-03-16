import { useCallback, useEffect, useState } from "react";

function truncateTitle(value, maxLength = 40) {
  if (!value) return "未命名会话";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function formatRelativeTime(value) {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.round(hours / 24);
  return `${days}天前`;
}

export default function ChatHistory({ apiBase, cwd, token, onSelect, onNewSession }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    if (!apiBase || !cwd) {
      setItems([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const url = `${apiBase}/api/conversations?cwd=${encodeURIComponent(cwd)}`;
      console.log("[ChatHistory] fetching:", url);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("[ChatHistory] response status:", response.status);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      console.log("[ChatHistory] data:", data);
      setItems(Array.isArray(data) ? data : []);
    } catch (errorValue) {
      console.error("[ChatHistory] error:", errorValue);
      setError(errorValue instanceof Error ? errorValue.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [apiBase, cwd, token]);

  useEffect(() => {
    loadData();
    const timer = window.setInterval(() => {
      if (!apiBase || !cwd) return;
      fetch(`${apiBase}/api/conversations?cwd=${encodeURIComponent(cwd)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => (response.ok ? response.json() : []))
        .then((data) => setItems(Array.isArray(data) ? data : []))
        .catch(() => {});
    }, 10000);
    return () => window.clearInterval(timer);
  }, [loadData, apiBase, cwd, token]);

  return (
    <section style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={headerStyle}>
        <span style={sectionHeader}>HISTORY</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="icon-btn" style={iconBtnStyle} onClick={loadData} title="刷新">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path></svg>
          </button>
          {onNewSession ? (
            <button className="icon-btn" style={iconBtnStyle} onClick={onNewSession} title="新建会话">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          ) : null}
        </div>
      </div>
      <div style={listStyle}>
        {loading && <div style={emptyStyle}>加载中...</div>}
        {!loading && error && <div style={emptyStyle}>加载失败：{error}</div>}
        {!loading && !error && items.length === 0 && <div style={emptyStyle}>暂无对话记录</div>}
        {!loading &&
          !error &&
          items.map((item) => (
            <button
              key={item.id}
              className="history-item"
              style={itemStyle}
              onClick={() =>
                onSelect &&
                onSelect(item.conversationId || item.id.replace(/\.jsonl$/, ""), item.title)
              }
            >
              <div style={titleStyle}>{truncateTitle(item.title)}</div>
              <div style={metaStyle}>{formatRelativeTime(item.updatedAt)}</div>
            </button>
          ))}
      </div>
    </section>
  );
}

const sectionHeader = {
  fontSize: 11,
  fontWeight: 600,
  color: "#a1a1aa",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  paddingLeft: 8,
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

const iconBtnStyle = {
  background: "transparent",
  border: "none",
  color: "#a1a1aa",
  borderRadius: 4,
  padding: 4,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
};

const listStyle = {
  display: "grid",
  gap: 2,
  overflowY: "auto",
  flex: 1,
};

const itemStyle = {
  textAlign: "left",
  background: "transparent",
  border: "none",
  color: "#fafafa",
  borderRadius: 6,
  padding: "8px 12px",
  cursor: "pointer",
  position: "relative",
};

const titleStyle = {
  fontSize: 13,
  marginBottom: 4,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontWeight: 500,
};

const metaStyle = {
  fontSize: 11,
  color: "#a1a1aa",
};

const emptyStyle = {
  color: "#a1a1aa",
  fontSize: 12,
  padding: "12px 8px",
};
