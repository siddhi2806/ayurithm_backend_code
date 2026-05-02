import { supabase } from "./supabase";

// ─── PROFILE QUERIES ────────────────────────────────────────

/** Fetch the current user's profile */
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data;
}

/** Update any profile fields for the current user */
export async function updateProfile(fields: Record<string, unknown>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("profiles")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) throw error;
}

// ─── ASSESSMENT QUERIES ─────────────────────────────────────

interface AssessmentInput {
  assessment_answers: number[];
  dominant_prakriti: string;
  suppressed_prakriti: string;
  prakriti_scores: Record<string, number>;
  location_tag: string | null;
  location_lat: number | null;
  location_lng: number | null;
  system_date: string;
  current_ritu: string;
  food_suggestions?: unknown[];
  blocked_foods?: unknown[];
}

/** Insert a new assessment record for the current user */
export async function insertAssessment(input: AssessmentInput) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("user_assessments")
    .insert({ user_id: user.id, ...input })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Fetch all assessments for the current user, newest first */
export async function getAssessments() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_assessments")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/** Fetch the most recent assessment for the current user */
export async function getLatestAssessment() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_assessments")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
  return data;
}

// ─── ADHERENCE LOG QUERIES ───────────────────────────────────

export interface AdherenceLog {
  id: string;
  user_id: string;
  date: string;
  tasks_total: number;
  tasks_completed: number;
  completion_percentage: number;
  updated_at: string;
}

/** Fetch adherence logs for the last N days (inclusive of today), oldest first */
export async function getAdherenceLogs(days = 5): Promise<AdherenceLog[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("daily_adherence_logs")
    .select("*")
    .eq("user_id", user.id)
    .gte("date", cutoffStr)
    .order("date", { ascending: true });

  if (error) { console.warn("getAdherenceLogs:", error); return []; }
  return (data as AdherenceLog[]) ?? [];
}

/** Upsert today's adherence log (creates or updates the row for today) */
export async function upsertAdherenceLog(
  tasksTotal: number,
  tasksCompleted: number,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const today = new Date().toISOString().split("T")[0];
  const pct   = tasksTotal > 0
    ? Math.round((tasksCompleted / tasksTotal) * 100)
    : 0;

  const { error } = await supabase
    .from("daily_adherence_logs")
    .upsert(
      {
        user_id:               user.id,
        date:                  today,
        tasks_total:           tasksTotal,
        tasks_completed:       tasksCompleted,
        completion_percentage: pct,
        updated_at:            new Date().toISOString(),
      },
      { onConflict: "user_id,date" },
    );

  if (error) console.warn("upsertAdherenceLog:", error);
}
