import { create } from "zustand";
import { describeQuota, previewQuotaState } from "@/src/constants/plans";
import type { SubscriptionTier } from "@/src/types/database";

type QuotaState = {
  tier: SubscriptionTier;
  freeScansRemaining: number;
  monthlyUsed: number;
  extraTicketBalance: number;
  previewTier: SubscriptionTier | null;
  setFromServer: (input: Partial<QuotaState>) => void;
  applyPreview: (tier: SubscriptionTier) => void;
  clearPreview: () => void;
  consumeOne: () => boolean;
};

export const useQuotaStore = create<QuotaState>((set, get) => ({
  tier: "free",
  freeScansRemaining: 10,
  monthlyUsed: 0,
  extraTicketBalance: 0,
  previewTier: null,
  setFromServer: (input) => {
    if (get().previewTier) return;
    set(input);
  },
  applyPreview: (tier) => set({ previewTier: tier, ...previewQuotaState(tier) }),
  clearPreview: () => set({ previewTier: null }),
  consumeOne: () => {
    const snapshot = describeQuota(get());
    if (snapshot.remaining <= 0) return false;
    const current = get();
    if (current.tier === "free") {
      set({ freeScansRemaining: current.freeScansRemaining - 1 });
      return true;
    }
    const planRemaining = snapshot.monthlyRemaining;
    if (planRemaining > 0) {
      set({ monthlyUsed: current.monthlyUsed + 1 });
      return true;
    }
    set({ extraTicketBalance: current.extraTicketBalance - 1 });
    return true;
  },
}));
