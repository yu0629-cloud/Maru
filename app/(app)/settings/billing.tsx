import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useBilling } from "@/src/hooks/useBilling";
import { SCAN_TICKET_PRODUCTS } from "@/src/constants/plans";
import { PLAN_ENTITLEMENTS } from "@/src/features/billing/lib/catalog.mjs";
import { PlanPreviewSwitcher } from "@/src/components/PlanPreviewSwitcher";
import { PaywallCarryoverNote } from "@/src/components/PaywallCarryoverNote";
import type { SubscriptionTier } from "@/src/types/database";
import { tPlan, useT } from "@/src/i18n";

function PlanCard({
  tier,
  selected,
  current,
  price,
  quota,
  childrenCount,
  onPress,
}: {
  tier: SubscriptionTier;
  selected: boolean;
  current: boolean;
  price: string;
  quota: string;
  childrenCount: string;
  onPress?: () => void;
}) {
  const t = useT();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className={`mt-3 rounded-2xl border-2 px-4 py-4 ${
        current ? "border-maru-500 bg-white" : "border-transparent bg-white"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-ink">{tPlan(tier)}</Text>
        {current ? <Text className="text-xs font-semibold text-maru-600">{t("billing.inUse")}</Text> : null}
      </View>
      <Text className="mt-1 text-ink">{price}</Text>
      <Text className="mt-2 text-sm text-ink/70">{quota}</Text>
      <Text className="text-sm text-ink/70">{childrenCount}</Text>
      {selected && onPress ? (
        <Text className="mt-3 text-center font-bold text-maru-600">{t("billing.choosePlan")}</Text>
      ) : null}
    </Pressable>
  );
}

export default function BillingScreen() {
  const t = useT();
  const billing = useBilling();
  const { offerings, period, setPeriod, quota, tier, purchase, restore, busy, error, simulated } = billing;

  async function buy(productId: string | null, label: string) {
    if (!productId) return;
    try {
      await purchase(productId);
      Alert.alert(
        t("billing.appliedTitle"),
        t("billing.appliedBody", { label, simulated: simulated ? t("quota.simulated") : "" }),
      );
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t("billing.buyFailed");
      if (/TICKETS_PAID_ONLY/.test(message)) {
        Alert.alert(t("billing.paidOnlyTitle"), t("billing.paidOnlyBody"));
        return;
      }
      if (!/cancel/i.test(message)) Alert.alert(t("billing.cannotBuy"), message);
    }
  }

  async function onRestore() {
    try {
      const result = await restore();
      Alert.alert(
        result ? t("billing.restoredTitle") : t("billing.nothingToRestore"),
        result ? t("billing.restoredBody", { plan: tPlan(result.tier) }) : undefined,
      );
    } catch (caught) {
      Alert.alert(t("billing.cannotRestore"), caught instanceof Error ? caught.message : "");
    }
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-5">
      <Text className="text-2xl font-bold text-ink">{t("billing.title")}</Text>
      <Text className="mt-1 text-ink/70">
        {t("billing.current", {
          prefix: quota.previewTier ? t("quota.testPrefix") : "",
          plan: tPlan(quota.tier),
          remaining: quota.remaining,
          simulated: simulated ? t("quota.simulated") : "",
        })}
      </Text>
      <PlanPreviewSwitcher />
      {tier === "free" ? <PaywallCarryoverNote /> : null}
      {error ? <Text className="mt-2 text-sm text-maru-600">{error}</Text> : null}

      <View className="mt-4 flex-row rounded-full bg-white p-1">
        <Pressable
          className={`flex-1 rounded-full py-2 ${period === "monthly" ? "bg-maru-500" : ""}`}
          onPress={() => setPeriod("monthly")}
        >
          <Text className={`text-center font-semibold ${period === "monthly" ? "text-white" : "text-ink"}`}>
            {t("billing.monthly")}
          </Text>
        </Pressable>
        <Pressable
          className={`flex-1 rounded-full py-2 ${period === "yearly" ? "bg-maru-500" : ""}`}
          onPress={() => setPeriod("yearly")}
        >
          <Text className={`text-center font-semibold ${period === "yearly" ? "text-white" : "text-ink"}`}>
            {t("billing.yearly")}
          </Text>
        </Pressable>
      </View>

      <PlanCard
        tier="free"
        current={tier === "free"}
        selected={false}
        price={t("billing.freePrice")}
        quota={quota.tier === "free" ? t("billing.quotaLeft", { count: quota.remaining }) : t("billing.quotaDash")}
        childrenCount={t("billing.childrenCount", { count: 1 })}
      />
      <PlanCard
        tier="standard"
        current={tier === "standard"}
        selected={tier !== "standard"}
        price={
          period === "yearly"
            ? t("billing.priceYearly", { price: PLAN_ENTITLEMENTS.standard.yearlyPriceJpy.toLocaleString() })
            : t("billing.priceMonthly", { price: PLAN_ENTITLEMENTS.standard.priceJpy.toLocaleString() })
        }
        quota={t("billing.monthlyQuota", { count: 150 })}
        childrenCount={t("billing.childrenCount", { count: 1 })}
        onPress={busy ? undefined : () => void buy(offerings.standard.productId, tPlan("standard"))}
      />
      <PlanCard
        tier="family"
        current={tier === "family"}
        selected={tier !== "family"}
        price={
          period === "yearly"
            ? t("billing.priceYearly", { price: PLAN_ENTITLEMENTS.family.yearlyPriceJpy.toLocaleString() })
            : t("billing.priceMonthly", { price: PLAN_ENTITLEMENTS.family.priceJpy.toLocaleString() })
        }
        quota={t("billing.monthlyQuota", { count: 400 })}
        childrenCount={t("billing.childrenCount", { count: 3 })}
        onPress={busy ? undefined : () => void buy(offerings.family.productId, tPlan("family"))}
      />

      <Text className="mt-8 text-lg font-bold text-ink">{t("billing.ticketsTitle")}</Text>
      <Text className="mt-1 text-sm text-ink/70">{t("billing.ticketsHint")}</Text>
      {Object.entries(SCAN_TICKET_PRODUCTS).map(([productId, product]) => (
        <Pressable
          key={productId}
          className={`mt-3 rounded-2xl bg-white px-4 py-4 ${quota.canBuyTickets ? "" : "opacity-50"}`}
          disabled={busy || !quota.canBuyTickets}
          onPress={() => void buy(productId, t("billing.ticketName", { count: product.ticketCount }))}
        >
          <Text className="font-bold text-ink">
            {t("billing.ticketLabel", { count: product.ticketCount, price: product.priceJpy })}
          </Text>
          {!quota.canBuyTickets ? (
            <Text className="mt-1 text-xs text-maru-600">{t("billing.ticketsPaidOnlyHint")}</Text>
          ) : (
            <Text className="mt-1 text-xs text-ink/60">{t("billing.ticketsAddHint")}</Text>
          )}
        </Pressable>
      ))}

      <Pressable className="mt-6 rounded-2xl bg-white px-4 py-4" disabled={busy} onPress={() => void onRestore()}>
        <Text className="text-center font-bold text-ink">{t("billing.restore")}</Text>
      </Pressable>
      <Text className="mb-10 mt-3 text-center text-xs text-ink/50">{t("billing.cancelHint")}</Text>
    </ScrollView>
  );
}
