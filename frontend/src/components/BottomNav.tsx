"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Newspaper,
  Settings,
  MoreHorizontal,
  Palette,
  Languages,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { useTheme } from "@/components/ThemeProvider";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { href: "/market", icon: BarChart3, labelKey: "nav.market" },
  { href: "/news", icon: Newspaper, labelKey: "nav.news" },
  { href: "/analysis", icon: Brain, labelKey: "nav.analysis" },
  { href: "/settings", icon: Settings, labelKey: "nav.settings" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const { t, locale, toggleLocale } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const themeText = t(`sidebar.theme.${theme}`);

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-40 flex items-center justify-around border-t md:hidden"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-primary)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {NAV_ITEMS.map(({ href, icon: Icon, labelKey }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 transition-colors"
            style={{
              color: active ? "var(--accent-primary)" : "var(--text-secondary)",
            }}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium">{t(labelKey)}</span>
          </Link>
        );
      })}

      {/* More menu */}
      <div ref={panelRef} className="relative flex flex-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full flex-col items-center gap-0.5 py-2 transition-colors"
          style={{ color: open ? "var(--accent-primary)" : "var(--text-secondary)" }}
        >
          <MoreHorizontal size={20} />
          <span className="text-[10px] font-medium">{t("sidebar.more")}</span>
        </button>

        {open && (
          <div
            className="absolute right-2 bottom-full mb-2 w-44 rounded-xl border p-1 shadow-lg"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-primary)",
            }}
          >
            <button
              onClick={() => {
                toggleTheme();
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors"
              style={{ color: "var(--text-primary)" }}
            >
              <Palette size={18} />
              {themeText}
            </button>
            <button
              onClick={() => {
                toggleLocale();
                setOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors"
              style={{ color: "var(--text-primary)" }}
            >
              <Languages size={18} />
              {locale === "zh" ? "中/EN" : "EN/中"}
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
