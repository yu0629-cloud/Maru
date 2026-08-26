import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { ChildScoped } from "@/src/components/ChildScoped";
import { ScanSweep } from "@/src/components/ScanSweep";
import { retryScanJob } from "@/src/features/grading/batch-queue";
import { useCurrentBatchJobs, type ScanQueueJob } from "@/src/stores/scanQueueStore";
import { useScanStore } from "@/src/stores/scanStore";

export default function BatchResultsScreen() {
  return (
    <ChildScoped>
      <BatchResultsBody />
    </ChildScoped>
  );
}

function statusLabel(job: ScanQueueJob, score?: { earned: number; max: number }) {
  if (job.status === "queued" || job.status === "running") return "解析中…";
  if (job.status === "failed") return "失敗";
  if (score) return `${score.earned} / ${score.max} 点`;
  return "完了";
}

function canPreviewUri(uri: string) {
  return (
    uri.startsWith("file:") ||
    uri.startsWith("content:") ||
    uri.startsWith("http") ||
    uri.startsWith("ph://") ||
    uri.startsWith("assets-library:")
  );
}

function BatchResultsBody() {
  const jobs = useCurrentBatchJobs();
  const scans = useScanStore((state) => state.scans);
  const completed = jobs.filter((job) => job.status === "completed").length;
  const pending = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const failed = jobs.filter((job) => job.status === "failed").length;

  return (
    <View className="flex-1 bg-cream">
      <ScrollView className="px-5 pt-4">
        <Text className="text-2xl font-bold text-ink">一括確認</Text>
        <Text className="mt-1 text-ink/70">
          {jobs.length === 0
            ? "この束のプリントはまだありません"
            : `${completed} / ${jobs.length} 枚 採点済み${pending > 0 ? ` ／ ${pending}枚 解析中` : ""}${failed > 0 ? ` ／ ${failed}枚 失敗` : ""}`}
        </Text>
        {pending > 0 ? (
          <Text className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-ink">
            まだ解析中のプリントがあります。終わったものから先に確認できます。
          </Text>
        ) : null}

        {jobs.map((job, index) => {
          const scan = job.scanId ? scans[job.scanId] : undefined;
          const score = scan?.overall_score;
          const openable = job.status === "completed" && Boolean(job.scanId);
          return (
            <Pressable
              key={job.id}
              disabled={!openable}
              onPress={() => {
                if (!job.scanId) return;
                router.push(`/(app)/scan/${job.scanId}?from=batch`);
              }}
              className="mt-3 flex-row items-center rounded-2xl bg-white p-3"
            >
              {canPreviewUri(job.uri) ? (
                <View className="h-16 w-12 overflow-hidden rounded-lg bg-cream">
                  <Image source={{ uri: job.uri }} className="h-16 w-12" resizeMode="cover" />
                  <ScanSweep
                    active={job.status === "queued" || job.status === "running"}
                    compact
                  />
                </View>
              ) : (
                <View className="h-16 w-12 items-center justify-center rounded-lg bg-cream">
                  <Text className="text-lg font-bold text-ink">{index + 1}</Text>
                </View>
              )}
              <View className="ml-3 flex-1">
                <Text className="font-bold text-ink">プリント {index + 1}</Text>
                <Text className="mt-1 text-sm text-ink/70">{statusLabel(job, score)}</Text>
                {job.status === "failed" && job.error ? (
                  <Text className="mt-1 text-xs text-maru-500" numberOfLines={2}>
                    {job.error}
                  </Text>
                ) : null}
              </View>
              {job.status === "failed" ? (
                <Pressable
                  className="rounded-xl bg-maru-500 px-3 py-2"
                  onPress={() => retryScanJob(job.id)}
                >
                  <Text className="text-sm font-semibold text-white">再試行</Text>
                </Pressable>
              ) : openable ? (
                <Text className="text-sm font-semibold text-maru-500">確認</Text>
              ) : (
                <Text className="text-sm text-ink/40">待ち</Text>
              )}
            </Pressable>
          );
        })}

        <Pressable
          className="mt-6 rounded-xl bg-maru-500 py-3"
          onPress={() => router.push("/(app)/camera")}
        >
          <Text className="text-center font-semibold text-white">続けて撮影</Text>
        </Pressable>
        <Pressable className="mt-3 mb-10 rounded-xl bg-white py-3" onPress={() => router.push("/(app)")}>
          <Text className="text-center font-semibold text-ink">ホームへ</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
