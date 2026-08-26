import { useCallback } from "react";
import { switchCurrentChild } from "@/src/features/children/service";
import { useChildStore } from "@/src/stores/childStore";

export function useCurrentChild() {
  const children = useChildStore((state) => state.children);
  const currentChildId = useChildStore((state) => state.currentChildId);
  const switchChild = useCallback(async (childId: string) => {
    await switchCurrentChild(childId);
  }, []);

  const currentChild = children.find((child) => child.id === currentChildId) ?? children[0] ?? null;

  return {
    children,
    currentChild,
    currentChildId: currentChild?.id ?? null,
    switchChild,
  };
}
