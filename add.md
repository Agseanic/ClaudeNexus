# 状态栏显示 Claude Code 实时用量

## 需求

在 Web 界面顶部状态栏显示当前 Claude Code 的实时用量百分比（5小时窗口 / 7天窗口），数据通过 Anthropic OAuth API 获取。

## 数据来源

### API 端点

```
GET https://api.anthropic.com/api/oauth/usage
```

### 认证

使用 `~/.claude/.credentials.json` 中的 OAuth accessToken：

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1773738763081,
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_5x"
  }
}
```

### 请求示例

```javascript
const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'anthropic-beta': 'oauth-2025-04-20',
    'User-Agent': 'claude-code/2.1',
  },
});
```

### 返回数据格式

```json
{
  "five_hour": {
    "utilization": 0.35,
    "resets_at": "2026-03-16T15:00:00Z"
  },
  "seven_day": {
    "utilization": 0.12,
    "resets_at": "2026-03-20T00:00:00Z"
  }
}
```

- `utilization`：用量百分比，0~1 之间的浮点数（0.35 表示用了 35%）
- `resets_at`：该窗口的重置时间

### 注意事项

- 仅适用于 Pro/Max/Team 订阅用户（OAuth 认证）
- 如果用户使用 API Key（付费模式），不显示用量
- accessToken 有过期时间（`expiresAt`），过期后需要处理（可以先不管刷新，显示"Token 已过期"即可）
- 建议 5 分钟缓存成功结果，15 秒缓存失败结果，避免频繁调用

## 实现方案

### 1. 后端：新增用量 API

**文件**：`server/ws-handler.js`

```javascript
// GET /api/usage
// 需要登录认证（requireApiUser）
//
// 实现逻辑：
// 1. 读取 path.join(os.homedir(), '.claude', '.credentials.json')
// 2. 解析 claudeAiOauth.accessToken
// 3. 检查 expiresAt 是否过期，过期则返回 { error: 'Token expired', expired: true }
// 4. 调用 https://api.anthropic.com/api/oauth/usage
//    请求头:
//      Authorization: Bearer {accessToken}
//      anthropic-beta: oauth-2025-04-20
//      User-Agent: claude-code/2.1
// 5. 返回结果给前端
//
// 缓存策略（内存缓存，避免频繁调用 Anthropic API）：
// - 成功响应缓存 5 分钟
// - 失败响应缓存 15 秒
//
// 返回格式:
// {
//   fiveHour: { utilization: 0.35, resetsAt: "2026-03-16T15:00:00Z" },
//   sevenDay: { utilization: 0.12, resetsAt: "2026-03-20T00:00:00Z" },
//   subscriptionType: "max"
// }
//
// 错误情况:
// - credentials.json 不存在 → { error: 'No credentials', available: false }
// - Token 过期 → { error: 'Token expired', available: false }
// - API 调用失败 → { error: '...', available: false }

// 缓存实现示例:
let usageCache = { data: null, expiresAt: 0 };
const CACHE_SUCCESS_MS = 5 * 60 * 1000;  // 5 分钟
const CACHE_FAILURE_MS = 15 * 1000;       // 15 秒

async function fetchUsage() {
  const now = Date.now();
  if (usageCache.data && now < usageCache.expiresAt) {
    return usageCache.data;
  }

  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const cred = JSON.parse(await fs.readFile(credPath, 'utf8'));
    const oauth = cred.claudeAiOauth;

    if (!oauth?.accessToken) {
      const result = { available: false, error: 'No credentials' };
      usageCache = { data: result, expiresAt: now + CACHE_FAILURE_MS };
      return result;
    }

    if (oauth.expiresAt && oauth.expiresAt < now) {
      const result = { available: false, error: 'Token expired' };
      usageCache = { data: result, expiresAt: now + CACHE_FAILURE_MS };
      return result;
    }

    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        'Authorization': `Bearer ${oauth.accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'claude-code/2.1',
      },
    });

    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }

    const data = await response.json();
    const result = {
      available: true,
      fiveHour: {
        utilization: Math.min(1, Math.max(0, data.five_hour?.utilization || 0)),
        resetsAt: data.five_hour?.resets_at || null,
      },
      sevenDay: {
        utilization: Math.min(1, Math.max(0, data.seven_day?.utilization || 0)),
        resetsAt: data.seven_day?.resets_at || null,
      },
      subscriptionType: oauth.subscriptionType || 'unknown',
    };

    usageCache = { data: result, expiresAt: now + CACHE_SUCCESS_MS };
    return result;
  } catch (error) {
    const result = { available: false, error: error.message || 'Failed' };
    usageCache = { data: result, expiresAt: now + CACHE_FAILURE_MS };
    return result;
  }
}
```

### 2. 前端：状态栏增加用量显示

**文件**：`src/components/Workspace.jsx`（StatusBar 组件内）

新增 `UsageIndicator` 组件，显示在状态栏中间区域：

```jsx
function UsageIndicator({ apiBase, token }) {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${apiBase}/api/usage`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (response.ok) {
          const data = await response.json();
          if (!cancelled) setUsage(data);
        }
      } catch {}
    };

    load();
    // 前端每 60 秒轮询一次（后端有 5 分钟缓存，所以不会每次都打 Anthropic API）
    const timer = window.setInterval(load, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [apiBase, token]);

  if (!usage || !usage.available) return null;

  const fiveHourPct = Math.round(usage.fiveHour.utilization * 100);
  const sevenDayPct = Math.round(usage.sevenDay.utilization * 100);

  // 根据用量百分比选择颜色
  const getColor = (pct) => {
    if (pct >= 80) return '#f87171';  // 红色
    if (pct >= 50) return '#facc15';  // 黄色
    return '#4ade80';                  // 绿色
  };

  return (
    <span
      style={usageBadgeStyle}
      title={`5h 重置: ${usage.fiveHour.resetsAt ? new Date(usage.fiveHour.resetsAt).toLocaleString() : '-'}\n7d 重置: ${usage.sevenDay.resetsAt ? new Date(usage.sevenDay.resetsAt).toLocaleString() : '-'}`}
    >
      <span style={{ color: getColor(fiveHourPct) }}>5h {fiveHourPct}%</span>
      <span style={{ color: '#52525b' }}> · </span>
      <span style={{ color: getColor(sevenDayPct) }}>7d {sevenDayPct}%</span>
    </span>
  );
}

// 样式
const usageBadgeStyle = {
  fontSize: 12,
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(148,163,184,0.08)',
  border: '1px solid rgba(148,163,184,0.15)',
  whiteSpace: 'nowrap',
  cursor: 'default',
};
```

### 3. 在 StatusBar 中集成

在 StatusBar 组件的 `metaStyle` div 内，放在连接状态旁边：

```jsx
<div style={metaStyle}>
  {/* 用户名 badge */}
  {currentUser?.username ? (...) : null}
  {/* 同步状态 */}
  <SyncStatusIndicator ... />
  {/* 用量指示器 — 新增 */}
  <UsageIndicator apiBase={apiBase} token={token} />
  {/* 项目名 */}
  {projectName ? (...) : null}
  {/* 连接状态 */}
  <div style={...}>...</div>
</div>
```

### 4. 显示效果

状态栏中间区域：

```
[admin · admin]  [↕ 同步中]  [5h 35% · 7d 12%]  [ProjectName]  [● 已连接]
```

颜色规则：
- 用量 < 50%：绿色
- 用量 50%-80%：黄色
- 用量 >= 80%：红色

鼠标悬停 tooltip 显示重置时间。

## 改动文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/ws-handler.js` | 修改 | 新增 `GET /api/usage` 端点，含 5 分钟内存缓存 |
| `src/components/Workspace.jsx` | 修改 | StatusBar 内新增 UsageIndicator 组件 |
