import { useEffect, useState } from "react";
import { isPreviewableScanUri, localFileExists, toFileUri } from "@/src/lib/files/scan-image";
import { STORAGE_BUCKETS } from "@/src/lib/storage/paths";
import { signedStorageUrl } from "@/src/lib/storage/signed-url";
import type { ScanRecord } from "@/src/stores/scanStore";

export function useScanPhotoUri(
  scan: Pick<ScanRecord, "localUri" | "originalStoragePath" | "originalPurgedAt" | "isDemo">,
) {
  const [uri, setUri] = useState<string | undefined>();
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      setResolved(false);
      if (scan.localUri && isPreviewableScanUri(scan.localUri)) {
        const exists = await localFileExists(scan.localUri);
        if (cancelled) return;
        if (exists) {
          setUri(toFileUri(scan.localUri));
          setResolved(true);
          return;
        }
      }
      if (scan.originalPurgedAt) {
        setUri(undefined);
        setResolved(true);
        return;
      }
      const path = scan.originalStoragePath;
      if (!path) {
        setUri(undefined);
        setResolved(true);
        return;
      }
      const remote = await signedStorageUrl(STORAGE_BUCKETS.originals, path);
      if (cancelled) return;
      setUri(remote || undefined);
      setResolved(true);
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [scan.isDemo, scan.localUri, scan.originalPurgedAt, scan.originalStoragePath]);

  const expired = resolved && !uri && !scan.isDemo && Boolean(scan.originalPurgedAt || !scan.originalStoragePath);
  const unavailable = resolved && !uri && !scan.isDemo;
  return { uri, expired: expired || unavailable };
}
