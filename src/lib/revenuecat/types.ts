import type { SubscriptionTier } from "@/src/types/database";

export type PaywallPeriod = "monthly" | "yearly";

export type PurchaseResult = {
  productId: string;
  tier: SubscriptionTier;
  ticketDelta?: number;
  transactionId: string;
  simulated: boolean;
};

export type BillingOffering = {
  identifier: string;
  productId: string;
  title: string;
  priceString: string;
  period: PaywallPeriod | "consumable";
};

export type BillingSdk = {
  readonly native: boolean;
  configure: (appUserId: string) => Promise<void>;
  logOut: () => Promise<void>;
  getOfferings: () => Promise<BillingOffering[]>;
  purchase: (productId: string) => Promise<PurchaseResult>;
  restore: () => Promise<PurchaseResult | null>;
  getActiveEntitlementIds: () => Promise<string[]>;
};
