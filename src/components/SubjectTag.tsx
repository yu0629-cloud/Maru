import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import {
  SUBJECT_CODES,
  normalizeSubject,
  type SubjectCode,
} from "@/src/features/scans/subject";
import { updateScanSubject } from "@/src/features/scans/updateSubject";
import type { ScanRecord } from "@/src/stores/scanStore";
import { t, tSubjectBadge } from "@/src/i18n";

export type SubjectTagProps = {
  subject?: SubjectCode | string | null;
  scan?: Pick<ScanRecord, "id" | "childId" | "isDemo">;
  compact?: boolean;
};

export function SubjectTag({ subject, scan, compact = false }: SubjectTagProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const editable = Boolean(scan);

  async function pick(code: SubjectCode) {
    if (!scan) return;
    setBusy(true);
    try {
      await updateScanSubject(scan, code);
      setOpen(false);
    } catch (error) {
      Alert.alert(t("subjectTag.updateFailed"), error instanceof Error ? error.message : t("common.unknown"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole={editable ? "button" : undefined}
        accessibilityLabel={t("subjectTag.a11y", { subject: tSubjectBadge(subject) })}
        disabled={!editable}
        hitSlop={8}
        onPress={() => setOpen(true)}
        className={`rounded-full px-2 py-1 ${compact ? "bg-cream" : "bg-white px-2.5"}`}
      >
        <Text className={`font-semibold text-ink ${compact ? "text-[10px]" : "text-xs"}`}>
          {tSubjectBadge(subject)}
        </Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <Pressable className="flex-1" onPress={() => setOpen(false)} accessibilityLabel={t("common.close")} />
          <View className="rounded-t-3xl bg-cream px-5 pb-8 pt-4">
            <View className="mb-3 h-1 w-12 self-center rounded-full bg-ink/20" />
            <Text className="text-lg font-bold text-ink">{t("subjectTag.pickTitle")}</Text>
            <Text className="mt-1 text-sm text-ink/60">{t("subjectTag.pickHint")}</Text>
            <ScrollView className="mt-1 max-h-[70%]" keyboardShouldPersistTaps="handled">
            {SUBJECT_CODES.map((code) => {
              const selected = (normalizeSubject(subject) ?? "other") === code;
              return (
                <Pressable
                  key={code}
                  className={`mt-2 rounded-2xl px-4 py-3 ${selected ? "bg-maru-500" : "bg-white"}`}
                  disabled={busy}
                  onPress={() => void pick(code)}
                >
                  <Text className={`text-base font-semibold ${selected ? "text-white" : "text-ink"}`}>
                    {tSubjectBadge(code)}
                  </Text>
                </Pressable>
              );
            })}
            </ScrollView>
            <Pressable className="mt-4 rounded-xl bg-ink py-3" onPress={() => setOpen(false)}>
              <Text className="text-center font-semibold text-white">{t("common.close")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}
