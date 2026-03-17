import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";

const baseTheme = {
  background: "#0f0f12",
  foreground: "#e4e4e7",
  cursor: "#6366f1",
  cursorAccent: "#09090b",
  selectionBackground: "rgba(99,102,241,0.3)",
  black: "#09090b",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#3b82f6",
  magenta: "#a855f7",
  cyan: "#06b6d4",
  white: "#e4e4e7",
  brightBlack: "#52525b",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#60a5fa",
  brightMagenta: "#c084fc",
  brightCyan: "#22d3ee",
  brightWhite: "#fafafa",
};

const TerminalView = forwardRef(function TerminalView(
  { wsUrl, sessionId, cwd, token, continueId = "" },
  ref,
) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const connectedRef = useRef(false);

  useImperativeHandle(ref, () => ({
    sendInput(text) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(text);
      }
      termRef.current?.focus();
    },
    refit() {
      if (fitAddonRef.current && termRef.current) {
        fitAddonRef.current.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "RESIZE",
              cols: termRef.current.cols,
              rows: termRef.current.rows,
            }),
          );
        }
        termRef.current.focus();
      }
    },
    getSessionId() {
      return sessionId;
    },
  }));

  useEffect(() => {
    let disposed = false;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 14,
      fontFamily: "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      lineHeight: 1.3,
      scrollback: 10000,
      theme: baseTheme,
    });

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL 不可用时自动回退到默认 renderer。
    }

    term.open(containerRef.current);
    termRef.current = term;

    const resetPageScroll = () => {
      window.scrollTo(0, 0);
      if (document.documentElement.scrollTop !== 0) {
        document.documentElement.scrollTop = 0;
      }
      if (document.body.scrollTop !== 0) {
        document.body.scrollTop = 0;
      }
    };

    const xtermTextarea = containerRef.current?.querySelector(".xterm-helper-textarea");
    let restoreFocus = null;
    let handleTextareaFocus = null;
    if (xtermTextarea instanceof HTMLElement) {
      const originalFocus = xtermTextarea.focus.bind(xtermTextarea);
      xtermTextarea.focus = (options) => {
        originalFocus({ preventScroll: true, ...(options || {}) });
      };
      restoreFocus = () => {
        xtermTextarea.focus = originalFocus;
      };
      handleTextareaFocus = () => {
        resetPageScroll();
      };
      xtermTextarea.addEventListener("focus", handleTextareaFocus);
    }

    // 不使用 MutationObserver 和容器 scroll 拦截，避免干扰 xterm 内部滚动
    // 页面级防滚动已通过 CSS position:fixed 在 html/body 上实现

    const sendResize = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "RESIZE",
            cols: term.cols,
            rows: term.rows,
          }),
        );
      }
    };

    const connect = () => {
      const params = new URLSearchParams({
        sessionId,
        cwd,
        cols: String(term.cols),
        rows: String(term.rows),
        token,
      });
      if (continueId) {
        params.set("continueId", continueId);
      }

      const ws = new WebSocket(`${wsUrl}/?${params.toString()}`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        term.focus();
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "PING" }));
          }
        }, 30000);
      };

      let scrollTimer = null;
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(event.data));
          // 收到数据后持续滚到底部，防止跳转
          resetPageScroll();
          if (scrollTimer) window.clearTimeout(scrollTimer);
          scrollTimer = window.setTimeout(() => {
            term.scrollToBottom();
            resetPageScroll();
          }, 50);
          return;
        }

        try {
          const message = JSON.parse(event.data);
          if (message.type === "SESSION_EXIT") {
            term.writeln("\r\n\x1b[33m[会话已退出]\x1b[0m");
          }
        } catch {
          // 忽略非 JSON 控制消息。
        }
      };

      ws.onclose = () => {
        if (pingIntervalRef.current) {
          window.clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        term.writeln("\r\n\x1b[31m[连接断开，3 秒后重连...]\x1b[0m");
        if (!disposed) {
          reconnectTimerRef.current = window.setTimeout(connect, 3000);
        }
      };

      ws.onerror = (event) => {
        console.error("[WS] 连接错误:", event);
        term.writeln("\r\n\x1b[31m[连接错误]\x1b[0m");
      };
    };

    let lastWidth = 0;
    let lastHeight = 0;

    const doFit = () => {
      const container = containerRef.current;
      if (!container) return;

      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;

      // 只在容器尺寸真正变化时才 fit，避免写入内容时误触
      if (w === lastWidth && h === lastHeight && connectedRef.current) return;
      lastWidth = w;
      lastHeight = h;

      fitAddon.fit();
      sendResize();
      term.scrollToBottom();
    };

    const ensureReady = () => {
      doFit();
      if (!connectedRef.current) {
        connectedRef.current = true;
        connect();
      }
    };

    const dataDisposable = term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    const resizeDisposable = term.onResize(() => {
      sendResize();
    });

    const onWindowResize = () => {
      lastWidth = 0;
      lastHeight = 0;
      ensureReady();
    };
    window.addEventListener("resize", onWindowResize);

    let resizeTimer = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => ensureReady(), 150);
    });
    resizeObserver.observe(containerRef.current);

    ensureReady();

    return () => {
      disposed = true;
      connectedRef.current = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (pingIntervalRef.current) {
        window.clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      window.removeEventListener("resize", onWindowResize);
      if (xtermTextarea instanceof HTMLElement && handleTextareaFocus) {
        xtermTextarea.removeEventListener("focus", handleTextareaFocus);
      }
      if (restoreFocus) {
        restoreFocus();
      }
      dataDisposable.dispose();
      resizeDisposable.dispose();
      wsRef.current?.close();
      term.dispose();
    };
  }, [continueId, cwd, sessionId, token, wsUrl]);

  return (
    <div style={shellStyle}>
      <div ref={containerRef} style={terminalStyle} />
    </div>
  );
});

export default TerminalView;

const shellStyle = {
  width: "100%",
  height: "100%",
  background: "#0f0f12",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.06)",
  overflow: "hidden",
  padding: 8,
  boxSizing: "border-box",
};

const terminalStyle = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  overscrollBehavior: "contain",
};
