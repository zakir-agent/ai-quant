"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Settings,
  ChevronLeft,
  ChevronRight,
  Palette,
  Languages,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { useSidebar } from "@/components/SidebarContext";
import Logo from "@/components/ui/Logo";
import { getHealth } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, labelKey: "nav.dashboard" },
  { href: "/market", icon: BarChart3, labelKey: "nav.market" },
  { href: "/analysis", icon: Brain, labelKey: "nav.analysis" },
  { href: "/settings", icon: Settings, labelKey: "nav.settings" },
] as const;

type HealthStatus = "loading" | "ok" | "error";

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { locale, toggleLocale, t } = useLanguage();
  const { collapsed, ready, toggleCollapse } = useSidebar();

  const [health, setHealth] = useState<HealthStatus>("loading");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect -- hydration guard

    getHealth()
      .then((h) => setHealth(h.status === "ok" ? "ok" : "error"))
      .catch(() => setHealth("error"));
  }, []);

  const healthColor =
    health === "ok"
      ? "bg-green-400"
      : health === "loading"
        ? "bg-yellow-400 animate-pulse"
        : "bg-red-400";

  const healthText = t(`sidebar.health.${health}`);
  const themeText = t(`sidebar.theme.${theme}`);

  // Don't render on server or before hydration to avoid mismatch
  if (!mounted) return null;

  return (
    <aside
      className={`hidden md:flex flex-col fixed left-0 top-0 h-screen border-r z-40 ${
        ready ? "transition-all duration-300" : ""
      } ${collapsed ? "w-16" : "w-60"}`}
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-primary)",
      }}
    >
      {/* Header */}
      <div className="sidebar-header flex items-center h-14 px-3 shrink-0 overflow-hidden whitespace-nowrap gap-2">
        <Logo size={collapsed ? 28 : 32} className="shrink-0" />
        <div className={`flex flex-col min-w-0 ${ready ? "transition-opacity duration-200" : ""} ${collapsed ? "opacity-0 w-0" : "opacity-100"}`}>
          <span
            className="text-sm font-bold leading-tight bg-clip-text text-transparent"
            style={{ backgroundImage: "var(--accent-gradient)" }}
          >
            AI Quant
          </span>
          <span
            className="text-[10px] leading-tight"
            style={{ color: "var(--text-muted)" }}
          >
            {t("sidebar.subtitle")}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 px-2 py-2 overflow-y-auto">
        {NAV_ITEMS.map(({ href, icon: Icon, labelKey }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors overflow-hidden"
              style={
                active
                  ? {
                      background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                      color: "var(--accent-primary)",
                      boxShadow: "0 0 12px color-mix(in srgb, var(--accent-primary) 25%, transparent)",
                    }
                  : {
                      color: "var(--text-secondary)",
                    }
              }
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "var(--bg-card-hover)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
            >
              <Icon size={20} className="shrink-0" />
              <span className={`text-sm font-medium truncate whitespace-nowrap ${ready ? "transition-opacity duration-200" : ""} ${collapsed ? "opacity-0 w-0" : "opacity-100"}`}>
                {t(labelKey)}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="sidebar-footer flex flex-col gap-1 px-2 py-3 border-t shrink-0"
        style={{ borderColor: "var(--border-primary)" }}
      >
        {/* Health indicator */}
        <div className="flex items-center gap-3 rounded-lg px-3 py-2 overflow-hidden">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthColor}`} />
          <span className={`text-xs whitespace-nowrap ${ready ? "transition-opacity duration-200" : ""} ${collapsed ? "opacity-0 w-0" : "opacity-100"}`} style={{ color: "var(--text-secondary)" }}>
            {healthText}
          </span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors cursor-pointer overflow-hidden"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-card-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          title={themeText}
        >
          <Palette size={20} className="shrink-0" />
          <span className={`text-xs truncate whitespace-nowrap ${ready ? "transition-opacity duration-200" : ""} ${collapsed ? "opacity-0 w-0" : "opacity-100"}`}>
            {themeText}
          </span>
        </button>

        {/* Language toggle */}
        <button
          onClick={toggleLocale}
          className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors cursor-pointer overflow-hidden"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-card-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          title={locale === "zh" ? "Switch to English" : "切换到中文"}
        >
          <Languages size={20} className="shrink-0" />
          <span className={`text-xs whitespace-nowrap ${ready ? "transition-opacity duration-200" : ""} ${collapsed ? "opacity-0 w-0" : "opacity-100"}`}>
            {locale === "zh" ? "中/EN" : "EN/中"}
          </span>
        </button>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors cursor-pointer overflow-hidden"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-card-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
          title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
        >
          {collapsed ? <ChevronRight size={20} className="shrink-0" /> : <ChevronLeft size={20} className="shrink-0" />}
          <span className={`text-xs truncate whitespace-nowrap ${ready ? "transition-opacity duration-200" : ""} ${collapsed ? "opacity-0 w-0" : "opacity-100"}`}>
            {t("sidebar.collapse")}
          </span>
        </button>
      </div>
    </aside>
  );
}
