# 修复：终端页面滚动跳转问题

## 问题描述

在 Web 终端中使用 Claude Code 时，当 Claude 回复内容（服务端通过 WebSocket 推送终端输出），整个页面会跳转到顶部或中间位置，而不是保持在终端当前的滚动位置。

发送消息（按回车）时偶尔也会跳转。

## 问题根因

xterm.js 在接收大量输出时，其内部创建的隐藏 `<textarea>`（用于捕获键盘输入）会触发浏览器的原生 `scrollIntoView` 行为。浏览器为了确保当前聚焦的元素可见，会自动滚动页面，导致整个页面跳转。

这不是 CSS overflow 能解决的问题，而是浏览器对焦点元素的原生行为。

## 当前已有的修复（保留）

以下修改是正确的，应该保留：
- `src/styles.css`：`html, body { height: 100%; overflow: hidden; }` 和 `#root { height: 100%; overflow: hidden; }`
- `src/components/Workspace.jsx`：`rootStyle` 使用 `height: "100vh"` + `overflow: "hidden"`
- `src/components/Workspace.jsx`：`bodyStyle` 和 `terminalWrapStyle` 都有 `overflow: "hidden"`
- `src/components/TerminalView.jsx`：`terminalStyle` 有 `overscrollBehavior: "contain"`
- `src/components/TerminalView.jsx`：`doFit()` 中的尺寸比对逻辑（只在容器尺寸变化时才 fit）

## 需要新增的修复

**文件**：`src/components/TerminalView.jsx`

### 方案：拦截 xterm 内部 textarea 的 focus 滚动行为

xterm.js 在 `term.open(container)` 之后，会在容器内创建一个 `.xterm-helper-textarea` 元素。需要拦截这个元素的 `focus` 事件，阻止浏览器的默认滚动行为。

```javascript
// 在 term.open(containerRef.current) 之后，添加以下代码：

// 拦截 xterm 内部 textarea 的 focus 事件，阻止浏览器自动滚动到焦点元素
const xtermTextarea = containerRef.current.querySelector('.xterm-helper-textarea');
if (xtermTextarea) {
  // 覆盖 focus 方法，始终使用 preventScroll
  const originalFocus = xtermTextarea.focus.bind(xtermTextarea);
  xtermTextarea.focus = (options) => {
    originalFocus({ preventScroll: true, ...options });
  };

  // 监听 focus 事件，立即重置页面滚动位置
  xtermTextarea.addEventListener('focus', () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}

// 同时拦截容器上的 scroll 事件冒泡
containerRef.current.addEventListener('scroll', (e) => {
  e.stopPropagation();
}, true);

// 拦截所有父元素的 scrollTop 变化
const scrollGuard = () => {
  requestAnimationFrame(() => {
    if (document.documentElement.scrollTop !== 0) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body.scrollTop !== 0) {
      document.body.scrollTop = 0;
    }
  });
};
```

### 方案 B（如果方案 A 不够）：MutationObserver 监听 DOM 变化后重置滚动

```javascript
// xterm 写入内容会修改 DOM，用 MutationObserver 在每次 DOM 变化后重置滚动
const scrollObserver = new MutationObserver(() => {
  if (document.documentElement.scrollTop !== 0) {
    document.documentElement.scrollTop = 0;
  }
  if (document.body.scrollTop !== 0) {
    document.body.scrollTop = 0;
  }
});

scrollObserver.observe(containerRef.current, {
  childList: true,
  subtree: true,
  characterData: true,
});

// 在 cleanup 中断开
// scrollObserver.disconnect();
```

### 方案 C（兜底）：CSS 层面彻底禁止页面滚动

在 `index.html` 中直接加内联样式，优先级最高：

```html
<html style="position:fixed;width:100%;height:100%;overflow:hidden">
<body style="position:fixed;width:100%;height:100%;overflow:hidden;margin:0">
```

或者在 `src/styles.css` 中改为：

```css
html, body {
  margin: 0;
  position: fixed;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background-color: #09090b;
  color: #fafafa;
}
```

`position: fixed` 会彻底阻止元素参与页面滚动，比 `overflow: hidden` 更强力。

### 需要同时移除的代码

移除 TerminalView.jsx 中现有的 `preventPageScroll` 监听器（window scroll 事件），替换为上述更精准的方案：

```javascript
// 删除这段代码：
const preventPageScroll = () => {
  if (document.documentElement.scrollTop !== 0) {
    document.documentElement.scrollTop = 0;
  }
  if (document.body.scrollTop !== 0) {
    document.body.scrollTop = 0;
  }
};
window.addEventListener("scroll", preventPageScroll, { passive: false });
```

## 建议实现顺序

1. 先尝试方案 C（CSS `position: fixed`），这是最简单且最可靠的
2. 再加上方案 A（拦截 textarea focus），处理 xterm 内部的 focus 滚动
3. 如果仍有问题，加上方案 B（MutationObserver）作为兜底

## 改动文件

| 文件 | 说明 |
|------|------|
| `src/styles.css` | html/body 改为 `position: fixed` |
| `src/components/TerminalView.jsx` | 拦截 xterm textarea focus + 移除旧的 scroll 监听 |
| `index.html`（可选） | 内联 style 兜底 |

## 验证方法

1. 打开项目终端，输入一条消息按回车 — 页面不应跳转
2. 等待 Claude 回复（大量终端输出）— 页面不应跳转
3. 终端输出超过一屏后继续输出 — 页面不应跳转
4. 调整浏览器窗口大小 — 终端正常自适应，页面不跳转
5. 切换标签页再切回 — 终端正常显示
