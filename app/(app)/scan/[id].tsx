import { useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AnalyzingOverlay } from "@/src/components/AnalyzingOverlay";
import {
  displayCoachingTip,
  MISTAKE_LABELS,
  recountScore,
  toggleProblemCorrect,
} from "@/src/features/grading/corrections";
import { GradingPhotoOverlay, ProblemDetailSheet } from "@/src/components/GradingPhotoOverlay";
import { confirmScanCorrections } from "@/src/features/grading/service";
import { useCurrentBatchJobs } from "@/src/stores/scanQueueStore";
import { useScanStore } from "@/src/stores/scanStore";

function canPreviewUri(uri?: string) {
  if (!uri) return false;
  return (
    uri.startsWith("file:") ||
    uri.startsWith("content:") ||
    uri.startsWith("http") ||
    uri.startsWith("ph://") ||
    uri.startsWith("assets-library:")
  );
}

export default function ScanDetailScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const stored = useScanStore((state) => (id ? state.scans[id] : undefined));
  const updateProblems = useScanStore((state) => state.updateProblems);
  const batchJobs = useCurrentBatchJobs();
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photoGesturing, setPhotoGesturing] = useState(false);
  const savingRef = useRef(false);
  const fromParam = Array.isArray(from) ? from[0] : from;
  const fromBatch = fromParam === "batch";
  const completedJobs = batchJobs.filter((job) => job.status === "completed" && job.scanId);
  const batchIndex = completedJobs.findIndex((job) => job.scanId === id);
  const prevScanId = batchIndex > 0 ? completedJobs[batchIndex - 1]?.scanId : undefined;
  const nextScanId = batchIndex >= 0 ? completedJobs[batchIndex + 1]?.scanId : undefined;

  const scan = stored;
  const score = useMemo(() => (scan ? recountScore(scan.problems) : { earned: 0, max: 0 }), [scan]);

  if (!scan) {
    return (
      <View className="flex-1 items-center justify-center bg-cream px-5">
        <Text className="text-ink">スキャンが見つかりません。撮影画面からやり直してください。</Text>
      </View>
    );
  }

  const current = scan;
  const selected = selectedId ? (current.problems.find((problem) => problem.id === selectedId) ?? null) : null;
  const photoUri =
    !current.isDemo && current.localUri && canPreviewUri(current.localUri) ? current.localUri : undefined;

  const flip = (problemId: string) => {
    const next = current.problems.map((problem) =>
      problem.id === problemId ? toggleProblemCorrect(problem) : problem,
    );
    updateProblems(current.id, next, recountScore(next));
  };

  const confirm = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await confirmScanCorrections({
        id: current.id,
        childId: current.childId,
        status: current.status,
        localUri: current.localUri,
        overall_score: score,
        problems: current.problems,
        confirmed: current.confirmed,
      });
      const buttons = fromBatch
        ? [
            ...(nextScanId
              ? [{ text: "次のプリント", onPress: () => router.replace(`/(app)/scan/${nextScanId}?from=batch`) }]
              : []),
            { text: "一覧へ", onPress: () => router.push("/(app)/scan/batch") },
            { text: "閉じる" },
          ]
        : [
            { text: "カルテを見る", onPress: () => router.push("/(app)/carte") },
            { text: "閉じる" },
          ];
      Alert.alert("保存しました", "不正解の白紙化とカルテ更新を開始しました。", buttons);
    } catch (error) {
      Alert.alert("保存に失敗しました", error instanceof Error ? error.message : "unknown");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-cream">
      <ScrollView className="px-5 pt-4" scrollEnabled={!photoGesturing}>
        {fromBatch ? (
          <View className="mb-3 flex-row">
            <Pressable className="mr-2 rounded-xl bg-white px-3 py-2" onPress={() => router.push("/(app)/scan/batch")}>
              <Text className="font-semibold text-ink">一覧</Text>
            </Pressable>
            <Pressable
              className={`mr-2 rounded-xl px-3 py-2 ${prevScanId ? "bg-white" : "bg-white/50"}`}
              disabled={!prevScanId}
              onPress={() => prevScanId && router.replace(`/(app)/scan/${prevScanId}?from=batch`)}
            >
              <Text className="font-semibold text-ink">前へ</Text>
            </Pressable>
            <Pressable
              className={`rounded-xl px-3 py-2 ${nextScanId ? "bg-white" : "bg-white/50"}`}
              disabled={!nextScanId}
              onPress={() => nextScanId && router.replace(`/(app)/scan/${nextScanId}?from=batch`)}
            >
              <Text className="font-semibold text-ink">次へ</Text>
            </Pressable>
          </View>
        ) : null}
        <Text className="text-2xl font-bold text-ink">丸付け結果</Text>
        {scan.isDemo ? (
          <Text className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-ink">
            見本の採点です。撮ったプリント（足し算など）の内容ではありません。
          </Text>
        ) : null}
        <Text className="mt-1 text-ink/70">
          {score.earned} / {score.max} 点　ピンチで拡大、マークをタップして〇✕を修正できます
        </Text>

        {photoUri ? (
          <GradingPhotoOverlay
            uri={photoUri}
            problems={current.problems}
            onPressProblem={(problem) => setSelectedId(problem.id)}
            onGestureActive={setPhotoGesturing}
          />
        ) : null}

        {scan.problems.map((problem) => {
          const coachingTip = displayCoachingTip(problem.is_correct, problem.parent_coaching_tip);
          return (
          <View key={problem.id} className="mt-4 rounded-2xl bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="font-bold text-ink">問 {problem.problem_label}</Text>
              <Pressable
                onPress={() => flip(problem.id)}
                className={`rounded-full px-3 py-1 ${problem.is_correct ? "bg-emerald-600" : "bg-maru-500"}`}
              >
                <Text className="font-bold text-white">{problem.is_correct ? "〇 正解" : "✕ 不正解"}</Text>
              </Pressable>
            </View>
            <Text className="mt-1 text-xs text-ink/60">
              {problem.topic_tag}　／　{MISTAKE_LABELS[problem.mistake_type]}
            </Text>
            {problem.imageSrc ? (
              <Image source={{ uri: problem.imageSrc }} className="mt-3 h-28 w-full rounded-lg bg-cream" resizeMode="contain" />
            ) : null}
            {coachingTip ? (
              <Text className="mt-3 text-sm leading-5 text-ink/80">{coachingTip}</Text>
            ) : null}
            <Text className="mt-2 text-xs text-ink/50">生徒の解答: {problem.student_answer || "（なし）"}</Text>
          </View>
          );
        })}

        <Pressable
          className="mt-6 mb-10 rounded-xl bg-ink py-3"
          disabled={saving}
          onPress={() => void confirm()}
        >
          <Text className="text-center font-semibold text-white">修正を確定してカルテを更新</Text>
        </Pressable>
      </ScrollView>
      <ProblemDetailSheet
        problem={selected}
        onClose={() => setSelectedId(null)}
        onToggle={() => {
          if (selected) flip(selected.id);
        }}
      />
      <AnalyzingOverlay visible={saving} label="カルテと白紙化を更新しています…" />
    </View>
  );
}
