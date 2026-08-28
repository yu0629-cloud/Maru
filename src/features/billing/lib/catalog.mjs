/** プラン・IAP・残数・子ども上限の単一ソース（Node テストからも import する） */

export const PLAN_ENTITLEMENTS = {
  free: {
    monthlyScanQuota: 0,
    maxChildren: 1,
    priceJpy: 0,
    yearlyPriceJpy: 0,
    revenueCatEntitlementId: null,
    label: "フリー",
  },
  standard: {
    monthlyScanQuota: 150,
    maxChildren: 1,
    priceJpy: 980,
    yearlyPriceJpy: 9800,
    revenueCatEntitlementId: "standard",
    label: "スタンダード",
  },
  family: {
    monthlyScanQuota: 400,
    maxChildren: 3,
    priceJpy: 1480,
    yearlyPriceJpy: 14800,
    revenueCatEntitlementId: "family",
    label: "ファミリー",
  },
};

export const FREE_SCAN_GRANT = 10;
export const PAYWALL_FREE_CARRYOVER_MESSAGE =
  "無料お試し枠の10枚が終わりました！有料プランに登録すると、今回の採点データと画像をそのまま引き継いで、復習プリント作成やカルテ分析を続けられます。";
export const PAYWALL_PAID_QUOTA_EXHAUSTED_MESSAGE =
  "プランを変更するか、追加チケットを購入してください。";
export const MAX_CHILDREN_ABSOLUTE = 3;
export const MAX_CONCURRENT_DEVICES = 2;

export const REVENUECAT_PRODUCT_IDS = {
  standardMonthly: "maru_standard_monthly",
  standardYearly: "maru_standard_yearly",
  familyMonthly: "maru_family_monthly",
  familyYearly: "maru_family_yearly",
  ticket50: "scan_ticket_50",
  ticket100: "scan_ticket_100",
};

export const SCAN_TICKET_PRODUCTS = {
  scan_ticket_50: { ticketCount: 50, priceJpy: 300, paidMembersOnly: true },
  scan_ticket_100: { ticketCount: 100, priceJpy: 500, paidMembersOnly: true },
};

export const PRODUCT_CATALOG = {
  maru_standard_monthly: {
    kind: "subscription",
    tier: "standard",
    period: "monthly",
    priceJpy: 980,
    entitlementId: "standard",
    label: "スタンダード（月額）",
  },
  maru_standard_yearly: {
    kind: "subscription",
    tier: "standard",
    period: "yearly",
    priceJpy: 9800,
    entitlementId: "standard",
    label: "スタンダード（年額）",
  },
  maru_family_monthly: {
    kind: "subscription",
    tier: "family",
    period: "monthly",
    priceJpy: 1480,
    entitlementId: "family",
    label: "ファミリー（月額）",
  },
  maru_family_yearly: {
    kind: "subscription",
    tier: "family",
    period: "yearly",
    priceJpy: 14800,
    entitlementId: "family",
    label: "ファミリー（年額）",
  },
  scan_ticket_50: {
    kind: "consumable",
    ticketCount: 50,
    priceJpy: 300,
    paidOnly: true,
    label: "追加スキャン 50枚",
  },
  scan_ticket_100: {
    kind: "consumable",
    ticketCount: 100,
    priceJpy: 500,
    paidOnly: true,
    label: "追加スキャン 100枚",
  },
};

export function describeQuota(input) {
  const plan = PLAN_ENTITLEMENTS[input.tier] ?? PLAN_ENTITLEMENTS.free;
  const monthlyRemaining =
    input.tier === "free" ? 0 : Math.max(0, plan.monthlyScanQuota - (input.monthlyUsed ?? 0));

  return {
    label: plan.label,
    remaining:
      input.tier === "free"
        ? input.freeScansRemaining
        : monthlyRemaining + (input.extraTicketBalance ?? 0),
    monthlyRemaining,
    ticketBalance: input.extraTicketBalance ?? 0,
    canBuyTickets: input.tier !== "free",
  };
}

/** 端末上のテスト切替用。サーバーの課金は触らない */
export function previewQuotaState(tier) {
  if (tier === "free") {
    return {
      tier: "free",
      freeScansRemaining: FREE_SCAN_GRANT,
      monthlyUsed: 0,
      extraTicketBalance: 0,
    };
  }
  return {
    tier,
    freeScansRemaining: 0,
    monthlyUsed: 0,
    extraTicketBalance: 0,
  };
}

export function tierFromEntitlementIds(ids) {
  const set = new Set(ids ?? []);
  if (set.has("family")) return "family";
  if (set.has("standard")) return "standard";
  return "free";
}

export function canPurchaseTickets(tier) {
  return tier !== "free";
}

export function quotaExhaustedMessage(tier) {
  return tier === "free" ? PAYWALL_FREE_CARRYOVER_MESSAGE : PAYWALL_PAID_QUOTA_EXHAUSTED_MESSAGE;
}

export function maxChildrenForTier(tier) {
  return PLAN_ENTITLEMENTS[tier]?.maxChildren ?? 1;
}

export function canAddChild(tier, currentCount) {
  return currentCount < maxChildrenForTier(tier);
}

export function childLimitError(tier, currentCount) {
  const max = maxChildrenForTier(tier);
  if (currentCount < max) return null;
  return {
    code: "CHILD_LIMIT_REACHED",
    tier,
    max,
    message:
      tier === "family"
        ? "子どもは最大3人までです。"
        : "このプランでは子どもは1人までです。ファミリーにすると3人まで登録できます。",
  };
}

/**
 * 購入結果をローカル課金状態へ適用する（モック / クライアント楽観更新）。
 * @throws {Error} TICKETS_PAID_ONLY | UNKNOWN_PRODUCT
 */
export function applyPurchase(state, productId) {
  const product = PRODUCT_CATALOG[productId];
  if (!product) {
    const error = new Error("UNKNOWN_PRODUCT");
    error.code = "UNKNOWN_PRODUCT";
    throw error;
  }

  if (product.kind === "consumable") {
    if (!canPurchaseTickets(state.tier)) {
      const error = new Error("TICKETS_PAID_ONLY");
      error.code = "TICKETS_PAID_ONLY";
      throw error;
    }
    return {
      ...state,
      extraTicketBalance: (state.extraTicketBalance ?? 0) + product.ticketCount,
      lastProductId: productId,
    };
  }

  return {
    ...state,
    tier: product.tier,
    lastProductId: productId,
  };
}

export function offeringsForPaywall(period) {
  const selected = period === "yearly" ? "yearly" : "monthly";
  return {
    free: {
      id: "free",
      productId: null,
      ...PLAN_ENTITLEMENTS.free,
      period: selected,
      displayPrice: "初回10枚",
    },
    standard: {
      id: "standard",
      productId:
        selected === "yearly"
          ? REVENUECAT_PRODUCT_IDS.standardYearly
          : REVENUECAT_PRODUCT_IDS.standardMonthly,
      ...PLAN_ENTITLEMENTS.standard,
      period: selected,
      displayPrice:
        selected === "yearly"
          ? `¥${PLAN_ENTITLEMENTS.standard.yearlyPriceJpy.toLocaleString("ja-JP")} / 年`
          : `¥${PLAN_ENTITLEMENTS.standard.priceJpy.toLocaleString("ja-JP")} / 月`,
    },
    family: {
      id: "family",
      productId:
        selected === "yearly"
          ? REVENUECAT_PRODUCT_IDS.familyYearly
          : REVENUECAT_PRODUCT_IDS.familyMonthly,
      ...PLAN_ENTITLEMENTS.family,
      period: selected,
      displayPrice:
        selected === "yearly"
          ? `¥${PLAN_ENTITLEMENTS.family.yearlyPriceJpy.toLocaleString("ja-JP")} / 年`
          : `¥${PLAN_ENTITLEMENTS.family.priceJpy.toLocaleString("ja-JP")} / 月`,
    },
  };
}
