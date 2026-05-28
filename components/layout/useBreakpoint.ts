"use client";

import { useEffect, useState } from "react";

type Breakpoint = "sm" | "md" | "lg" | "xl";

export function useBreakpoint(): Breakpoint {
  const ssrSafe = typeof window === "undefined" ? "lg" : undefined;
  const [bp, setBp] = useState<Breakpoint>((ssrSafe as Breakpoint) ?? "lg");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const queries: [Breakpoint, string][] = [
      ["sm", "(max-width: 639px)"],
      ["md", "(min-width: 640px) and (max-width: 1023px)"],
      ["lg", "(min-width: 1024px) and (max-width: 1279px)"],
      ["xl", "(min-width: 1280px)"],
    ];

    const mqls = queries.map(([key, q]) => ({ key, m: window.matchMedia(q) }));

    const update = () => {
      for (const { key, m } of mqls) {
        if (m.matches) {
          setBp(key);
          return;
        }
      }
    };

    update();
    mqls.forEach(({ m }) => m.addEventListener("change", update));
    return () => mqls.forEach(({ m }) => m.removeEventListener("change", update));
  }, []);

  return bp;
}
