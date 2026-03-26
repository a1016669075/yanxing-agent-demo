export const SURFACE_MODE_KEY = "sat-atmo-agent-surface-mode";

export function isLocalHostname(hostname = "") {
  const value = String(hostname || "").trim().toLowerCase();
  return value === "" || value === "localhost" || value === "127.0.0.1" || value === "::1";
}

export function normalizeSurfaceMode(mode) {
  return mode === "workbench" ? "workbench" : "showcase";
}

export function resolveSurfaceMode({ hostname = "", storedMode = null } = {}) {
  if (!isLocalHostname(hostname)) {
    return "showcase";
  }

  return normalizeSurfaceMode(storedMode);
}

export function surfaceModeMeta(mode) {
  if (normalizeSurfaceMode(mode) === "workbench") {
    return {
      label: "研发工作台",
      hint: "展示版主链路保持不变，同时展开数据检索、预处理、评测等研发面板。",
    };
  }

  return {
    label: "展示版",
    hint: "默认突出任务输入、智能体决策、场景结果和解释，不把中间工程细节暴露给用户。",
  };
}
