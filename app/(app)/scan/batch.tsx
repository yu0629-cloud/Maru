import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { push } from "@/src/lib/nav/href";
import { ChildScoped } from "@/src/components/ChildScoped";
import { ScanSweep } from "@/src/components/ScanSweep";
import { retryScanJob } from "@/src/features/grading/batch-queue";
import { useScanPhotoUri } from "@/src/features/storage/useScanPhotoUri";
import { isPreviewableScanUri, toFileUri } from "@/src/lib/files/scan-image";
import { useCurrentBatchJobs, type ScanQueueJob } from "@/src/stores/scanQueueStore";
import { useScanStore } from "@/src/stores/scanStore";
import { t } from "@/src/i18n";

export default function BatchResultsScreen() {
  return (
    <ChildScoped>
      <BatchResultsBody />
    </ChildScoped>
  );
}

function statusLabel(job: ScanQueueJob, score?: { earned: number; max: number }) {
  if (job.status === "queued" || job.status === "running") return t("camera.analyzing");
  if (job.status === "failed") return t("camera.failed");
  if (score) return t("common.points", { earned: score.earned, max: score.max });
  return t("common.done");
}

function BatchJobThumb({ job, index }: { job: ScanQueueJob; index: number }) {
  const scan = useScanStore((state) => (job.scanId ? state.scans[job.scanId] : undefined));
  const { uri: resolved } = useScanPhotoUri({
    localUri: job.uri,
    originalStoragePath: scan?.originalStoragePath,
    originalPurgedAt: scan?.originalPurgedAt,
    isDemo: scan?.isDemo,
  });
  const uri = resolved ?? (isPreviewableScanUri(job.uri) ? toFileUri(job.uri) : undefined);
  if (!uri) {
    return (
      <View className="h-16 w-12 items-center justify-center rounded-lg bg-cream">
        <Text className="text-lg font-bold text-ink">{index + 1}</Text>
      </View>
    );
  }
  return (
    <View className="h-16 w-12 overflow-hidden rounded-lg bg-cream">
      <Image source={{ uri }} className="h-16 w-12" resizeMode="cover" />
      <ScanSweep active={job.status === "queued" || job.status === "running"} compact />
    </View>
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
        <Text className="text-2xl font-bold text-ink">{t("batch.title")}</Text>
        <Text className="mt-1 text-ink/70">
          {jobs.length === 0
            ? t("batch.empty")
            : `${t("batch.progress", { done: completed, total: jobs.length })}${
                pending > 0 ? t("batch.pending", { count: pending }) : ""
              }${failed > 0 ? t("batch.failedCount", { count: failed }) : ""}`}
        </Text>
        {pending > 0 ? (
          <Text className="mt-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-ink">
            {t("batch.pendingNotice")}
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
                push(`/(app)/scan/${job.scanId}?from=batch`);
              }}
              className="mt-3 flex-row items-center rounded-2xl bg-white p-3"
            >
              <BatchJobThumb job={job} index={index} />
              <View className="ml-3 flex-1">
                <Text className="font-bold text-ink">{t("camera.printN", { n: index + 1 })}</Text>
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
                  <Text className="text-sm font-semibold text-white">{t("common.retry")}</Text>
                </Pressable>
              ) : openable ? (
                <Text className="text-sm font-semibold text-maru-500">{t("camera.confirm")}</Text>
              ) : (
                <Text className="text-sm text-ink/40">{t("camera.waiting")}</Text>
              )}
            </Pressable>
          );
        })}

        <Pressable
          className="mt-6 rounded-xl bg-maru-500 py-3"
          onPress={() => push("/(app)/camera")}
        >
          <Text className="text-center font-semibold text-white">{t("batch.continueScan")}</Text>
        </Pressable>
        <Pressable className="mt-3 mb-10 rounded-xl bg-white py-3" onPress={() => push("/(app)")}>
          <Text className="text-center font-semibold text-ink">{t("batch.toHome")}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
