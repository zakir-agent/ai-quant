"use client";

import { type ReactNode } from "react";
import { useSidebar } from "@/components/SidebarContext";

export default function MainContent({ children }: { children: ReactNode }) {
  const { collapsed, ready } = useSidebar();

  return (
    <main
      className={`min-h-screen p-4 pb-20 sm:p-6 md:pb-4 ${ready ? "transition-[margin] duration-300" : ""} ml-0 md:ml-[var(--sidebar-margin)]`}
      style={
        ready
          ? ({ "--sidebar-margin": collapsed ? "64px" : "240px" } as React.CSSProperties)
          : { marginLeft: collapsed ? "64px" : "240px" }
      }
      suppressHydrationWarning
    >
      {children}
    </main>
  );
}
