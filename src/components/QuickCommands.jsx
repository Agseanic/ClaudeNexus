import { useState } from "react";

const STORAGE_KEY = "claudehub_visible_commands";

const COMMANDS = [
  { id: "/init\r", icon: "🚀", label: "初始化", cmd: "/init\r", desc: "让 Claude 了解项目" },
  { id: "/compact\r", icon: "📦", label: "压缩上下文", cmd: "/compact\r", desc: "释放 token 窗口" },
  { id: "/status\r", icon: "📊", label: "查看状态", cmd: "/status\r", desc: "对话状态与用量" },
  { id: "/cost\r", icon: "💰", label: "查看开销", cmd: "/cost\r", desc: "API 用量统计" },
  { id: "/clear\r", icon: "🧹", label: "清屏", cmd: "/clear\r", desc: "清空终端输出" },
  { id: "/review-pr\r", icon: "🔍", label: "审查 PR", cmd: "/review-pr\r", desc: "Review Pull Request" },
  { id: "/commit\r", icon: "✅", label: "提交代码", cmd: "/commit\r", desc: "生成 commit message" },
  { id: "/bug\r", icon: "🐛", label: "Bug 修复模式", cmd: "/bug\r", desc: "进入 bug 修复流程" },
  { id: "/doc\r", icon: "📖", label: "生成文档", cmd: "/doc\r", desc: "生成或更新文档" },
  { id: "/test\r", icon: "🧪", label: "生成测试", cmd: "/test\r", desc: "为代码生成测试" },
  { id: "/scaffold\r", icon: "🏗️", label: "脚手架", cmd: "/scaffold\r", desc: "生成项目脚手架" },
  { id: "/help\r", icon: "❓", label: "帮助", cmd: "/help\r", desc: "查看所有可用命令" },
  { id: "/config\r", icon: "🔧", label: "配置", cmd: "/config\r", desc: "查看与修改配置" },
  { id: "/undo\r", icon: "↩️", label: "撤销", cmd: "/undo\r", desc: "撤销上次文件修改" },
  { id: "/copy\r", icon: "📋", label: "复制上次回复", cmd: "/copy\r", desc: "复制最后一条回复" },
  { id: "/retry\r", icon: "🔄", label: "重试", cmd: "/retry\r", desc: "重新生成上次回复" },
  { id: "git status\r", icon: "📂", label: "Git 状态", cmd: "git status\r", desc: "查看工作区状态" },
  { id: "git log --oneline -10\r", icon: "📝", label: "Git 日志", cmd: "git log --oneline -10\r", desc: "最近 10 条提交" },
  { id: "git diff\r", icon: "🔀", label: "Git Diff", cmd: "git diff\r", desc: "查看未暂存更改" },
  { id: "npm test\r", icon: "🧪", label: "运行测试", cmd: "npm test\r", desc: "执行测试套件" },
  { id: "npm install\r", icon: "📦", label: "安装依赖", cmd: "npm install\r", desc: "安装项目依赖" },
  { id: "npm run dev\r", icon: "▶️", label: "启动开发", cmd: "npm run dev\r", desc: "启动开发服务器" },
  { id: "npm run build\r", icon: "🏗️", label: "构建项目", cmd: "npm run build\r", desc: "生产环境构建" },
];

function loadVisibleCommands() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // ignore malformed local storage
  }
  return null;
}

function saveVisibleCommands(visibleSet) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleSet));
}

export default function QuickCommands({ onCommand }) {
  const [editing, setEditing] = useState(false);
  const [visibleCmds, setVisibleCmds] = useState(() => loadVisibleCommands());

  const isVisible = (cmd) => visibleCmds === null || visibleCmds.includes(cmd);

  const toggleCmd = (cmd) => {
    let next;
    if (visibleCmds === null) {
      next = COMMANDS.map((item) => item.cmd).filter((itemCmd) => itemCmd !== cmd);
    } else if (visibleCmds.includes(cmd)) {
      next = visibleCmds.filter((itemCmd) => itemCmd !== cmd);
    } else {
      next = [...visibleCmds, cmd];
    }
    setVisibleCmds(next);
    saveVisibleCommands(next);
  };

  const resetAll = () => {
    setVisibleCmds(null);
    window.localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <section>
      <div style={sectionHeader}>
        <span>COMMANDS</span>
        <button
          className="icon-btn"
          style={editBtnStyle}
          onClick={() => setEditing((current) => !current)}
          title={editing ? "完成" : "自定义命令"}
        >
          {editing ? "✓ 完成" : "✏️"}
        </button>
      </div>
      {editing ? (
        <button className="icon-btn" style={resetBtnStyle} onClick={resetAll}>
          全部显示
        </button>
      ) : null}
      <div style={listStyle}>
        {COMMANDS.map((item) => {
          const visible = isVisible(item.cmd);
          if (!editing && !visible) {
            return null;
          }

          return (
            <button
              key={item.id}
              className="cmd-item"
              style={{
                ...commandStyle,
                ...(editing && !visible ? { opacity: 0.4 } : {}),
              }}
              onClick={() => {
                if (editing) {
                  toggleCmd(item.cmd);
                  return;
                }
                onCommand(item.cmd);
              }}
              title={item.desc}
            >
              {editing ? <span style={checkboxStyle}>{visible ? "☑" : "☐"}</span> : null}
              <span style={iconStyle}>{item.icon}</span>
              <span style={contentStyle}>
                <span style={labelStyle}>{item.label}</span>
                <span style={descStyle}>{item.desc}</span>
              </span>
            </button>
          );
        })}
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
  marginBottom: 8,
  paddingLeft: 8,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const listStyle = {
  display: "grid",
  gap: 6,
  overflowY: "auto",
  maxHeight: "25vh",
  paddingRight: 4,
};

const commandStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  background: "transparent",
  border: "none",
  color: "#fafafa",
  borderRadius: 6,
  padding: "8px 8px",
  cursor: "pointer",
  width: "100%",
  textAlign: "left",
};

const iconStyle = {
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  lineHeight: 1.4,
};

const contentStyle = {
  display: "grid",
  gap: 2,
  flex: 1,
};

const labelStyle = {
  fontSize: 13,
};

const descStyle = {
  fontSize: 11,
  color: "#a1a1aa",
};

const editBtnStyle = {
  background: "transparent",
  border: "none",
  color: "#a1a1aa",
  cursor: "pointer",
  fontSize: 12,
  padding: "2px 6px",
  borderRadius: 4,
};

const resetBtnStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#a1a1aa",
  cursor: "pointer",
  fontSize: 11,
  padding: "4px 8px",
  borderRadius: 4,
  marginBottom: 8,
  width: "100%",
};

const checkboxStyle = {
  fontSize: 14,
  width: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};
