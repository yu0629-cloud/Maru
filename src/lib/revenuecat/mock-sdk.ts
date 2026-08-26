import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  applyPurchase,
  PRODUCT_CATALOG,
  REVENUECAT_PRODUCT_IDS,
  tierFromEntitlementIds,
} from "@/src/features/billing/lib/catalog.mjs";
import type { BillingOffering, BillingSdk, PurchaseResult } from "@/src/lib/revenuecat/types";
import type { SubscriptionTier } from "@/src/types/database";

const STORAGE_KEY = "maru.billing.mock";

type Persisted = {
  tier: SubscriptionTier;
  extraTicketBalance: number;
  lastProductId?: string;
  entitlementIds: string[];
};

const DEFAULT_STATE: Persisted = {
  tier: "free",
  extraTicketBalance: 0,
  entitlementIds: [],
};

async function load(): Promise<Persisted> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_STATE };
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function save(state: Persisted) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

type CatalogProduct = {
  kind: string;
  tier?: string;
  ticketCount?: number;
  label?: string;
};

function lookupProduct(productId: string): CatalogProduct | undefined {
  return (PRODUCT_CATALOG as Record<string, CatalogProduct | undefined>)[productId];
}

function offering(productId: string, priceString: string, period: BillingOffering["period"]): BillingOffering {
  const product = lookupProduct(productId);
  return {
    identifier: productId,
    productId,
    title: product?.label ?? productId,
    priceString,
    period,
  };
}

export const mockBillingSdk: BillingSdk = {
  native: false,

  async configure() {
    await load();
  },

  async logOut() {
    // ストア側の購入は端末に残す（購入の復元のため）。アカウント削除時は resetMockBilling を使う。
  },

  async getOfferings() {
    return [
      offering(REVENUECAT_PRODUCT_IDS.standardMonthly, "¥980", "monthly"),
      offering(REVENUECAT_PRODUCT_IDS.standardYearly, "¥9,800", "yearly"),
      offering(REVENUECAT_PRODUCT_IDS.familyMonthly, "¥1,480", "monthly"),
      offering(REVENUECAT_PRODUCT_IDS.familyYearly, "¥14,800", "yearly"),
      offering(REVENUECAT_PRODUCT_IDS.ticket50, "¥300", "consumable"),
      offering(REVENUECAT_PRODUCT_IDS.ticket100, "¥500", "consumable"),
    ];
  },

  async purchase(productId) {
    const product = lookupProduct(productId);
    if (!product) throw new Error("UNKNOWN_PRODUCT");
    const current = await load();
    const next = applyPurchase(current, productId);
    const entitlementIds =
      next.tier === "free" ? [] : next.tier === "family" ? ["family"] : ["standard"];
    await save({
      tier: next.tier,
      extraTicketBalance: next.extraTicketBalance ?? 0,
      lastProductId: productId,
      entitlementIds,
    });
    const result: PurchaseResult = {
      productId,
      tier: next.tier,
      ticketDelta: product.kind === "consumable" ? product.ticketCount : undefined,
      transactionId: `mock_${productId}_${Date.now()}`,
      simulated: true,
    };
    return result;
  },

  async restore() {
    const current = await load();
    if (current.tier === "free" && !current.lastProductId) return null;
    return {
      productId: current.lastProductId ?? "restored",
      tier: current.tier,
      transactionId: `restore_${Date.now()}`,
      simulated: true,
    };
  },

  async getActiveEntitlementIds() {
    const current = await load();
    if (current.entitlementIds.length > 0) return current.entitlementIds;
    return current.tier === "free" ? [] : [current.tier];
  },
};

export async function loadMockBillingSnapshot(): Promise<Persisted> {
  return load();
}

export async function resetMockBilling() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export { tierFromEntitlementIds };
