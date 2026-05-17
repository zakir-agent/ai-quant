"use client";

import { useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AnalysisReport } from "@/lib/api";
import { useT } from "@/components/LanguageProvider";

interface ReportDrawerProps {
  report: AnalysisReport | null;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function ReportDrawer({ report, open, onClose, children }: ReportDrawerProps) {
  const t = useT();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && report && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed top-0 right-0 z-50 h-full overflow-y-auto border-l border-white/6"
            style={{
              width: "50vw",
              minWidth: 400,
              maxWidth: 700,
              background: "var(--bg-secondary)",
            }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div
              className="sticky top-0 z-10 border-b border-white/6 px-6 py-4"
              style={{ background: "var(--bg-secondary)" }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {report.scope === "market" ? t("analysis.marketWide") : report.scope}
                  </h2>
                  <p className="text-xs text-neutral-500">
                    {new Date(report.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-md p-2 text-neutral-400 hover:bg-white/5 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
