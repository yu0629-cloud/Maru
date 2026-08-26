import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Link, router } from "expo-router";
import { mapAuthError } from "@/src/features/auth/errors";
import { signUpWithEmail } from "@/src/features/auth/service";

export default function SignupScreen() {
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
        Alert.alert("確認メールを送信しました", "メール内のリンクを開いてからログインしてください。");
        router.replace("/(auth)/login");
        return;
      }
      router.replace("/(app)");
    } catch (error) {
      Alert.alert("作成できません", mapAuthError(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-cream" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View className="flex-1 justify-center px-6">
        <Text className="text-2xl font-bold text-ink">アカウント作成</Text>
        <Text className="mt-2 text-ink/70">メールで保護者アカウントを作ります。</Text>
        <TextInput
          className="mt-6 rounded-xl bg-white px-4 py-3 text-ink"
          placeholder="表示名（保護者）"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TextInput
          className="mt-3 rounded-xl bg-white px-4 py-3 text-ink"
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="メールアドレス"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          className="mt-3 rounded-xl bg-white px-4 py-3 text-ink"
          secureTextEntry
          placeholder="パスワード（6文字以上）"
          value={password}
          onChangeText={setPassword}
        />
        <Pressable className="mt-5 rounded-2xl bg-maru-500 px-4 py-4" disabled={busy} onPress={() => void submit()}>
          <Text className="text-center font-bold text-white">{busy ? "作成中…" : "作成して始める"}</Text>
        </Pressable>
        <Link href="/(auth)/login" className="mt-5">
          <Text className="text-center text-maru-600">ログインに戻る</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
