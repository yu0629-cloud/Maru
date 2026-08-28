import { router, type Href } from "expo-router";

/** Expo Router の生成型がグループ経路を拾い漏らしても、実行時のパスはそのまま使う */
export function href(path: string): Href {
  return path as Href;
}

export function push(path: string) {
  router.push(href(path));
}

export function replace(path: string) {
  router.replace(href(path));
}

export function back() {
  if (router.canGoBack()) router.back();
  else router.replace(href("/(app)/(tabs)"));
}
