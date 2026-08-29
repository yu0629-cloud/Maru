export type SubscriptionTier = "free" | "standard" | "family";
export type GradeCode = "e1" | "e2" | "e3" | "e4" | "e5" | "e6" | "j1" | "j2" | "j3";
export type SubjectCode =
  | "math"
  | "japanese"
  | "spelling_phonics"
  | "reading"
  | "writing_grammar"
  | "science"
  | "social_studies"
  | "world_languages"
  | "other";
export type ScanStatus =
  | "pending"
  | "uploading"
  | "grading"
  | "inpainting"
  | "completed"
  | "failed";
export type QuotaSource = "free" | "monthly" | "ticket";
export type ReviewItemStatus = "queued" | "active" | "leech" | "mastered" | "retired";
export type PrintGridType = "graph" | "squared" | "lined" | "blank";
export type VisualType = "text_only" | "has_figure" | "passage_based";
export type ProblemType =
  | "calc_block"
  | "math_geometry_graph"
  | "kanji"
  | "reading_passage"
  | "science_social_diagram"
  | "integrated_essay"
  | "standard";
export type TriageLevel = "solid" | "watch" | "needs_review" | "critical";
export type DifficultyLevel = "basic" | "standard" | "advanced";
export type MistakeType = "careless" | "concept_gap" | "blank" | "none";
export type InpaintJobStatus = "queued" | "processing" | "completed" | "failed";
export type GeminiBBox = [ymin: number, xmin: number, ymax: number, xmax: number];
export type OverallScore = { earned: number; max: number };

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WeakUnit = {
  subject: SubjectCode | null;
  unit: string;
  correct: number;
  total: number;
  rate: number;
};

export type UnitStat = {
  correct: number;
  total: number;
  rate: number;
  weak: boolean;
};

export type SubjectStat = {
  correct: number;
  total: number;
  foundation_rate: number;
  units?: Record<string, UnitStat>;
};

export type CarteTriage = {
  level: TriageLevel;
  priority_units: string[];
  summary: string;
};

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string;
          subscription_tier: SubscriptionTier;
          revenuecat_app_user_id: string | null;
          current_child_id: string | null;
          free_scans_remaining: number;
          extra_ticket_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      children: {
        Row: {
          id: string;
          parent_id: string;
          name: string;
          grade_code: GradeCode;
          exam_target: string | null;
          target_subjects: SubjectCode[];
          avatar_hue: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["children"]["Row"],
          "id" | "created_at" | "updated_at"
        > & { id?: string };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["children"]["Row"]>;
      };
      child_cartes: {
        Row: {
          child_id: string;
          foundation_rate: number;
          weak_units: WeakUnit[];
          subject_stats: Record<string, SubjectStat>;
          triage: CarteTriage;
          scan_count: number;
          problem_count: number;
          last_scan_at: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["child_cartes"]["Row"]> & {
          child_id: string;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["child_cartes"]["Row"]>;
      };
      topic_mastery: {
        Row: {
          id: string;
          child_id: string;
          subject: string;
          topic: string;
          is_mastered: boolean;
          mastered_at: string | null;
          review_stage: number;
          next_review_date: string | null;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["topic_mastery"]["Row"]> & {
          child_id: string;
          subject: string;
          topic: string;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["topic_mastery"]["Row"]>;
      };
      scans: {
        Row: {
          id: string;
          parent_id: string;
          child_id: string;
          original_storage_path: string | null;
          annotated_storage_path: string | null;
          thumbnail_storage_path: string | null;
          original_purged_at: string | null;
          annotated_purged_at: string | null;
          original_retain_until: string | null;
          status: ScanStatus;
          subject: SubjectCode | null;
          unit_hint: string | null;
          total_problems: number;
          correct_count: number;
          incorrect_count: number;
          quota_source: QuotaSource | null;
          gemini_raw: Json | null;
          overall_score: OverallScore | null;
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["scans"]["Row"]> & {
          parent_id: string;
          child_id: string;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["scans"]["Row"]>;
      };
      problems: {
        Row: {
          id: string;
          scan_id: string;
          child_id: string;
          problem_index: number;
          problem_label: string | null;
          question_text: string | null;
          bounding_box: BoundingBox;
          is_correct: boolean | null;
          student_answer: string | null;
          correct_answer: string | null;
          explanation: string | null;
          subject: SubjectCode | null;
          unit: string | null;
          topic: string | null;
          topic_tags: string[];
          difficulty_level: DifficultyLevel | null;
          mistake_type: MistakeType | null;
          parent_coaching_tip: string | null;
          needs_inpaint: boolean;
          problem_type: ProblemType;
          visual_type: VisualType | null;
          crop_box: GeminiBBox | null;
          passage_text: string | null;
          context_text: string | null;
          options_text: string | null;
          parent_figure_box: GeminiBBox | null;
          sub_figure_box: GeminiBBox | null;
          gemini_bbox: GeminiBBox | null;
          cropped_storage_path: string | null;
          blanked_storage_path: string | null;
          crop_purged_at: string | null;
          blank_purged_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["problems"]["Row"]> & {
          scan_id: string;
          child_id: string;
          problem_index: number;
          bounding_box: BoundingBox;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["problems"]["Row"]>;
      };
      inpaint_jobs: {
        Row: {
          id: string;
          problem_id: string;
          scan_id: string;
          source_storage_path: string;
          gemini_bbox: GeminiBBox;
          crop_box: BoundingBox;
          status: InpaintJobStatus;
          attempts: number;
          last_error: string | null;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["inpaint_jobs"]["Row"]> & {
          problem_id: string;
          scan_id: string;
          source_storage_path: string;
          gemini_bbox: GeminiBBox;
          crop_box: BoundingBox;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["inpaint_jobs"]["Row"]>;
      };
      review_queue: {
        Row: {
          id: string;
          child_id: string;
          problem_id: string;
          status: ReviewItemStatus;
          next_review_on: string;
          interval_days: number;
          ease_factor: number;
          consecutive_misses: number;
          consecutive_hits: number;
          review_count: number;
          last_result: boolean | null;
          last_reviewed_at: string | null;
          leech_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["review_queue"]["Row"]> & {
          child_id: string;
          problem_id: string;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["review_queue"]["Row"]>;
      };
      daily_review_assignments: {
        Row: {
          id: string;
          child_id: string;
          review_date: string;
          review_queue_id: string;
          sort_order: number;
          completed: boolean;
        };
        Insert: Omit<Database["public"]["Tables"]["daily_review_assignments"]["Row"], "id"> & {
          id?: string;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["daily_review_assignments"]["Row"]>;
      };
      print_jobs: {
        Row: {
          id: string;
          parent_id: string;
          child_id: string;
          title: string | null;
          grid_type: PrintGridType;
          problem_ids: string[];
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["print_jobs"]["Row"]> & {
          parent_id: string;
          child_id: string;
          problem_ids: string[];
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["print_jobs"]["Row"]>;
      };
      monthly_usage: {
        Row: {
          id: string;
          parent_id: string;
          year_month: string;
          scans_used: number;
          quota_limit: number;
        };
        Insert: Partial<Database["public"]["Tables"]["monthly_usage"]["Row"]> & {
          parent_id: string;
          year_month: string;
          quota_limit: number;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["monthly_usage"]["Row"]>;
      };
      device_sessions: {
        Row: {
          id: string;
          parent_id: string;
          device_id: string;
          device_name: string | null;
          platform: string | null;
          last_seen_at: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["device_sessions"]["Row"]> & {
          parent_id: string;
          device_id: string;
        };
        Relationships: [];
        Update: Partial<Database["public"]["Tables"]["device_sessions"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      consume_scan_quota: {
        Args: { p_parent_id: string; p_scan_id?: string };
        Returns: QuotaSource;
      };
      update_child_carte: {
        Args: { p_child_id: string };
        Returns: undefined;
      };
      enqueue_incorrect_problems: {
        Args: { p_scan_id: string };
        Returns: number;
      };
      assign_daily_reviews: {
        Args: { p_child_id: string; p_date?: string };
        Returns: number;
      };
      record_review_result: {
        Args: { p_review_queue_id: string; p_is_correct: boolean };
        Returns: ReviewItemStatus;
      };
      resolve_leech_problem: {
        Args: { problem_id: string; action: "master" | "requeue" | string };
        Returns: Json;
      };
      register_device_session: {
        Args: {
          p_parent_id: string;
          p_device_id: string;
          p_device_name?: string;
          p_platform?: string;
        };
        Returns: Json;
      };
      create_scan: {
        Args: { p_child_id: string };
        Returns: string;
      };
      revoke_device_session: {
        Args: { p_parent_id: string; p_device_id: string };
        Returns: undefined;
      };
      claim_device_session: {
        Args: {
          p_parent_id: string;
          p_device_id: string;
          p_device_name?: string;
          p_platform?: string;
        };
        Returns: Json;
      };
      heartbeat_device_session: {
        Args: { p_parent_id: string; p_device_id: string };
        Returns: boolean;
      };
      apply_subscription_entitlement: {
        Args: {
          p_parent_id: string;
          p_tier: SubscriptionTier;
          p_app_user_id?: string;
        };
        Returns: SubscriptionTier;
      };
      credit_scan_tickets: {
        Args: { p_parent_id: string; p_product_id: string; p_transaction_id: string };
        Returns: number;
      };
    };
    Enums: {
      subscription_tier: SubscriptionTier;
      grade_code: GradeCode;
      subject_code: SubjectCode;
      problem_type: ProblemType;
      print_grid_type: PrintGridType;
    };
    CompositeTypes: Record<string, never>;
  };
};
