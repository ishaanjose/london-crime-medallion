// The user's light/dark choice. "system" means no data-theme attribute, so
// globals.css falls back to prefers-color-scheme.

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

// Runs in <head> before first paint (see app/layout.tsx), so it must stay
// plain ES5 with no imports. Only "light" and "dark" are applied.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function readThemePreference(): ThemePreference {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage blocked: the choice still applies for this page view
  }
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}
