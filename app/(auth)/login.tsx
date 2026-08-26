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
import { Link, router } from "expo-router";
import {
  signInAnonymously,
  signInMock,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
} from "@/src/features/auth/service";
import { mapAuthError } from "@/src/features/auth/errors";
import { isMockMode } from "@/src/lib/env";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      router.replace("/(app)");
    } catch (error) {
      Alert.alert("ログインできません", mapAuthError(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-cream" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-10">
        <Text className="text-center text-3xl font-bold text-ink">MARU</Text>
        <Text className="mt-2 text-center text-ink/70">家庭学習・解き直し特化のスマートアシスタント</Text>
        {isMockMode() ? (
          <Text className="mt-3 text-center text-xs text-maru-600">モックモード（Supabase 未接続でも進めます）</Text>
        ) : null}

        <TextInput
          className="mt-8 rounded-xl bg-white px-4 py-3 text-ink"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="メールアドレス"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          className="mt-3 rounded-xl bg-white px-4 py-3 text-ink"
          secureTextEntry
          placeholder="パスワード"
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          className="mt-4 rounded-2xl bg-maru-500 px-4 py-4"
          disabled={busy}
          onPress={() => run(() => signInWithEmail(email.trim(), password))}
        >
          <Text className="text-center font-bold text-white">{busy ? "処理中…" : "メールでログイン"}</Text>
        </Pressable>

        <Pressable
          className="mt-3 rounded-2xl bg-white px-4 py-4"
          disabled={busy}
          onPress={() => run(() => signInWithGoogle())}
        >
          <Text className="text-center font-bold text-ink">Google で続ける</Text>
        </Pressable>

        {Platform.OS === "ios" ? (
          <Pressable
            className="mt-3 rounded-2xl bg-black px-4 py-4"
            disabled={busy}
            onPress={() => run(() => signInWithApple())}
          >
            <Text className="text-center font-bold text-white">Apple でサインイン</Text>
          </Pressable>
        ) : null}

        <Pressable
          className="mt-3 rounded-2xl bg-white px-4 py-4"
          disabled={busy}
          onPress={() => run(() => signInAnonymously())}
        >
          <Text className="text-center font-bold text-ink">ゲストではじめる</Text>
        </Pressable>

        {isMockMode() ? (
          <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" disabled={busy} onPress={() => run(() => signInMock())}>
            <Text className="text-center font-bold text-maru-600">開発用モックでホームへ</Text>
          </Pressable>
        ) : __DEV__ ? (
          <Text className="mt-4 text-center text-xs text-ink/50">
            Supabase 接続中です。実アカウントでログインしてください（開発用モックは EXPO_PUBLIC_USE_MOCKS=1 のときだけ使えます）
          </Text>
        ) : null}

        <Link href="/(auth)/signup" className="mt-6">
          <Text className="text-center text-maru-600">アカウントを作成</Text>
        </Link>
        <Link href="/print-preview" className="mt-3">
          <Text className="text-center text-ink/50">A4プリントプレビュー</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
