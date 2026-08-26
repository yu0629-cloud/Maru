/**
 * RevenueCat（react-native-purchases v8）は公式の Expo config plugin を同梱しない。
 * ネイティブモジュールは Dev Client / EAS の autolinking で入る。
 * このファイルは app.json の plugins に明示し、将来の設定差し込み口にする。
 * @param {import("expo/config").ExpoConfig} config
 */
module.exports = function withRevenueCat(config) {
  return config;
};
