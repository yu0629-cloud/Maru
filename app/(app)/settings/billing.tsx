import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useBilling } from "@/src/hooks/useBilling";
import { SCAN_TICKET_PRODUCTS } from "@/src/constants/plans";
import { PLAN_ENTITLEMENTS } from "@/src/features/billing/lib/catalog.mjs";
import { PlanPreviewSwitcher } from "@/src/components/PlanPreviewSwitcher";
import type { SubscriptionTier } from "@/src/types/database";

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
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className={`mt-3 rounded-2xl border-2 px-4 py-4 ${
        current ? "border-maru-500 bg-white" : "border-transparent bg-white"
      }`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-ink">{PLAN_ENTITLEMENTS[tier].label}</Text>
        {current ? <Text className="text-xs font-semibold text-maru-600">利用中</Text> : null}
      </View>
      <Text className="mt-1 text-ink">{price}</Text>
      <Text className="mt-2 text-sm text-ink/70">{quota}</Text>
      <Text className="text-sm text-ink/70">{childrenCount}</Text>
      {selected && onPress ? (
        <Text className="mt-3 text-center font-bold text-maru-600">このプランにする</Text>
      ) : null}
    </Pressable>
  );
}

export default function BillingScreen() {
  const billing = useBilling();
  const { offerings, period, setPeriod, quota, tier, purchase, restore, busy, error, simulated } = billing;

  async function buy(productId: string | null, label: string) {
    if (!productId) return;
    try {
      await purchase(productId);
      Alert.alert("反映しました", `${label}を有効化しました。${simulated ? "（シミュレーション）" : ""}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "購入できませんでした";
      if (/TICKETS_PAID_ONLY/.test(message)) {
        Alert.alert("有料会員限定です", "追加チケットはスタンダードまたはファミリーで購入できます。");
        return;
      }
      if (!/cancel/i.test(message)) Alert.alert("購入できません", message);
    }
  }

  async function onRestore() {
    try {
      const result = await restore();
      Alert.alert(
        result ? "購入を復元しました" : "復元できる購入がありません",
        result ? `${PLAN_ENTITLEMENTS[result.tier].label} がこの端末に紐づきました。` : undefined,
      );
    } catch (caught) {
      Alert.alert("復元できません", caught instanceof Error ? caught.message : "");
    }
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-5">
      <Text className="text-2xl font-bold text-ink">料金プラン</Text>
      <Text className="mt-1 text-ink/70">
        いまのプラン: {quota.previewTier ? "テスト・" : ""}
        {quota.label}　残 {quota.remaining}枚
        {simulated ? "　・シミュレーション" : ""}
      </Text>
      <PlanPreviewSwitcher />
      {error ? <Text className="mt-2 text-sm text-maru-600">{error}</Text> : null}

      <View className="mt-4 flex-row rounded-full bg-white p-1">
        <Pressable
          className={`flex-1 rounded-full py-2 ${period === "monthly" ? "bg-maru-500" : ""}`}
          onPress={() => setPeriod("monthly")}
        >
          <Text className={`text-center font-semibold ${period === "monthly" ? "text-white" : "text-ink"}`}>月額</Text>
        </Pressable>
        <Pressable
          className={`flex-1 rounded-full py-2 ${period === "yearly" ? "bg-maru-500" : ""}`}
          onPress={() => setPeriod("yearly")}
        >
          <Text className={`text-center font-semibold ${period === "yearly" ? "text-white" : "text-ink"}`}>年額</Text>
        </Pressable>
      </View>

      <PlanCard
        tier="free"
        current={tier === "free"}
        selected={false}
        price="初回10枚（買い切り）"
        quota={`残 ${quota.tier === "free" ? quota.remaining : "—"}枚`}
        childrenCount="子ども 1人"
      />
      <PlanCard
        tier="standard"
        current={tier === "standard"}
        selected={tier !== "standard"}
        price={offerings.standard.displayPrice}
        quota="月150枚"
        childrenCount="子ども 1人"
        onPress={busy ? undefined : () => void buy(offerings.standard.productId, "スタンダード")}
      />
      <PlanCard
        tier="family"
        current={tier === "family"}
        selected={tier !== "family"}
        price={offerings.family.displayPrice}
        quota="月400枚"
        childrenCount="子ども 3人"
        onPress={busy ? undefined : () => void buy(offerings.family.productId, "ファミリー")}
      />

      <Text className="mt-8 text-lg font-bold text-ink">追加スキャンチケット</Text>
      <Text className="mt-1 text-sm text-ink/70">有料会員のみ。使い切った月の上乗せ用です。</Text>
      {Object.entries(SCAN_TICKET_PRODUCTS).map(([productId, product]) => (
        <Pressable
          key={productId}
          className={`mt-3 rounded-2xl bg-white px-4 py-4 ${quota.canBuyTickets ? "" : "opacity-50"}`}
          disabled={busy || !quota.canBuyTickets}
          onPress={() => void buy(productId, `${product.ticketCount}枚チケット`)}
        >
          <Text className="font-bold text-ink">
            {product.ticketCount}枚 / ¥{product.priceJpy}
          </Text>
          {!quota.canBuyTickets ? (
            <Text className="mt-1 text-xs text-maru-600">スタンダードまたはファミリーで購入できます</Text>
          ) : (
            <Text className="mt-1 text-xs text-ink/60">購入するとすぐ残数に加算されます</Text>
          )}
        </Pressable>
      ))}

      <Pressable className="mt-6 rounded-2xl bg-white px-4 py-4" disabled={busy} onPress={() => void onRestore()}>
        <Text className="text-center font-bold text-ink">購入の復元</Text>
      </Pressable>
      <Text className="mb-10 mt-3 text-center text-xs text-ink/50">
        定期購入の解約は App Store / Google Play の定期購入管理から行います。
      </Text>
    </ScrollView>
  );
}
