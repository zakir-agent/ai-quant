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
    <nav className="flex items-center justify-between border-b border-gray-800 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-4 sm:gap-6">
        <Link href="/" className="text-lg font-bold whitespace-nowrap text-white">
          AI Quant
        </Link>
        <div className="flex gap-1 overflow-x-auto text-sm sm:gap-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-3 py-1 whitespace-nowrap transition-colors ${
                  active
                    ? "bg-gray-800 text-white"
                    : "text-gray-400 hover:bg-gray-800/50 hover:text-white"
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
          className={`inline-block h-2 w-2 rounded-full ${
            status === "ok"
              ? "bg-green-400"
              : status === "loading"
                ? "animate-pulse bg-yellow-400"
                : "bg-red-400"
          }`}
        />
        <span className="hidden text-xs text-gray-500 sm:inline">
          {status === "ok" ? "系统正常" : status === "loading" ? "连接中" : "异常"}
        </span>
      </div>
    </nav>
  );
}
