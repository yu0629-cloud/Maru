/**
 * Expo 設定。静的な値は app.json、EAS の projectId だけ環境変数で上書きする。
 * @param {{ config: import("@expo/config").ExpoConfig }} ctx
 */
module.exports = ({ config }) => {
  const app = require("./app.json").expo;
  const easExtra = { ...(app.extra?.eas ?? {}) };
  const projectId = process.env.EAS_PROJECT_ID || easExtra.projectId;
  if (projectId) easExtra.projectId = projectId;
  else delete easExtra.projectId;

  return {
    ...config,
    ...app,
    extra: {
      ...app.extra,
      eas: easExtra,
    },
  };
};
