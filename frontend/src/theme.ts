// 主题管理工具模块
// 在 index.html 内联脚本、App.tsx、SettingsPage 之间共享同一套逻辑

export type ThemeMode = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "theme";

/** 读取本地存储的主题，默认浅色（避免跟随系统导致首次意外进入深色） */
export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "light";
}

/** 将主题模式解析为实际的 light/dark */
export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

/** 应用主题到 <html data-theme> */
export function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", resolveTheme(mode));
}

/** 持久化主题 */
export function persistTheme(mode: ThemeMode) {
  localStorage.setItem(THEME_STORAGE_KEY, mode);
}
