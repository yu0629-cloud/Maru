import { useEffect } from "react";
import * as Linking from "expo-linking";
import { restoreLocalAuth, createSessionFromUrl } from "@/src/features/auth/service";
import { isMockMode } from "@/src/lib/env";

export function AuthSessionBootstrap() {
  useEffect(() => {
    void restoreLocalAuth();
  }, []);

  useEffect(() => {
    if (isMockMode()) return;
    const handle = ({ url }: { url: string }) => {
      void createSessionFromUrl(url);
    };
    const sub = Linking.addEventListener("url", handle);
    void Linking.getInitialURL().then((url) => {
      if (url) void createSessionFromUrl(url);
    });
    return () => sub.remove();
  }, []);

  return null;
}
