import { canUseNativePurchases, revenueCatApiKey } from "@/src/lib/env";
import { mockBillingSdk } from "@/src/lib/revenuecat/mock-sdk";
import {
  PRODUCT_CATALOG,
  tierFromEntitlementIds,
} from "@/src/features/billing/lib/catalog.mjs";
import { syncEntitlementsToProfile } from "@/src/lib/revenuecat/sync";
import type { BillingOffering, BillingSdk, PurchaseResult } from "@/src/lib/revenuecat/types";
import type { SubscriptionTier } from "@/src/types/database";

let configuredFor: string | null = null;
let usingNative = false;
let listenerAttached = false;
let infoListener: { remove: () => void } | null = null;

async function getPurchases() {
  const mod = await import("react-native-purchases");
  return mod.default;
}

function activeEntitlementIds(info: {
  entitlements: { active: Record<string, unknown> };
}): string[] {
  return Object.keys(info.entitlements.active ?? {});
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

function resultFromCustomerInfo(
  productId: string,
  info: { entitlements: { active: Record<string, unknown> } },
  transactionId: string,
): PurchaseResult {
  const product = lookupProduct(productId);
  const tier = (product?.kind === "subscription"
    ? (product.tier as SubscriptionTier)
    : tierFromEntitlementIds(activeEntitlementIds(info))) as SubscriptionTier;
  return {
    productId,
    tier,
    ticketDelta: product?.kind === "consumable" ? product.ticketCount : undefined,
    transactionId,
    simulated: false,
  };
}

async function attachCustomerInfoListener() {
  if (listenerAttached) return;
  const Purchases = await getPurchases();
  const listener = (info: { entitlements: { active: Record<string, unknown> } }) => {
    const userId = configuredFor;
    if (!userId) return;
    void syncEntitlementsToProfile(userId, activeEntitlementIds(info));
  };
  Purchases.addCustomerInfoUpdateListener(listener);
  infoListener = {
    remove: () => {
      const remove = (
        Purchases as { removeCustomerInfoUpdateListener?: (cb: typeof listener) => void }
      ).removeCustomerInfoUpdateListener;
      remove?.(listener);
    },
  };
  listenerAttached = true;
}

export const nativeBillingSdk: BillingSdk = {
  get native() {
    return usingNative;
  },

  async configure(appUserId) {
    if (!canUseNativePurchases()) {
      usingNative = false;
      await mockBillingSdk.configure(appUserId);
      configuredFor = appUserId;
      return;
    }
    const Purchases = await getPurchases();
    const apiKey = revenueCatApiKey();
    if (!apiKey) {
      usingNative = false;
      await mockBillingSdk.configure(appUserId);
      configuredFor = appUserId;
      return;
    }

    if (__DEV__) {
      try {
        const level = (Purchases as { LOG_LEVEL?: { DEBUG?: unknown } }).LOG_LEVEL?.DEBUG;
        if (level !== undefined) Purchases.setLogLevel(level as never);
      } catch {
        // ログ設定は任意
      }
    }

    if (!configuredFor) {
      Purchases.configure({ apiKey, appUserID: appUserId });
    } else if (configuredFor !== appUserId) {
      await Purchases.logIn(appUserId);
    }

    configuredFor = appUserId;
    usingNative = true;
    await attachCustomerInfoListener();
  },

  async logOut() {
    if (!usingNative) {
      await mockBillingSdk.logOut();
      configuredFor = null;
      return;
    }
    try {
      const Purchases = await getPurchases();
      infoListener?.remove();
      infoListener = null;
      listenerAttached = false;
      await Purchases.logOut();
    } catch {
      // 未購入・未ログインでも落ちないようにする
    }
    configuredFor = null;
    usingNative = false;
  },

  async getOfferings() {
    if (!usingNative) return mockBillingSdk.getOfferings();
    const Purchases = await getPurchases();
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    const mapped: BillingOffering[] = packages.map((pkg) => ({
      identifier: pkg.identifier,
      productId: pkg.product.identifier,
      title: pkg.product.title,
      priceString: pkg.product.priceString,
      period: pkg.packageType === "ANNUAL" ? "yearly" : pkg.packageType === "MONTHLY" ? "monthly" : "consumable",
    }));
    return mapped.length > 0 ? mapped : mockBillingSdk.getOfferings();
  },

  async purchase(productId) {
    if (!usingNative) return mockBillingSdk.purchase(productId);
    const Purchases = await getPurchases();
    const offerings = await Purchases.getOfferings();
    const pkg = (offerings.current?.availablePackages ?? []).find(
      (item) => item.product.identifier === productId,
    );
    if (pkg) {
      const { customerInfo, transaction } = await Purchases.purchasePackage(pkg);
      return resultFromCustomerInfo(
        productId,
        customerInfo,
        transaction?.transactionIdentifier ?? `rc_${Date.now()}`,
      );
    }
    const products = await Purchases.getProducts([productId]);
    const product = products[0];
    if (!product) throw new Error("UNKNOWN_PRODUCT");
    const { customerInfo, transaction } = await Purchases.purchaseStoreProduct(product);
    return resultFromCustomerInfo(
      productId,
      customerInfo,
      transaction?.transactionIdentifier ?? `rc_${Date.now()}`,
    );
  },

  async restore() {
    if (!usingNative) return mockBillingSdk.restore();
    const Purchases = await getPurchases();
    const info = await Purchases.restorePurchases();
    const ids = activeEntitlementIds(info);
    const tier = tierFromEntitlementIds(ids);
    if (tier === "free") return null;
    return {
      productId: "restored",
      tier,
      transactionId: `restore_${Date.now()}`,
      simulated: false,
    };
  },

  async getActiveEntitlementIds() {
    if (!usingNative) return mockBillingSdk.getActiveEntitlementIds();
    const Purchases = await getPurchases();
    const info = await Purchases.getCustomerInfo();
    return activeEntitlementIds(info);
  },
};
