import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { ScanSweep } from "@/src/components/ScanSweep";
import { useScanPhotoUri } from "@/src/features/storage/useScanPhotoUri";
import { isPreviewableScanUri, toFileUri } from "@/src/lib/files/scan-image";
import type { ScanQueueJob } from "@/src/stores/scanQueueStore";
import { useScanStore } from "@/src/stores/scanStore";
import { t } from "@/src/i18n";

function jobStatusLabel(job: ScanQueueJob) {
  if (job.status === "queued" || job.status === "running") return t("camera.analyzing");
  if (job.status === "failed") return t("camera.failed");
  return t("camera.graded");
}

function DocumentHint() {
  return (
    <View className="relative h-28 w-28 items-center justify-center rounded-3xl bg-white">
      <View className="h-16 w-12 rounded-md border-2 border-maru-500">
        <View className="mt-2 mx-1.5 h-1 rounded-full bg-maru-500/40" />
        <View className="mt-1.5 mx-1.5 h-1 rounded-full bg-maru-500/25" />
        <View className="mt-1.5 mx-1.5 h-1 w-1/2 rounded-full bg-maru-500/25" />
      </View>
      <View className="absolute bottom-5 right-5 h-8 w-10 items-center rounded-md bg-maru-500 pt-1">
        <View className="h-3 w-3 rounded-full border-2 border-white" />
      </View>
    </View>
  );
}

function JobThumb({ job, index }: { job: ScanQueueJob; index: number }) {
  const scan = useScanStore((state) => (job.scanId ? state.scans[job.scanId] : undefined));
  const { uri: resolved } = useScanPhotoUri({
    localUri: job.uri,
    originalStoragePath: scan?.originalStoragePath,
    originalPurgedAt: scan?.originalPurgedAt,
    isDemo: scan?.isDemo,
  });
  const uri = resolved ?? (isPreviewableScanUri(job.uri) ? toFileUri(job.uri) : undefined);
  const analyzing = job.status === "queued" || job.status === "running";
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
      <ScanSweep active={analyzing} compact />
    </View>
  );
}

export function ScanCaptureStage({
  jobs,
  webDemo,
  onOpenJob,
}: {
  jobs: ScanQueueJob[];
  webDemo?: boolean;
  onOpenJob: (job: ScanQueueJob) => void;
}) {
  if (jobs.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <DocumentHint />
        <Text className="mt-6 text-center text-lg font-bold text-ink">{t("camera.holdTitle")}</Text>
        <Text className="mt-2 text-center text-base leading-6 text-ink/70">
          {t("camera.autoHint")}
        </Text>
        {webDemo ? (
          <Text className="mt-3 text-center text-sm text-ink/50">{t("camera.webDemo")}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 16 }}>
      {jobs.map((job, index) => {
        const openable = job.status === "completed" && Boolean(job.scanId);
        return (
          <Pressable
            key={job.id}
            className="mt-3 flex-row items-center rounded-2xl bg-white p-3"
            onPress={() => onOpenJob(job)}
          >
            <JobThumb job={job} index={index} />
            <View className="ml-3 flex-1">
              <Text className="font-bold text-ink">{t("camera.printN", { n: index + 1 })}</Text>
              <Text className={`mt-1 text-sm ${job.status === "failed" ? "text-maru-500" : "text-ink/70"}`}>
                {jobStatusLabel(job)}
              </Text>
            </View>
            <Text className={`text-sm font-semibold ${openable ? "text-maru-500" : "text-ink/40"}`}>
              {openable ? t("camera.confirm") : job.status === "failed" ? "—" : t("camera.waiting")}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
