import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link } from "expo-router";
import { href, replace } from "@/src/lib/nav/href";
import {
  signInAnonymously,
  signInMock,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
} from "@/src/features/auth/service";
import { mapAuthError } from "@/src/features/auth/errors";
import { isBillingMocked, shouldMockAuth } from "@/src/lib/env";
import { useT } from "@/src/i18n";

export default function LoginScreen() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      replace("/(app)");
    } catch (error) {
      Alert.alert(t("auth.loginFailed"), mapAuthError(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-cream" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-10">
        <Text className="text-center text-3xl font-bold text-ink">MARU</Text>
        <Text className="mt-2 text-center text-ink/70">{t("auth.tagline")}</Text>
        {shouldMockAuth() ? (
          <Text className="mt-3 text-center text-xs text-maru-600">{t("auth.mockMode")}</Text>
        ) : isBillingMocked() ? (
          <Text className="mt-3 text-center text-xs text-maru-600">{t("auth.billingMock")}</Text>
        ) : null}

        <TextInput
          className="mt-8 rounded-xl bg-white px-4 py-3 text-ink"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={t("auth.email")}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          className="mt-3 rounded-xl bg-white px-4 py-3 text-ink"
          secureTextEntry
          placeholder={t("auth.password")}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          className="mt-4 rounded-2xl bg-maru-500 px-4 py-4"
          disabled={busy}
          onPress={() => run(() => signInWithEmail(email.trim(), password))}
        >
          <Text className="text-center font-bold text-white">{busy ? t("common.busy") : t("auth.emailLogin")}</Text>
        </Pressable>

        <Pressable
          className="mt-3 rounded-2xl bg-white px-4 py-4"
          disabled={busy}
          onPress={() => run(() => signInWithGoogle())}
        >
          <Text className="text-center font-bold text-ink">{t("auth.google")}</Text>
        </Pressable>

        {Platform.OS === "ios" ? (
          <Pressable
            className="mt-3 rounded-2xl bg-black px-4 py-4"
            disabled={busy}
            onPress={() => run(() => signInWithApple())}
          >
            <Text className="text-center font-bold text-white">{t("auth.apple")}</Text>
          </Pressable>
        ) : null}

        <Pressable
          className="mt-3 rounded-2xl bg-white px-4 py-4"
          disabled={busy}
          onPress={() => run(() => signInAnonymously())}
        >
          <Text className="text-center font-bold text-ink">{t("auth.guest")}</Text>
        </Pressable>

        {shouldMockAuth() ? (
          <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" disabled={busy} onPress={() => run(() => signInMock())}>
            <Text className="text-center font-bold text-maru-600">{t("auth.devMock")}</Text>
          </Pressable>
        ) : __DEV__ ? (
          <Text className="mt-4 text-center text-xs text-ink/50">{t("auth.supabaseHint")}</Text>
        ) : null}

        <Link href={href("/(auth)/signup")} className="mt-6">
          <Text className="text-center text-maru-600">{t("auth.createAccount")}</Text>
        </Link>
        <Link href={href("/print-preview")} className="mt-3">
          <Text className="text-center text-ink/50">{t("auth.printPreview")}</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
