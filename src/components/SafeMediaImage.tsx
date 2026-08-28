import { useState } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { ExpiredMediaNotice } from "@/src/components/ExpiredMediaNotice";
import { isPreviewableScanUri, toFileUri } from "@/src/lib/files/scan-image";

export function SafeMediaImage({
  uri,
  className,
  style,
  resizeMode = "contain",
  compactNotice = true,
  emptyFallback = "none",
}: {
  uri?: string | null;
  className?: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: "contain" | "cover" | "stretch" | "center";
  compactNotice?: boolean;
  emptyFallback?: "notice" | "none";
}) {
  const [failed, setFailed] = useState(false);
  const preview = uri && isPreviewableScanUri(uri) ? toFileUri(uri) : "";
  if (!preview || failed) {
    if (!preview && emptyFallback === "none" && !failed) return null;
    return <ExpiredMediaNotice compact={compactNotice} />;
  }
  return (
    <Image
      source={{ uri: preview }}
      className={className}
      style={style}
      resizeMode={resizeMode}
      onError={() => setFailed(true)}
    />
  );
}
