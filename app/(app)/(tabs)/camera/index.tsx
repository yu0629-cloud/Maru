import { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { push } from "@/src/lib/nav/href";
import { useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { QuotaBadge } from "@/src/components/QuotaBadge";
import { ScanCaptureStage } from "@/src/components/ScanCaptureStage";
import { ChildScoped } from "@/src/components/ChildScoped";
import { enqueueScanJob } from "@/src/features/grading/batch-queue";
import { useCurrentBatchJobs, type ScanQueueJob } from "@/src/stores/scanQueueStore";
import { maruLog } from "@/src/lib/debug/maruLog";
import { ensureAtLeastOneChild } from "@/src/features/children/service";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";
import { useQuota } from "@/src/hooks/useQuota";
import { persistScanImage, SCAN_CAPTURE_QUALITY } from "@/src/lib/files/scan-image";
import {
  DocumentScanCancelledError,
  DocumentScanUnavailableError,
  canUseNativeDocumentScanner,
  scanPaperDocuments,
} from "@/src/lib/scan/document-scanner";
import { t } from "@/src/i18n";

const TAP_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

export default function CameraScreen() {
  return (
    <ChildScoped>
      <CameraBody />
    </ChildScoped>
  );
}

function CameraBody() {
  useEnsureDemoChild();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState<"camera" | "library" | null>(null);
  const capturingRef = useRef(false);
  const quota = useQuota();
  const { currentChild } = useCurrentChild();
  const liveCamera = Platform.OS !== "web";
  const batchJobs = useCurrentBatchJobs();
  const capturedCount = batchJobs.length;
  const analyzingCount = batchJobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const allGraded = capturedCount > 0 && batchJobs.every((job) => job.status === "completed");
  const actionLabel = allGraded ? t("camera.reviewList") : t("camera.gradeBatch");

  useEffect(() => {
    if (!liveCamera) return;
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [liveCamera, permission, requestPermission]);

  function ensureQuota(count = 1) {
    if (quota.remaining < count) {
      Alert.alert(
        t("camera.quotaEmptyTitle"),
        quota.tier === "free" ? t("billing.freeCarryover") : t("billing.paidExhausted"),
        [
        { text: t("camera.plan"), onPress: () => push("/(app)/settings/billing") },
        { text: t("common.close"), style: "cancel" },
      ]);
      return false;
    }
    return true;
  }

  async function resolveChild() {
    const child = currentChild ?? (await ensureAtLeastOneChild());
    if (!child?.id || !child.parent_id) {
      Alert.alert(t("camera.noChildTitle"), t("camera.noChildBody"), [
        { text: t("common.close"), style: "cancel" },
        { text: t("child.register"), onPress: () => push("/(app)/children") },
      ]);
      return null;
    }
    return child;
  }

  async function enqueueUri(uri: string, known?: { width?: number; height?: number }, child?: { id: string; parent_id: string }) {
    if (!child) return false;
    const persisted = uri.startsWith("mock") ? uri : await persistScanImage(uri);
    if (!quota.consumeOne()) {
      Alert.alert(t("camera.remainingShort"));
      return false;
    }
    enqueueScanJob({
      uri: persisted,
      width: known?.width,
      height: known?.height,
      childId: child.id,
      parentId: child.parent_id,
    });
    return true;
  }

  async function takePhoto() {
    if (capturingRef.current || busy) return;
    capturingRef.current = true;
    setBusy("camera");
    try {
      if (!ensureQuota(1)) return;
      const child = await resolveChild();
      if (!child) return;

      if (!liveCamera) {
        await enqueueUri(`mock-capture://${Date.now()}`, undefined, child);
        return;
      }

      if (!permission?.granted) {
        const next = await requestPermission();
        if (!next.granted) {
          Alert.alert(t("camera.permissionNeeded"), t("camera.permissionBody"));
          return;
        }
      }

      if (!canUseNativeDocumentScanner()) {
        Alert.alert(t("camera.needDevBuildTitle"), t("camera.needDevBuildBody"));
        return;
      }

      maruLog("camera", "document scanner start");
      const images = await scanPaperDocuments();
      if (images.length === 0) {
        Alert.alert(t("camera.scanFailedTitle"), t("camera.scanFailedBody"));
        return;
      }
      maruLog("camera", "document scanner done", { count: images.length });
      for (const uri of images) {
        if (!(await enqueueUri(uri, undefined, child))) break;
      }
    } catch (error) {
      if (error instanceof DocumentScanCancelledError) return;
      maruLog("camera", "scan error", error);
      const message =
        error instanceof DocumentScanUnavailableError
          ? error.message
          : error instanceof Error
            ? error.message
            : t("common.tryAgain");
      Alert.alert(t("camera.cannotScan"), message);
    } finally {
      capturingRef.current = false;
      setBusy(null);
    }
  }

  async function pickFromLibrary() {
    if (capturingRef.current || busy) return;
    setBusy("library");
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(t("camera.photoAccessTitle"), t("camera.photoAccessBody"));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: SCAN_CAPTURE_QUALITY,
        allowsMultipleSelection: true,
        selectionLimit: 8,
        legacy: Platform.OS === "android",
      });
      if (result.canceled) return;
      const picked = result.assets.filter((asset) => asset.uri);
      if (picked.length === 0) {
        Alert.alert(t("camera.pickFailedTitle"), t("camera.pickFailedBody"));
        return;
      }
      if (!ensureQuota(picked.length)) return;
      const child = await resolveChild();
      if (!child) return;
      for (const asset of picked) {
        if (!(await enqueueUri(asset.uri, { width: asset.width, height: asset.height }, child))) break;
      }
    } catch (error) {
      maruLog("camera", "library error", error);
      Alert.alert(t("camera.libraryFailTitle"), error instanceof Error ? error.message : t("common.tryAgain"));
    } finally {
      setBusy(null);
    }
  }

  function openJob(job: ScanQueueJob) {
    if (job.status === "completed" && job.scanId) {
      push(`/(app)/scan/${job.scanId}?from=batch`);
      return;
    }
    if (job.status === "failed") {
      Alert.alert(t("camera.gradeFailedTitle"), t("camera.gradeFailedBody"), [
        { text: t("camera.openList"), onPress: () => push("/(app)/scan/batch") },
        { text: t("common.close"), style: "cancel" },
      ]);
      return;
    }
    Alert.alert(t("camera.stillGradingTitle"), t("camera.stillGradingBody"));
  }

  function finishBatch() {
    if (capturedCount === 0) {
      Alert.alert(t("camera.noPhotoTitle"), t("camera.noPhotoBody"));
      return;
    }
    if (allGraded) {
      push("/(app)/review");
      return;
    }
    push("/(app)/scan/batch");
  }

  const needsPermission = liveCamera && permission && !permission.granted;
  const capturedBadge =
    capturedCount === 0
      ? null
      : analyzingCount > 0
        ? t("camera.capturedAnalyzing", { captured: capturedCount, analyzing: analyzingCount })
        : t("camera.captured", { captured: capturedCount });

  return (
    <View className="flex-1 bg-cream">
      <View className="flex-row flex-wrap items-center px-5 pt-4 pb-2">
        <QuotaBadge />
        {capturedBadge ? (
          <View className="ml-2 mt-1 rounded-full bg-white px-3 py-1">
            <Text className="text-sm font-semibold text-ink">{capturedBadge}</Text>
          </View>
        ) : null}
      </View>

      {needsPermission ? (
        <View className="mx-5 mb-3 rounded-2xl bg-white px-4 py-3">
          <Text className="text-center text-ink">{t("camera.permissionNeeded")}</Text>
          <Pressable
            className="mt-3 rounded-xl bg-maru-500 py-3"
            hitSlop={TAP_HIT_SLOP}
            onPress={() => void requestPermission()}
          >
            <Text className="text-center font-semibold text-white">{t("camera.allowCamera")}</Text>
          </Pressable>
        </View>
      ) : null}

      <ScanCaptureStage jobs={batchJobs} webDemo={!liveCamera} onOpenJob={openJob} />

      <View className="border-t border-ink/5 bg-cream px-4 pt-3" style={{ paddingBottom: 12 }}>
        <Pressable
          className="rounded-2xl bg-maru-500 py-4"
          hitSlop={TAP_HIT_SLOP}
          disabled={Boolean(busy)}
          onPress={() => void takePhoto()}
        >
          <Text className="text-center text-base font-bold text-white">
            {busy === "camera" ? t("camera.scanning") : t("camera.startScan")}
          </Text>
        </Pressable>
        <View className="mt-2 flex-row">
          <Pressable
            className="mr-2 flex-1 rounded-2xl bg-white py-3"
            hitSlop={TAP_HIT_SLOP}
            disabled={Boolean(busy)}
            onPress={() => void pickFromLibrary()}
          >
            <Text className="text-center font-semibold text-ink">
              {busy === "library" ? t("camera.opening") : t("camera.pickLibrary")}
            </Text>
          </Pressable>
          <Pressable
            className={`flex-1 rounded-2xl py-3 ${capturedCount > 0 ? "bg-ink" : "bg-ink/20"}`}
            hitSlop={TAP_HIT_SLOP}
            disabled={capturedCount === 0}
            onPress={finishBatch}
          >
            <Text className={`text-center font-semibold ${capturedCount > 0 ? "text-white" : "text-ink/50"}`}>
              {actionLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
