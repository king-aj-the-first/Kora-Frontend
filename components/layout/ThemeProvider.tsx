"use client";

import { useEffect, useState } from "react";
import { useUIStore } from "@/store/uiStore";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useUIStore((s) => s.theme);
  const [applied, setApplied] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = document.documentElement;

    const apply = (mode: "light" | "dark") => {
      root.classList.remove("light", "dark");
      root.classList.add(mode);
      setApplied(mode);
    };

    if (theme === "system") {
      const m = window.matchMedia("(prefers-color-scheme: dark)");
      apply(m.matches ? "dark" : "light");
      const handler = (e: MediaQueryListEvent) => apply(e.matches ? "dark" : "light");
      m.addEventListener("change", handler);
      return () => m.removeEventListener("change", handler);
    }

    apply(theme === "dark" ? "dark" : "light");
  }, [theme]);

  // Ensure a smooth transition on theme changes
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "kora-theme-transition";
    style.innerHTML = ":root{transition:background-color 200ms,color 200ms;}";
    document.head.appendChild(style);
    return () => {
      const s = document.getElementById("kora-theme-transition");
      if (s) s.remove();
    };
  }, []);

  return <>{children}</>;
}
