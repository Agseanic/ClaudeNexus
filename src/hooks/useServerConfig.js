import { useMemo, useState } from "react";

const STORAGE_KEY = "claudehub_v2_config";

const DEFAULTS = {
  host: "",
  port: "8091",
  defaultCwd: "/Volumes/xm",
};

function readStoredConfig() {
  if (typeof window === "undefined") {
    return DEFAULTS;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULTS;
    const parsed = JSON.parse(stored);
    // 旧配置 defaultCwd 为空时回退到默认值
    if (!parsed.defaultCwd) {
      parsed.defaultCwd = DEFAULTS.defaultCwd;
    }
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function useServerConfig() {
  const [config, setConfig] = useState(readStoredConfig);

  const saveConfig = (patch) => {
    setConfig((current) => {
      const next = { ...current, ...patch };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const resetConfig = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setConfig(DEFAULTS);
  };

  const derived = useMemo(() => {
    const host = config.host.trim();
    const port = config.port.trim() || DEFAULTS.port;
    return {
      isConfigured: Boolean(host),
      wsUrl: host ? `ws://${host}:${port}` : "",
      apiBase: host ? `http://${host}:${port}` : "",
    };
  }, [config]);

  return {
    config,
    saveConfig,
    resetConfig,
    ...derived,
  };
}
