import type { SubscriptionTier } from "@/src/types/database";

export const PLAN_ENTITLEMENTS: Record<
  SubscriptionTier,
  {
    monthlyScanQuota: number;
    maxChildren: number;
    priceJpy: number;
    yearlyPriceJpy: number;
    revenueCatEntitlementId: string | null;
    label: string;
  }
>;

export const FREE_SCAN_GRANT: 10;
export const MAX_CHILDREN_ABSOLUTE: 3;
export const MAX_CONCURRENT_DEVICES: 2;

export const REVENUECAT_PRODUCT_IDS: {
  standardMonthly: "maru_standard_monthly";
  standardYearly: "maru_standard_yearly";
  familyMonthly: "maru_family_monthly";
  familyYearly: "maru_family_yearly";
  ticket50: "scan_ticket_50";
  ticket100: "scan_ticket_100";
};

export const SCAN_TICKET_PRODUCTS: {
  scan_ticket_50: { ticketCount: 50; priceJpy: 300; paidMembersOnly: true };
  scan_ticket_100: { ticketCount: 100; priceJpy: 500; paidMembersOnly: true };
};

export const PRODUCT_CATALOG: Record<
  string,
  | {
      kind: "subscription";
      tier: Exclude<SubscriptionTier, "free">;
      period: "monthly" | "yearly";
      priceJpy: number;
      entitlementId: string;
      label: string;
    }
  | {
      kind: "consumable";
      ticketCount: number;
      priceJpy: number;
      paidOnly: boolean;
      label: string;
    }
>;

export function describeQuota(input: {
  tier: SubscriptionTier;
  freeScansRemaining: number;
  monthlyUsed: number;
  extraTicketBalance: number;
}): {
  label: string;
  remaining: number;
  monthlyRemaining: number;
  ticketBalance: number;
  canBuyTickets: boolean;
};

export function previewQuotaState(tier: SubscriptionTier): {
  tier: SubscriptionTier;
  freeScansRemaining: number;
  monthlyUsed: number;
  extraTicketBalance: number;
};

export function tierFromEntitlementIds(ids: string[] | null | undefined): SubscriptionTier;
export function canPurchaseTickets(tier: SubscriptionTier): boolean;
export function maxChildrenForTier(tier: SubscriptionTier): number;
export function canAddChild(tier: SubscriptionTier, currentCount: number): boolean;
export function childLimitError(
  tier: SubscriptionTier,
  currentCount: number,
): { code: string; tier: SubscriptionTier; max: number; message: string } | null;

export type BillingState = {
  tier: SubscriptionTier;
  freeScansRemaining?: number;
  monthlyUsed?: number;
  extraTicketBalance?: number;
  lastProductId?: string;
};

export function applyPurchase<T extends BillingState>(state: T, productId: string): T;
export function offeringsForPaywall(period: "monthly" | "yearly"): {
  free: { id: string; productId: null; displayPrice: string; label: string };
  standard: { id: string; productId: string; displayPrice: string; label: string };
  family: { id: string; productId: string; displayPrice: string; label: string };
};
