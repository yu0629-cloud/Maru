import { create } from "zustand";
import type { Database } from "@/src/types/database";

type Child = Database["public"]["Tables"]["children"]["Row"];

type ChildState = {
  children: Child[];
  currentChildId: string | null;
  setChildren: (children: Child[], currentChildId?: string | null) => void;
  upsertChild: (child: Child) => void;
  removeChild: (childId: string) => void;
  switchChild: (childId: string) => void;
};

export const useChildStore = create<ChildState>((set) => ({
  children: [],
  currentChildId: null,
  setChildren: (children, currentChildId) =>
    set((state) => ({
      children,
      currentChildId:
        currentChildId ??
        (children.some((child) => child.id === state.currentChildId)
          ? state.currentChildId
          : (children[0]?.id ?? null)),
    })),
  upsertChild: (child) =>
    set((state) => {
      const exists = state.children.some((item) => item.id === child.id);
      const children = exists
        ? state.children.map((item) => (item.id === child.id ? child : item))
        : [...state.children, child];
      return {
        children,
        currentChildId: state.currentChildId ?? child.id,
      };
    }),
  removeChild: (childId) =>
    set((state) => {
      const children = state.children.filter((item) => item.id !== childId);
      return {
        children,
        currentChildId: state.currentChildId === childId ? (children[0]?.id ?? null) : state.currentChildId,
      };
    }),
  switchChild: (childId) => set({ currentChildId: childId }),
}));
