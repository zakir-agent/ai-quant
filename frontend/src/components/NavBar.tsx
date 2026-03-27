"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/", label: "仪表盘" },
  { href: "/market", label: "市场数据" },
  { href: "/analysis", label: "AI 分析" },
  { href: "/settings", label: "设置" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [status, setStatus] = useState<string>("loading");

  useEffect(() => {
    getHealth()
      .then((h) => setStatus(h.status))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <nav className="border-b border-gray-800 px-4 sm:px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4 sm:gap-6">
        <Link href="/" className="text-lg font-bold text-white whitespace-nowrap">
          AI Quant
        </Link>
        <div className="flex gap-1 sm:gap-2 text-sm overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1 rounded transition-colors whitespace-nowrap ${
                  active
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            status === "ok" ? "bg-green-400" : status === "loading" ? "bg-yellow-400 animate-pulse" : "bg-red-400"
          }`}
        />
        <span className="text-xs text-gray-500 hidden sm:inline">
          {status === "ok" ? "系统正常" : status === "loading" ? "连接中" : "异常"}
        </span>
      </div>
    </nav>
  );
}
