"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "quantum" | "neon";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "ai-quant-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Always start with "quantum" to match SSR, then sync from localStorage
  const [theme, setThemeState] = useState<Theme>("quantum");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial: Theme = stored === "neon" ? "neon" : "quantum";
    document.documentElement.setAttribute("data-theme", initial);
    if (initial !== "quantum") {
      setThemeState(initial); // eslint-disable-line react-hooks/set-state-in-effect -- sync from localStorage after hydration
    }
  }, []);

  // Keep DOM attribute in sync when theme changes after initial load
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === "quantum" ? "neon" : "quantum";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
