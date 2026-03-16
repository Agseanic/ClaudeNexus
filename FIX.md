# Bug 修复方案 v10

## 根因

`pty-manager.js` 第 42-44 行使用 `claude --continue <uuid>` 恢复指定对话，但 Claude Code CLI 的 `--continue` 不接受会话 ID 参数。UUID 被当成了 positional argument（初始用户提示），直接发给了 Claude 作为第一条消息。

Claude Code CLI 正确用法：
- `claude --continue` 或 `claude -c` — 恢复最近对话（不带参数）
- `claude --resume <uuid>` 或 `claude -r <uuid>` — 恢复指定对话

## 修复

**文件：`server/pty-manager.js`**

修改第 38-45 行：

```javascript
const command = process.env.CLAUDE_PATH || `${process.env.HOME}/.local/bin/claude`;
let args = [];
if (continueId === "__latest__") {
  // claude --continue（不带 ID）= 恢复最近一次对话
  args = ["--continue"];
} else if (continueId) {
  // claude --resume <uuid> = 恢复指定对话
  args = ["--resume", continueId];
}
```

只改一个词：`"--continue"` → `"--resume"`。

## 修改清单

| 文件 | 修改 |
|------|------|
| `server/pty-manager.js` | 第 43 行 `"--continue"` 改为 `"--resume"` |
