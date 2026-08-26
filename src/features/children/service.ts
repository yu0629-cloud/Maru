import AsyncStorage from "@react-native-async-storage/async-storage";
import { MOCK_CHILD } from "@/src/features/print/mock";
import { childLimitError } from "@/src/features/billing/lib/catalog.mjs";
import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { useAuthStore } from "@/src/stores/authStore";
import { useChildStore } from "@/src/stores/childStore";
import { useQuotaStore } from "@/src/stores/quotaStore";
import { useReviewStore } from "@/src/stores/reviewStore";
import type { Database, GradeCode, SubjectCode } from "@/src/types/database";

type Child = Database["public"]["Tables"]["children"]["Row"];

export type ChildDraft = {
  name: string;
  grade_code: GradeCode;
  exam_target: string | null;
  target_subjects: SubjectCode[];
  avatar_hue: number;
};

const MOCK_CHILDREN_KEY = "maru.children.mock";

function parentId() {
  return useAuthStore.getState().userId ?? MOCK_CHILD.parent_id;
}

function assertCanAdd(currentCount: number) {
  const error = childLimitError(useQuotaStore.getState().tier, currentCount);
  if (error) throw new Error(error.message);
}

async function persistMockChildren() {
  if (shouldUseRemote()) return;
  const { children, currentChildId } = useChildStore.getState();
  await AsyncStorage.setItem(MOCK_CHILDREN_KEY, JSON.stringify({ children, currentChildId }));
}

export async function resetMockChildren() {
  await AsyncStorage.removeItem(MOCK_CHILDREN_KEY);
}

function reloadForChildSwitch() {
  useReviewStore.getState().setItems([]);
}

export async function hydrateChildren() {
  if (!shouldUseRemote()) {
    const existing = useChildStore.getState().children;
    if (existing.length === 0) {
      const raw = await AsyncStorage.getItem(MOCK_CHILDREN_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { children: Child[]; currentChildId: string | null };
          useChildStore.getState().setChildren(parsed.children ?? [], parsed.currentChildId);
        } catch {
          useChildStore.getState().setChildren([MOCK_CHILD]);
        }
      } else {
        useChildStore.getState().setChildren([MOCK_CHILD]);
        await persistMockChildren();
      }
    }
    return useChildStore.getState().children;
  }
  const userId = parentId();
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_child_id")
    .eq("id", userId)
    .maybeSingle();
  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("parent_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  useChildStore.getState().setChildren(
    (data ?? []) as Child[],
    (profile as { current_child_id?: string | null } | null)?.current_child_id ?? null,
  );
  return useChildStore.getState().children;
}

let ensuringChild: Promise<Child> | null = null;

export async function ensureAtLeastOneChild() {
  if (ensuringChild) return ensuringChild;
  ensuringChild = (async () => {
    const existing = useChildStore.getState().children;
    if (existing.length > 0) {
      const currentId = useChildStore.getState().currentChildId;
      return existing.find((child) => child.id === currentId) ?? existing[0];
    }
    const hydrated = await hydrateChildren();
    if (hydrated.length > 0) {
      const currentId = useChildStore.getState().currentChildId;
      return hydrated.find((child) => child.id === currentId) ?? hydrated[0];
    }
    return createChild({
      name: "子ども",
      grade_code: "e4",
      exam_target: null,
      target_subjects: ["math", "japanese"],
      avatar_hue: 12,
    });
  })();
  try {
    return await ensuringChild;
  } finally {
    ensuringChild = null;
  }
}

export async function switchCurrentChild(childId: string) {
  useChildStore.getState().switchChild(childId);
  reloadForChildSwitch();
  await persistMockChildren();
  if (!shouldUseRemote()) return;
  const userId = parentId();
  const { error } = await supabase
    .from("profiles")
    .update({ current_child_id: childId } as never)
    .eq("id", userId);
  if (error) throw error;
}

export async function createChild(draft: ChildDraft) {
  const children = useChildStore.getState().children;
  assertCanAdd(children.length);
  const now = new Date().toISOString();
  const row: Child = {
    id: `child_${Date.now().toString(36)}`,
    parent_id: parentId(),
    name: draft.name.trim(),
    grade_code: draft.grade_code,
    exam_target: draft.exam_target,
    target_subjects: draft.target_subjects,
    avatar_hue: draft.avatar_hue,
    sort_order: children.length,
    created_at: now,
    updated_at: now,
  };

  if (!shouldUseRemote()) {
    useChildStore.getState().upsertChild(row);
    await persistMockChildren();
    return row;
  }

  const { data, error } = await supabase
    .from("children")
    .insert({
      parent_id: parentId(),
      name: row.name,
      grade_code: row.grade_code,
      exam_target: row.exam_target,
      target_subjects: row.target_subjects,
      avatar_hue: row.avatar_hue,
      sort_order: row.sort_order,
    } as never)
    .select("*")
    .single();
  if (error) {
    if (error.message?.includes("CHILD_LIMIT_REACHED")) {
      throw new Error(childLimitError(useQuotaStore.getState().tier, children.length)?.message ?? error.message);
    }
    throw error;
  }
  useChildStore.getState().upsertChild(data as Child);
  return data as Child;
}

export async function updateChild(childId: string, draft: Partial<ChildDraft>) {
  if (!shouldUseRemote()) {
    const current = useChildStore.getState().children.find((item) => item.id === childId);
    if (!current) throw new Error("子どもが見つかりません");
    useChildStore.getState().upsertChild({
      ...current,
      ...draft,
      name: draft.name?.trim() ?? current.name,
      updated_at: new Date().toISOString(),
    });
    await persistMockChildren();
    return;
  }
  const { data, error } = await supabase
    .from("children")
    .update({
      ...draft,
      name: draft.name?.trim(),
    } as never)
    .eq("id", childId)
    .select("*")
    .single();
  if (error) throw error;
  useChildStore.getState().upsertChild(data as Child);
}

export async function deleteChild(childId: string) {
  if (!shouldUseRemote()) {
    useChildStore.getState().removeChild(childId);
    reloadForChildSwitch();
    await persistMockChildren();
    return;
  }
  const { error } = await supabase.from("children").delete().eq("id", childId);
  if (error) throw error;
  useChildStore.getState().removeChild(childId);
  reloadForChildSwitch();
  const next = useChildStore.getState().currentChildId;
  if (next) await switchCurrentChild(next);
}
