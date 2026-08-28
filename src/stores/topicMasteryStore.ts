import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import {
  advanceMasteryOnCorrect,
  emptyMastery,
  markTopicMastered,
  normalizeMastery,
  topicKey,
  unmarkTopicMastered,
  type TopicMastery,
  type TopicMasteryMap,
} from "@/src/features/carte/mastery";
import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";

const STORAGE_KEY = "maru.topicMastery.v1";

export const EMPTY_TOPIC_MASTERY: TopicMasteryMap = {};

type ByChild = Record<string, TopicMasteryMap>;

type TopicMasteryState = {
  ready: boolean;
  byChild: ByChild;
  hydrate: (childId?: string | null) => Promise<void>;
  mapForChild: (childId?: string | null) => TopicMasteryMap;
  toggleMastered: (childId: string, subject: string | null | undefined, topic: string) => Promise<TopicMastery>;
  advanceOnCorrect: (childId: string, subject: string | null | undefined, topic: string) => Promise<TopicMastery>;
};

function snapshot(byChild: ByChild) {
  return JSON.stringify(byChild);
}

async function persist(byChild: ByChild) {
  await AsyncStorage.setItem(STORAGE_KEY, snapshot(byChild));
}

async function upsertRemote(childId: string, subject: string, topic: string, record: TopicMastery) {
  if (!shouldUseRemote(childId)) return;
  const { error } = await supabase.from("topic_mastery").upsert(
    {
      child_id: childId,
      subject,
      topic,
      is_mastered: record.isMastered,
      mastered_at: record.masteredAt,
      review_stage: record.reviewStage,
      next_review_date: record.nextReviewDate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "child_id,subject,topic" },
  );
  if (error) console.warn("[topicMastery] upsert", error.message);
}

let hydrating: Promise<void> | null = null;

export const useTopicMasteryStore = create<TopicMasteryState>((set, get) => ({
  ready: false,
  byChild: {},
  mapForChild: (childId) => (childId ? get().byChild[childId] ?? EMPTY_TOPIC_MASTERY : EMPTY_TOPIC_MASTERY),
  hydrate: async (childId) => {
    if (hydrating) await hydrating;
    hydrating = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ByChild;
          const next: ByChild = {};
          for (const [id, map] of Object.entries(parsed ?? {})) {
            next[id] = Object.fromEntries(
              Object.entries(map ?? {}).map(([key, value]) => [key, normalizeMastery(value)]),
            );
          }
          set({ byChild: { ...get().byChild, ...next }, ready: true });
        } else {
          set({ ready: true });
        }
      } catch {
        set({ ready: true });
      }
      if (childId && shouldUseRemote(childId)) {
        const { data, error } = await supabase
          .from("topic_mastery")
          .select("subject, topic, is_mastered, mastered_at, review_stage, next_review_date")
          .eq("child_id", childId);
        if (!error && data) {
          const remote: TopicMasteryMap = {};
          for (const row of data) {
            remote[topicKey(row.subject, row.topic)] = normalizeMastery({
              isMastered: row.is_mastered,
              masteredAt: row.mastered_at,
              reviewStage: row.review_stage,
              nextReviewDate: row.next_review_date,
            });
          }
          const merged = { ...get().byChild, [childId]: { ...get().byChild[childId], ...remote } };
          set({ byChild: merged });
          await persist(merged);
        }
      }
    })();
    try {
      await hydrating;
    } finally {
      hydrating = null;
    }
  },
  toggleMastered: async (childId, subject, topic) => {
    const key = topicKey(subject, topic);
    const current = get().byChild[childId]?.[key];
    const nextRecord = current?.isMastered ? unmarkTopicMastered() : markTopicMastered(current);
    const childMap = { ...get().byChild[childId], [key]: nextRecord };
    const byChild = { ...get().byChild, [childId]: childMap };
    set({ byChild });
    await persist(byChild);
    await upsertRemote(childId, key.split("::")[0], topic, nextRecord);
    return nextRecord;
  },
  advanceOnCorrect: async (childId, subject, topic) => {
    const key = topicKey(subject, topic);
    const current = get().byChild[childId]?.[key] ?? emptyMastery();
    if (!current.isMastered) return current;
    const nextRecord = advanceMasteryOnCorrect(current);
    const childMap = { ...get().byChild[childId], [key]: nextRecord };
    const byChild = { ...get().byChild, [childId]: childMap };
    set({ byChild });
    await persist(byChild);
    await upsertRemote(childId, key.split("::")[0], topic, nextRecord);
    return nextRecord;
  },
}));
