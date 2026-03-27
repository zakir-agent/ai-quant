"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import zhMessages from "@/messages/zh.json";
import enMessages from "@/messages/en.json";

type Locale = "zh" | "en";

type Messages = Record<string, unknown>;

const messagesMap: Record<Locale, Messages> = {
  zh: zhMessages,
  en: enMessages,
};

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "ai-quant-lang";

function lookup(messages: Messages, key: string): string {
  const parts = key.split(".");
  let current: unknown = messages;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return key;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : key;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start with "zh" to match SSR, then sync from localStorage
  const [locale, setLocaleState] = useState<Locale>("zh");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en") {
      setLocaleState("en"); // eslint-disable-line react-hooks/set-state-in-effect -- sync from localStorage after hydration
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => {
      const next: Locale = prev === "zh" ? "en" : "zh";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const t = useCallback(
    (key: string): string => lookup(messagesMap[locale], key),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}

export function useT(): (key: string) => string {
  return useLanguage().t;
}
