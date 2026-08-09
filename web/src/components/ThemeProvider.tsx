'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const STORAGE_KEY = 'recome_theme';
const DEFAULT_THEME: Theme = 'dark';
const THEME_EVENT = 'recome-theme-change';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeThemeChange(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  return () => window.removeEventListener(THEME_EVENT, cb);
}

// Reads the theme that the no-flash inline script already applied to
// <html> on first paint. Falls back to the default if hydration runs
// before the script (it shouldn't, but be defensive).
function readInitialTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' || attr === 'dark' ? attr : DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The <html data-theme> attribute (set pre-paint by the inline script) is
  // the source of truth; React reads it as an external store. The server
  // snapshot is the default, and React reconciles to the real value right
  // after hydration — no setState-in-effect, no flash, no mismatch error.
  const theme = useSyncExternalStore(subscribeThemeChange, readInitialTheme, () => DEFAULT_THEME);

  // Mark `theme-ready` after mount so subsequent changes animate.
  useEffect(() => {
    document.documentElement.classList.add('theme-ready');
  }, []);

  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode / storage disabled — preference doesn't persist, no-op.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

// Inline script source. Runs synchronously in <head> before React
// hydration to set data-theme — prevents the dark→light flash on
// first paint for users who picked light. Kept as a plain string so
// next/script's strategy doesn't matter; we inject via <script> in the
// root layout with dangerouslySetInnerHTML.
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : '${DEFAULT_THEME}';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', '${DEFAULT_THEME}');
  }
})();
`.trim();
