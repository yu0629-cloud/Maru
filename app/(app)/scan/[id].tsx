import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { back, push, replace } from "@/src/lib/nav/href";
import { AnalyzingOverlay } from "@/src/components/AnalyzingOverlay";
import { ExpiredMediaNotice } from "@/src/components/ExpiredMediaNotice";
import { GradingPhotoOverlay, ProblemDetailSheet } from "@/src/components/GradingPhotoOverlay";
import { SafeMediaImage } from "@/src/components/SafeMediaImage";
import { ScanPrintMenuButton, useScanPrintActions } from "@/src/components/ScanPrintMenu";
import { SubjectTag } from "@/src/components/SubjectTag";
import {
  displayCoachingTip,
  recountScore,
  toggleProblemCorrect,
} from "@/src/features/grading/corrections";
import { confirmScanCorrections } from "@/src/features/grading/service";
import { hydrateScanById } from "@/src/features/storage/hydrate-scans";
import { useScanPhotoUri } from "@/src/features/storage/useScanPhotoUri";
import { useCurrentBatchJobs } from "@/src/stores/scanQueueStore";
import { t, tMistake } from "@/src/i18n";
import { useGradeResultLabel } from "@/src/components/GradeMark";
import { useScanStore, type ScanRecord } from "@/src/stores/scanStore";

export default function ScanDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const stored = useScanStore((state) => (id ? state.scans[id] : undefined));
  const batchJobs = useCurrentBatchJobs();
  const [hydrating, setHydrating] = useState<boolean>(true);
  useEffect(() => {
    if (!id) {
      setHydrating(false);
      return;
    }
    if (useScanStore.getState().scans[id]) {
      setHydrating(false);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    void hydrateScanById(id)
      .catch((error) => {
        console.warn("[scan] hydrateScanById", error);
      })
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  const fromParam = Array.isArray(from) ? from[0] : from;
  const fromBatch = fromParam === "batch";
  const fromHistory = fromParam === "history";
  const completedJobs = batchJobs.filter((job) => job.status === "completed" && job.scanId);
  const batchIndex = completedJobs.findIndex((job) => job.scanId === id);
  const prevScanId = batchIndex > 0 ? completedJobs[batchIndex - 1]?.scanId : undefined;
  const nextScanId = batchIndex >= 0 ? completedJobs[batchIndex + 1]?.scanId : undefined;

  if (!stored) {
    return (
      <View className="flex-1 items-center justify-center bg-cream px-5">
        <Text className="text-ink">
          {hydrating ? t("scan.loading") : t("scan.notFound")}
        </Text>
      </View>
    );
  }

  return (
    <ScanDetailBody
      scan={stored}
      fromBatch={fromBatch}
      fromHistory={fromHistory}
      prevScanId={prevScanId}
      nextScanId={nextScanId}
    />
  );
}

function ScanDetailBody({
  scan,
  fromBatch,
  fromHistory,
  prevScanId,
  nextScanId,
}: {
  scan: ScanRecord;
  fromBatch: boolean;
  fromHistory: boolean;
  prevScanId?: string;
  nextScanId?: string;
}) {
  const updateProblems = useScanStore((state) => state.updateProblems);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photoGesturing, setPhotoGesturing] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const savingRef = useRef(false);
  const score = useMemo(() => recountScore(scan.problems), [scan]);
  const { uri: photoUri, expired: photoExpired } = useScanPhotoUri(scan);
  const { openMenu, confirmDelete, openChildPicker, otherChildren, childSheet, busy: menuBusy } =
    useScanPrintActions(scan, () => {
      if (fromHistory) push("/(app)/scans");
      else back();
    });
  const selected = selectedId ? (scan.problems.find((problem) => problem.id === selectedId) ?? null) : null;
  const showExpiredPhoto = photoFailed || photoExpired;

  useEffect(() => {
    setPhotoFailed(false);
  }, [scan.id, photoUri]);

  const flip = (problemId: string) => {
    const next = scan.problems.map((problem) =>
      problem.id === problemId ? toggleProblemCorrect(problem) : problem,
    );
    updateProblems(scan.id, next, recountScore(next));
  };

  const confirm = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await confirmScanCorrections({
        id: scan.id,
        childId: scan.childId,
        status: scan.status,
        localUri: scan.localUri,
        overall_score: score,
        problems: scan.problems,
        confirmed: scan.confirmed,
      });
      const buttons = fromBatch
        ? [
            ...(nextScanId
              ? [{ text: t("scan.nextPrint"), onPress: () => replace(`/(app)/scan/${nextScanId}?from=batch`) }]
              : []),
            { text: t("scan.toList"), onPress: () => push("/(app)/scan/batch") },
            { text: t("common.close") },
          ]
        : fromHistory
          ? [
              { text: t("scan.backToHistory"), onPress: () => push("/(app)/scans") },
              { text: t("scan.viewCarte"), onPress: () => push("/(app)/carte") },
              { text: t("common.close") },
            ]
          : [
              { text: t("scan.viewCarte"), onPress: () => push("/(app)/carte") },
              { text: t("common.close") },
            ];
      Alert.alert(t("scan.savedTitle"), t("scan.savedBody"), buttons);
    } catch (error) {
      Alert.alert(t("scan.saveFailed"), error instanceof Error ? error.message : t("common.unknown"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-cream">
      <ScrollView className="px-5 pt-4" scrollEnabled={!photoGesturing}>
        {fromHistory ? (
          <View className="mb-3 flex-row">
            <Pressable className="mr-2 rounded-xl bg-white px-3 py-2" onPress={() => push("/(app)/scans")}>
              <Text className="font-semibold text-ink">{t("scan.backToHistory")}</Text>
            </Pressable>
            <Pressable className="rounded-xl bg-white px-3 py-2" onPress={() => push("/(app)/carte")}>
              <Text className="font-semibold text-ink">{t("scan.carte")}</Text>
            </Pressable>
          </View>
        ) : fromBatch ? (
          <View className="mb-3 flex-row">
            <Pressable className="mr-2 rounded-xl bg-white px-3 py-2" onPress={() => push("/(app)/scan/batch")}>
              <Text className="font-semibold text-ink">{t("scan.list")}</Text>
            </Pressable>
            <Pressable
              className={`mr-2 rounded-xl px-3 py-2 ${prevScanId ? "bg-white" : "bg-white/50"}`}
              disabled={!prevScanId}
              onPress={() => prevScanId && replace(`/(app)/scan/${prevScanId}?from=batch`)}
            >
              <Text className="font-semibold text-ink">{t("common.prev")}</Text>
            </Pressable>
            <Pressable
              className={`rounded-xl px-3 py-2 ${nextScanId ? "bg-white" : "bg-white/50"}`}
              disabled={!nextScanId}
              onPress={() => nextScanId && replace(`/(app)/scan/${nextScanId}?from=batch`)}
            >
              <Text className="font-semibold text-ink">{t("common.next")}</Text>
            </Pressable>
          </View>
        ) : null}
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 text-2xl font-bold text-ink">
            {showExpiredPhoto && !scan.isDemo ? t("scan.textRecord") : t("scan.resultTitle")}
          </Text>
          <View className="flex-row items-center gap-2">
            <SubjectTag subject={scan.subject} scan={scan} />
            <ScanPrintMenuButton openMenu={openMenu} tone="light" busy={menuBusy} />
          </View>
        </View>
        {scan.isDemo ? (
          <Text className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-ink">
            {t("scan.demoNotice")}
          </Text>
        ) : null}
        <Text className="mt-1 text-ink/70">
          {t("common.points", { earned: score.earned, max: score.max })}
          {showExpiredPhoto && !scan.isDemo ? t("scan.expiredHint") : t("scan.pinchHint")}
        </Text>

        {photoUri && !photoFailed ? (
          <GradingPhotoOverlay
            uri={photoUri}
            problems={scan.problems}
            onPressProblem={(problem) => setSelectedId(problem.id)}
            onGestureActive={setPhotoGesturing}
            onUnavailable={() => setPhotoFailed(true)}
          />
        ) : showExpiredPhoto && !scan.isDemo ? (
          <ExpiredMediaNotice />
        ) : null}

        {scan.problems.map((problem) => {
          const coachingTip = displayCoachingTip(problem.is_correct, problem.parent_coaching_tip);
          return (
            <View key={problem.id} className="mt-4 rounded-2xl bg-white p-4">
              <View className="flex-row items-center justify-between">
                <Text className="font-bold text-ink">{t("common.question", { label: problem.problem_label })}</Text>
                <Pressable
                  onPress={() => flip(problem.id)}
                  className={`rounded-full px-3 py-1 ${problem.is_correct ? "bg-emerald-600" : "bg-maru-500"}`}
                >
                  <ScanResultLabel isCorrect={problem.is_correct} />
                </Pressable>
              </View>
              <Text className="mt-1 text-xs text-ink/60">
                {problem.topic_tag}　／　{tMistake(problem.mistake_type)}
              </Text>
              {problem.question_text ? (
                <Text className="mt-2 text-base font-semibold text-ink">{problem.question_text}</Text>
              ) : null}
              {problem.imageSrc ? (
                <SafeMediaImage
                  uri={problem.imageSrc}
                  className="mt-3 h-28 w-full rounded-lg bg-cream"
                  resizeMode="contain"
                />
              ) : null}
              {coachingTip ? (
                <Text className="mt-3 text-sm leading-5 text-ink/80">{coachingTip}</Text>
              ) : null}
              <Text className="mt-2 text-xs text-ink/50">
                {t("scan.studentAnswer", { answer: problem.student_answer || t("common.none") })}
              </Text>
            </View>
          );
        })}

        <Pressable className="mt-6 rounded-xl bg-ink py-3" disabled={saving} onPress={() => void confirm()}>
          <Text className="text-center font-semibold text-white">{t("scan.confirmUpdate")}</Text>
        </Pressable>
        {otherChildren.length > 0 ? (
          <Pressable className="mt-3 rounded-xl bg-white py-3" disabled={menuBusy} onPress={openChildPicker}>
            <Text className="text-center font-semibold text-ink">{t("scan.reassign")}</Text>
          </Pressable>
        ) : null}
        <Pressable className="mt-3 mb-10 rounded-xl bg-white py-3" disabled={menuBusy} onPress={confirmDelete}>
          <Text className="text-center font-semibold text-maru-600">{t("scan.delete")}</Text>
        </Pressable>
        {childSheet}
      </ScrollView>
      <ProblemDetailSheet
        problem={selected}
        onClose={() => setSelectedId(null)}
        onToggle={() => {
          if (selected) flip(selected.id);
        }}
      />
      <AnalyzingOverlay visible={saving} label={t("scan.updating")} />
    </View>
  );
}

function ScanResultLabel({ isCorrect }: { isCorrect: boolean }) {
  const label = useGradeResultLabel(isCorrect);
  return <Text className="font-bold text-white">{label}</Text>;
}
