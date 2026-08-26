export { billingSdk } from "./sdk";
export { mockBillingSdk } from "./mock-sdk";
export type { BillingSdk, PurchaseResult } from "./types";
export { REVENUECAT_PRODUCT_IDS } from "@/src/features/billing/lib/catalog.mjs";

export const revenueCatEntitlements = {
  standard: "standard",
  family: "family",
} as const;
