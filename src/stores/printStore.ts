import { create } from "zustand";

export type PrintProblemScope = "daily" | "all";

type PrintState = {
  scope: PrintProblemScope;
  excludedIds: string[];
  setScope: (scope: PrintProblemScope) => void;
  togglePrintSelection: (id: string) => void;
  isPrintSelected: (id: string) => boolean;
  clearExcluded: () => void;
};

export const usePrintStore = create<PrintState>((set, get) => ({
  scope: "daily",
  excludedIds: [],
  setScope: (scope) => set({ scope }),
  togglePrintSelection: (id) =>
    set((state) => {
      const key = String(id);
      const excluded = state.excludedIds.includes(key)
        ? state.excludedIds.filter((value) => value !== key)
        : [...state.excludedIds, key];
      return { excludedIds: excluded };
    }),
  isPrintSelected: (id) => !get().excludedIds.includes(String(id)),
  clearExcluded: () => set({ excludedIds: [] }),
}));
