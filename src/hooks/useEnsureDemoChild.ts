import { useEffect } from "react";
import { shouldUseRemote } from "@/src/lib/backend";
import { MOCK_CHILD } from "@/src/features/print/mock";
import { ensureAtLeastOneChild } from "@/src/features/children/service";
import { useChildStore } from "@/src/stores/childStore";

export function useEnsureDemoChild() {
  const children = useChildStore((state) => state.children);
  const setChildren = useChildStore((state) => state.setChildren);

  useEffect(() => {
    if (!shouldUseRemote()) {
      if (children.length === 0) setChildren([MOCK_CHILD]);
      return;
    }
    if (children.length === 0) void ensureAtLeastOneChild().catch(() => undefined);
  }, [children.length, setChildren]);
}
