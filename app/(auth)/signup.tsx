import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Link } from "expo-router";
import { href, replace } from "@/src/lib/nav/href";
import { mapAuthError } from "@/src/features/auth/errors";
import { signUpWithEmail } from "@/src/features/auth/service";
import { useT } from "@/src/i18n";

export default function SignupScreen() {
  const t = useT();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await signUpWithEmail(email.trim(), password, displayName.trim());
      if (result && typeof result === "object" && "session" in result && !result.session) {
        Alert.alert(t("auth.mailSentTitle"), t("auth.mailSentBody"));
        replace("/(auth)/login");
        return;
      }
      replace("/(app)");
    } catch (error) {
      Alert.alert(t("auth.cannotCreate"), mapAuthError(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-cream" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View className="flex-1 justify-center px-6">
        <Text className="text-2xl font-bold text-ink">{t("auth.signupTitle")}</Text>
        <Text className="mt-2 text-ink/70">{t("auth.signupSubtitle")}</Text>
        <TextInput
          className="mt-6 rounded-xl bg-white px-4 py-3 text-ink"
          placeholder={t("auth.displayName")}
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TextInput
          className="mt-3 rounded-xl bg-white px-4 py-3 text-ink"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={t("auth.email")}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          className="mt-3 rounded-xl bg-white px-4 py-3 text-ink"
          secureTextEntry
          placeholder={t("auth.passwordMin")}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable className="mt-5 rounded-2xl bg-maru-500 px-4 py-4" disabled={busy} onPress={() => void submit()}>
          <Text className="text-center font-bold text-white">{busy ? t("auth.creating") : t("auth.createStart")}</Text>
        </Pressable>
        <Link href={href("/(auth)/login")} className="mt-5">
          <Text className="text-center text-maru-600">{t("auth.backToLogin")}</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
