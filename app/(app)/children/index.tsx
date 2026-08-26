import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { GRADE_LABELS, SUBJECT_LABELS } from "@/src/constants/review";
import { PLAN_ENTITLEMENTS } from "@/src/features/billing/lib/catalog.mjs";
import { useChildren } from "@/src/hooks/useChildren";
import { useQuotaStore } from "@/src/stores/quotaStore";
import type { GradeCode, SubjectCode } from "@/src/types/database";

const HUES = [12, 32, 200, 150, 280, 0];
const GRADES = Object.keys(GRADE_LABELS) as GradeCode[];
const SUBJECTS = Object.keys(SUBJECT_LABELS) as SubjectCode[];

const EMPTY = {
  name: "",
  grade_code: "e4" as GradeCode,
  exam_target: "中学受験",
  target_subjects: ["math", "japanese"] as SubjectCode[],
  avatar_hue: 12,
};

export default function ChildrenScreen() {
  const { children, currentChildId, max, canAdd, switchChild, createChild, updateChild, deleteChild } = useChildren();
  const tier = useQuotaStore((state) => state.tier);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState(EMPTY);

  const editing = useMemo(
    () => (editingId && editingId !== "new" ? children.find((child) => child.id === editingId) : null),
    [children, editingId],
  );

  function startCreate() {
    if (!canAdd) {
      Alert.alert(
        "人数の上限です",
        `${PLAN_ENTITLEMENTS[tier].label}では子どもは${max}人までです。`,
        [
          { text: "閉じる", style: "cancel" },
          { text: "プランを見る", onPress: () => router.push("/(app)/settings/billing") },
        ],
      );
      return;
    }
    setDraft(EMPTY);
    setEditingId("new");
  }

  function startEdit(id: string) {
    const child = children.find((item) => item.id === id);
    if (!child) return;
    setDraft({
      name: child.name,
      grade_code: child.grade_code,
      exam_target: child.exam_target ?? "",
      target_subjects: child.target_subjects?.length ? child.target_subjects : ["math"],
      avatar_hue: child.avatar_hue,
    });
    setEditingId(id);
  }

  async function save() {
    if (!draft.name.trim()) {
      Alert.alert("名前を入力してください");
      return;
    }
    try {
      if (editingId === "new") {
        const created = await createChild(draft);
        await switchChild(created.id);
      } else if (editingId) {
        await updateChild(editingId, draft);
      }
      setEditingId(null);
    } catch (error) {
      Alert.alert("保存できません", error instanceof Error ? error.message : "");
    }
  }

  function confirmDelete(id: string, name: string) {
    Alert.alert(`「${name}」を削除します`, "カルテと復習履歴も消えます。", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: () => {
          void deleteChild(id).catch((error) =>
            Alert.alert("削除できません", error instanceof Error ? error.message : ""),
          );
          if (editingId === id) setEditingId(null);
        },
      },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-5">
      <Text className="text-2xl font-bold text-ink">子ども管理</Text>
      <Text className="mt-1 text-ink/70">
        {PLAN_ENTITLEMENTS[tier].label}　{children.length} / {max}人
      </Text>

      {children.map((child) => {
        const selected = child.id === currentChildId;
        return (
          <View key={child.id} className="mt-3 rounded-2xl bg-white px-4 py-4">
            <View className="flex-row items-center">
              <View
                className="mr-3 h-8 w-8 rounded-full"
                style={{ backgroundColor: `hsl(${child.avatar_hue}, 70%, 45%)` }}
              />
              <View className="flex-1">
                <Text className="font-bold text-ink">
                  {child.name}
                  {selected ? "（表示中）" : ""}
                </Text>
                <Text className="text-sm text-ink/60">
                  {GRADE_LABELS[child.grade_code]}
                  {child.exam_target ? ` · ${child.exam_target}` : ""}
                </Text>
              </View>
            </View>
            <View className="mt-3 flex-row flex-wrap gap-2">
              <Pressable className="rounded-full bg-cream px-3 py-1" onPress={() => void switchChild(child.id)}>
                <Text className="text-sm text-ink">{selected ? "選択中" : "この子にする"}</Text>
              </Pressable>
              <Pressable className="rounded-full bg-cream px-3 py-1" onPress={() => startEdit(child.id)}>
                <Text className="text-sm text-ink">編集</Text>
              </Pressable>
              <Pressable className="rounded-full bg-cream px-3 py-1" onPress={() => confirmDelete(child.id, child.name)}>
                <Text className="text-sm text-maru-600">削除</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Pressable className="mt-4 rounded-2xl bg-maru-500 px-4 py-4" onPress={startCreate}>
        <Text className="text-center font-bold text-white">子どもを追加</Text>
      </Pressable>

      {editingId ? (
        <View className="mt-6 rounded-2xl bg-white px-4 py-4">
          <Text className="font-bold text-ink">{editing ? "プロフィールを編集" : "新しい子ども"}</Text>
          <TextInput
            className="mt-3 rounded-xl bg-cream px-3 py-3 text-ink"
            placeholder="名前"
            value={draft.name}
            onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
          />
          <Text className="mt-4 text-sm text-ink/60">学年</Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {GRADES.map((code) => (
              <Pressable
                key={code}
                className={`rounded-full px-3 py-1 ${draft.grade_code === code ? "bg-maru-500" : "bg-cream"}`}
                onPress={() => setDraft((current) => ({ ...current, grade_code: code }))}
              >
                <Text className={draft.grade_code === code ? "text-white" : "text-ink"}>{GRADE_LABELS[code]}</Text>
              </Pressable>
            ))}
          </View>
          <Text className="mt-4 text-sm text-ink/60">対象教科</Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {SUBJECTS.map((code) => {
              const on = draft.target_subjects.includes(code);
              return (
                <Pressable
                  key={code}
                  className={`rounded-full px-3 py-1 ${on ? "bg-maru-500" : "bg-cream"}`}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      target_subjects: on
                        ? current.target_subjects.filter((item) => item !== code)
                        : [...current.target_subjects, code],
                    }))
                  }
                >
                  <Text className={on ? "text-white" : "text-ink"}>{SUBJECT_LABELS[code]}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            className="mt-3 rounded-xl bg-cream px-3 py-3 text-ink"
            placeholder="受験目標（任意）"
            value={draft.exam_target ?? ""}
            onChangeText={(exam_target) => setDraft((current) => ({ ...current, exam_target }))}
          />
          <Text className="mt-4 text-sm text-ink/60">アイコンカラー</Text>
          <View className="mt-2 flex-row gap-2">
            {HUES.map((hue) => (
              <Pressable
                key={hue}
                onPress={() => setDraft((current) => ({ ...current, avatar_hue: hue }))}
                className="h-8 w-8 rounded-full"
                style={{
                  backgroundColor: `hsl(${hue}, 70%, 45%)`,
                  borderWidth: draft.avatar_hue === hue ? 3 : 0,
                  borderColor: "#1F2933",
                }}
              />
            ))}
          </View>
          <Pressable className="mt-5 rounded-2xl bg-maru-500 px-4 py-3" onPress={() => void save()}>
            <Text className="text-center font-bold text-white">保存</Text>
          </Pressable>
          <Pressable className="mt-2 px-4 py-3" onPress={() => setEditingId(null)}>
            <Text className="text-center text-ink/60">キャンセル</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="h-10" />
    </ScrollView>
  );
}
