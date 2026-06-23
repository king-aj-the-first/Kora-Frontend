import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TxState } from "@/types";

export type Theme = "light" | "dark" | "system";

interface UIStore {
  walletModalOpen: boolean;
  setWalletModalOpen: (open: boolean) => void;

  txState: TxState;
  setTxState: (state: Partial<TxState>) => void;
  resetTxState: () => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      walletModalOpen: false,
      setWalletModalOpen: (walletModalOpen) => set({ walletModalOpen }),

      txState: { status: "idle" },
      setTxState: (state) =>
        set((s) => ({ txState: { ...s.txState, ...state } })),
      resetTxState: () => set({ txState: { status: "idle" } }),

      sidebarOpen: false,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

      // "system" = respect prefers-color-scheme (first-visit default, never
      // cycled back to once the user explicitly picks a preference).
      theme: "system",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        // Resolve "system" to the OS preference so we can flip it correctly,
        // then toggle between "dark" and "light" only — system is the implicit
        // default on first visit and we don't want to cycle through it again.
        const current = get().theme;
        const resolved =
          current === "system"
            ? typeof window !== "undefined" &&
              window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light"
            : current;
        set({ theme: resolved === "dark" ? "light" : "dark" });
      },
    }),
    {
      name: "kora-ui-store",
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
