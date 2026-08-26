import { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { A4Finder } from "@/src/components/A4Finder";
import { QuotaBadge } from "@/src/components/QuotaBadge";
import { ChildScoped } from "@/src/components/ChildScoped";
import { enqueueScanJob } from "@/src/features/grading/batch-queue";
import { useCurrentBatchJobs } from "@/src/stores/scanQueueStore";
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

  useEffect(() => {
    if (!liveCamera) return;
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [liveCamera, permission, requestPermission]);

  function ensureQuota(count = 1) {
    if (quota.remaining < count) {
      Alert.alert("スキャン残数がありません", "プランを変更するか、追加チケットを購入してください。", [
        { text: "料金プラン", onPress: () => router.push("/(app)/settings/billing") },
        { text: "閉じる", style: "cancel" },
      ]);
      return false;
    }
    return true;
  }

  async function resolveChild() {
    const child = currentChild ?? (await ensureAtLeastOneChild());
    if (!child?.id || !child.parent_id) {
      Alert.alert("子どもが未登録です", "先に子どもを追加してから丸付けしてください。", [
        { text: "閉じる", style: "cancel" },
        { text: "子どもを登録", onPress: () => router.push("/(app)/children") },
      ]);
      return null;
    }
    return child;
  }

  async function enqueueUri(uri: string, known?: { width?: number; height?: number }, child?: { id: string; parent_id: string }) {
    if (!child) return false;
    const persisted = uri.startsWith("mock") ? uri : await persistScanImage(uri);
    if (!quota.consumeOne()) {
      Alert.alert("残数が不足しています");
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
          Alert.alert("カメラの許可が必要です", "設定からカメラをオンにしてください。");
          return;
        }
      }

      if (!canUseNativeDocumentScanner()) {
        Alert.alert(
          "開発ビルドが必要です",
          "紙の四隅検出と台形補正は Expo Go では使えません。開発ビルドで開き直してください。",
        );
        return;
      }

      maruLog("camera", "document scanner start");
      const images = await scanPaperDocuments();
      if (images.length === 0) {
        Alert.alert("スキャンできませんでした", "プリントが枠に入るようにしてもう一度お試しください。");
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
            : "もう一度お試しください";
      Alert.alert("スキャンできません", message);
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
        Alert.alert("写真へのアクセスが必要です", "設定から写真ライブラリの許可をオンにしてください。");
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
        Alert.alert("写真を選べませんでした", "もう一度ライブラリから選んでください。");
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
      Alert.alert("ライブラリを開けません", error instanceof Error ? error.message : "もう一度お試しください");
    } finally {
      setBusy(null);
    }
  }

  function finishBatch() {
    if (capturedCount === 0) {
      Alert.alert("写真がありません", "プリントをスキャンするか、ライブラリから選んでください。");
      return;
    }
    router.push("/(app)/scan/batch");
  }

  const shutterLabel = busy === "camera" ? "スキャン中…" : "スキャン";
  const badgeText =
    analyzingCount > 0
      ? `撮影済み: ${capturedCount}枚（解析中...）`
      : capturedCount > 0
        ? `撮影済み: ${capturedCount}枚`
        : "";

  return (
    <View className="flex-1 bg-black">
      <View className="relative flex-1 bg-zinc-900" style={{ overflow: "hidden" }}>
        {liveCamera && permission && !permission.granted ? (
          <View className="flex-1 items-center justify-center bg-zinc-900 px-8">
            <Text className="text-center text-white">カメラの許可が必要です</Text>
            <Pressable className="mt-4 rounded-xl bg-white px-4 py-2" onPress={() => void requestPermission()}>
              <Text className="font-semibold text-ink">カメラを許可</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-1 bg-zinc-900">
            {!liveCamera ? (
              <View className="absolute inset-0 items-center justify-center px-8">
                <Text className="text-center text-white">Web ではデモ撮影になります</Text>
              </View>
            ) : null}
            <A4Finder shotCount={capturedCount} scanning={analyzingCount > 0} />
          </View>
        )}
        <View className="absolute left-4 top-4" style={{ zIndex: 2, elevation: 2 }}>
          <QuotaBadge />
        </View>
        {badgeText ? (
          <View
            className="absolute bottom-4 right-4 rounded-full bg-black/75 px-3 py-2"
            style={{ zIndex: 3, elevation: 3 }}
          >
            <Text className="text-sm font-semibold text-white">{badgeText}</Text>
          </View>
        ) : null}
      </View>

      <View className="bg-black px-4 pb-4 pt-3" style={{ zIndex: 10, elevation: 10 }}>
        <Text className="mb-2 text-center text-xs text-white/80">
          完了するまでどんどん撮ってください ／ 残 {quota.remaining}枚
        </Text>
        <View className="flex-row">
          <Pressable
            className="mr-2 flex-1 rounded-xl bg-white/15 py-3"
            disabled={Boolean(busy)}
            onPress={() => void pickFromLibrary()}
          >
            <Text className="text-center font-semibold text-white">{busy === "library" ? "開いています…" : "ライブラリ"}</Text>
          </Pressable>
          <Pressable
            className="mr-2 flex-1 rounded-xl bg-maru-500 py-3"
            disabled={Boolean(busy)}
            onPress={() => void takePhoto()}
          >
            <Text className="text-center font-semibold text-white">{shutterLabel}</Text>
          </Pressable>
          <Pressable
            className={`flex-1 rounded-xl py-3 ${capturedCount > 0 ? "bg-white" : "bg-white/40"}`}
            disabled={capturedCount === 0}
            onPress={finishBatch}
          >
            <Text className="text-center font-semibold text-ink">完了</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
