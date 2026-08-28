import { Alert, Modal, Pressable, Text, View } from "react-native";
import { useState } from "react";
import { deleteScanRecord, reassignScanChild } from "@/src/features/scans/manageScan";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import type { ScanRecord } from "@/src/stores/scanStore";
import { t } from "@/src/i18n";

export function useScanPrintActions(scan: ScanRecord, onDeleted?: () => void) {
  const { children, currentChildId } = useCurrentChild();
  const [childOpen, setChildOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const otherChildren = children.filter((child) => child.id !== scan.childId);

  function confirmDelete() {
    Alert.alert(t("scan.delete"), t("scan.deleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("scan.deleteAction"),
        style: "destructive",
        onPress: () => void runDelete(),
      },
    ]);
  }

  async function runDelete() {
    setBusy(true);
    try {
      await deleteScanRecord(scan);
      onDeleted?.();
    } catch (error) {
      Alert.alert(t("scan.deleteFailed"), error instanceof Error ? error.message : t("common.unknown"));
    } finally {
      setBusy(false);
    }
  }

  async function pickChild(childId: string) {
    setBusy(true);
    try {
      await reassignScanChild(scan, childId);
      setChildOpen(false);
    } catch (error) {
      Alert.alert(t("scan.reassignFailed"), error instanceof Error ? error.message : t("common.unknown"));
    } finally {
      setBusy(false);
    }
  }

  function openMenu() {
    if (busy) return;
    const buttons: Array<{ text: string; style?: "cancel" | "destructive"; onPress?: () => void }> = [];
    if (otherChildren.length > 0) {
      buttons.push({ text: t("scan.reassign"), onPress: () => setChildOpen(true) });
    }
    buttons.push({ text: t("scan.delete"), style: "destructive", onPress: confirmDelete });
    buttons.push({ text: t("common.cancel"), style: "cancel" });
    Alert.alert(t("scan.menuTitle"), undefined, buttons);
  }

  const childSheet = (
    <Modal visible={childOpen} animationType="slide" transparent onRequestClose={() => setChildOpen(false)}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={() => setChildOpen(false)} accessibilityLabel={t("common.close")} />
        <View className="rounded-t-3xl bg-cream px-5 pb-8 pt-4">
          <View className="mb-3 h-1 w-12 self-center rounded-full bg-ink/20" />
          <Text className="text-lg font-bold text-ink">{t("scan.reassign")}</Text>
          <Text className="mt-1 text-sm text-ink/60">{t("scan.reassignHint")}</Text>
          {otherChildren.map((child) => (
            <Pressable
              key={child.id}
              className="mt-2 rounded-2xl bg-white px-4 py-3"
              disabled={busy}
              onPress={() => void pickChild(child.id)}
            >
              <Text className="text-base font-semibold text-ink">
                {child.name}
                {child.id === currentChildId ? t("scan.currentChild") : ""}
              </Text>
            </Pressable>
          ))}
          <Pressable className="mt-4 rounded-xl bg-ink py-3" onPress={() => setChildOpen(false)}>
            <Text className="text-center font-semibold text-white">{t("common.close")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );

  return { openMenu, confirmDelete, openChildPicker: () => setChildOpen(true), busy, otherChildren, childSheet };
}

export function ScanPrintMenuButton({
  openMenu,
  compact = false,
  busy = false,
  tone = "overlay",
}: {
  openMenu: () => void;
  compact?: boolean;
  busy?: boolean;
  tone?: "overlay" | "light";
}) {
  const overlay = tone === "overlay";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("scan.menuA11y")}
      hitSlop={10}
      disabled={busy}
      onPress={openMenu}
      className={`items-center justify-center rounded-full ${
        overlay ? "bg-black/45" : "bg-ink/10"
      } ${compact ? "h-7 w-7" : "h-9 w-9"}`}
    >
      <Text className={`font-bold ${overlay ? "text-white" : "text-ink"} ${compact ? "text-sm" : "text-base"}`}>
        ⋯
      </Text>
    </Pressable>
  );
}
