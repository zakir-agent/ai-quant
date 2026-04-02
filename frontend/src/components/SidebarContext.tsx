"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

interface SidebarContextValue {
  collapsed: boolean;
  ready: boolean;
  toggleCollapse: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "ai-quant-sidebar";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  // Sync from localStorage after mount, then mark ready (defer setState so the effect
  // body does not synchronously cascade renders; see react-hooks/set-state-in-effect).
  useEffect(() => {
    queueMicrotask(() => {
      if (localStorage.getItem(STORAGE_KEY) === "true") {
        setCollapsed(true);
      }
      // Ensure the DOM has painted with the correct state before enabling transitions
      requestAnimationFrame(() => {
        setReady(true);
      });
    });
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, ready, toggleCollapse }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return ctx;
}
