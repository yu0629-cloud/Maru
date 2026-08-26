import { useCallback, useEffect } from "react";
import { useAuth } from "@/src/hooks/useAuth";
import { useChildStore } from "@/src/stores/childStore";
import { useQuotaStore } from "@/src/stores/quotaStore";
import {
  createChild,
  deleteChild,
  hydrateChildren,
  switchCurrentChild,
  updateChild,
  type ChildDraft,
} from "@/src/features/children/service";
import { canAddChild, maxChildrenForTier } from "@/src/features/billing/lib/catalog.mjs";

export function useChildren() {
  const { userId, signedIn } = useAuth();
  const children = useChildStore((state) => state.children);
  const currentChildId = useChildStore((state) => state.currentChildId);
  const tier = useQuotaStore((state) => state.tier);
  const max = maxChildrenForTier(tier);

  useEffect(() => {
    if (!signedIn) return;
    void hydrateChildren();
  }, [signedIn, userId]);

  const switchChild = useCallback(async (childId: string) => {
    await switchCurrentChild(childId);
  }, []);

  return {
    children,
    currentChildId,
    currentChild: children.find((child) => child.id === currentChildId) ?? null,
    max,
    canAdd: canAddChild(tier, children.length),
    switchChild,
    createChild,
    updateChild,
    deleteChild,
    refresh: hydrateChildren,
  };
}

export type { ChildDraft };
