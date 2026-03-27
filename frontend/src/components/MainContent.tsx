"use client";

import { type ReactNode } from "react";
import { useSidebar } from "@/components/SidebarContext";

export default function MainContent({ children }: { children: ReactNode }) {
  const { collapsed, ready } = useSidebar();

  return (
    <main
      className={`min-h-screen p-4 sm:p-6 ${ready ? "transition-all duration-300" : ""}`}
      style={{ marginLeft: collapsed ? "64px" : "240px" }}
      suppressHydrationWarning
    >
      {children}
    </main>
  );
}
