"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Leaf,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Pill,
  Salad,
  HeartPulse,
  Pencil,
  Save,
  X,
  Check,
  Plus,
  Brain,
  Activity,
  Zap,
  Wind,
  Droplets,
  Flame,
  Sparkles,
  Info,
  LogOut,
  Trash2,
  ChevronDown,
  User,
  UtensilsCrossed,
  ArrowRight,
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { getProfile, getLatestAssessment, updateProfile, getAdherenceLogs, type AdherenceLog } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

// ─── TYPES ──────────────────────────────────────────────────

interface Profile {
  first_name: string;
  last_name: string;
  location_tag: string | null;
  location_lat: number | null;
  location_lng: number | null;
  current_ritu: string | null;
  base_prakriti: {
    dominant: string;
    secondary: string;
    suppressed: string;
    dual_dosha: string;
    scores: Record<string, number>;
  } | null;
  dietary_preference: string | null;
  allergies: string[];
  health_conditions: string[];
  medications: string[];
  doctor_restrictions: string | null;
}

interface Assessment {
  dominant_prakriti: string;
  suppressed_prakriti: string;
  prakriti_scores: Record<string, number>;
  current_ritu: string;
  location_tag: string | null;
}

// ─── CONSTANTS ──────────────────────────────────────────────

// Risk levels: low | moderate | high | highest
interface RituEffect { risk: "low" | "moderate" | "high" | "highest"; text: string; advice: string; }
const RITU_EFFECTS: Record<string, Record<string, RituEffect>> = {
  "Vasant Ritu": {
    Vata: {
      risk: "moderate",
      text: "Vasant's erratic spring weather can aggravate your Vata. Temperature swings disturb Vata's need for stability.",
      advice: "Favour warm, grounding foods; maintain regular routines; avoid cold drafts and raw, dry foods.",
    },
    Pitta: {
      risk: "low",
      text: "Vasant is generally balanced for Pitta. Mild warmth keeps your fire in check without excess heat.",
      advice: "Continue a balanced diet; introduce light bitter greens and cooling herbs as temperatures rise.",
    },
    Kapha: {
      risk: "highest",
      text: "HIGH RISK. Accumulated winter Kapha liquefies in spring sunshine — your dominant Kapha is highly vulnerable to allergies, congestion, and sinus issues this season.",
      advice: "Prioritize light, warm, pungent, and bitter foods. Increase physical activity. Avoid heavy dairy, sweets, and cold foods. Consider Kapha-pacifying herbs like ginger and turmeric.",
    },
  },
  "Grishma Ritu": {
    Vata: {
      risk: "high",
      text: "HIGH RISK. Summer's dryness, hot winds, and exhaustion directly trigger Vata buildup. Your Vata is particularly vulnerable to depletion and irregularity this season.",
      advice: "Stay well-hydrated; favour sweet, heavy, cooling, and oily foods. Avoid excessive exertion, raw dry foods, and the midday sun.",
    },
    Pitta: {
      risk: "high",
      text: "HIGH RISK. Grishma's intense heat is peak aggravation season for your dominant Pitta — expect burning sensations, heightened anger, inflammation, and heat-related issues.",
      advice: "Prioritize cooling, sweet, and bitter tastes. Eat coconut, cucumber, mint, and coriander. Avoid spicy, salty, sour, and fermented foods. Stay in cool environments.",
    },
    Kapha: {
      risk: "low",
      text: "Grishma is beneficial for Kapha. Summer heat naturally melts and reduces your Kapha, leaving you feeling lighter and more energetic.",
      advice: "Leverage this season to be more active. Lighter meals are still ideal; avoid the temptation to overeat simply because digestion feels stronger.",
    },
  },
  "Varsha Ritu": {
    Vata: {
      risk: "highest",
      text: "HIGHEST RISK. Monsoon season is the most dangerous season for your Vata constitution. Cold, damp weather combined with erratic digestion (weakened Agni) creates severe Vata imbalance.",
      advice: "Eat warm, oily, grounding, and easily digestible foods. Favour soups, khichdi, and ghee. Avoid raw foods, cold drinks, and irregular mealtimes. Daily oil massage (Abhyanga) is highly recommended.",
    },
    Pitta: {
      risk: "moderate",
      text: "Varsha accumulates Pitta — fermented and acidic foods combined with variable humidity can trigger acidity and inflammatory flare-ups for your Pitta constitution.",
      advice: "Avoid sour, fermented, and spicy foods. Favour light, warm, and bitter foods. Watch for acid reflux and skin inflammation.",
    },
    Kapha: {
      risk: "moderate",
      text: "Monsoon humidity is a moderate risk for Kapha — moisture-laden air can lead to congestion, lethargy, and dampness-related Kapha accumulation.",
      advice: "Stay active indoors. Favour warm, light, spiced foods. Avoid cold, heavy, and oily foods. Use warming spices like black pepper and ginger daily.",
    },
  },
  "Sharad Ritu": {
    Vata: {
      risk: "low",
      text: "Sharad tends to balance Vata following the monsoon season. Your Vata finds greater stability as the rains subside and the air clears.",
      advice: "Ease gently back to routine. Favour sweet, slightly cooling foods. Avoid extremes — neither excessively hot nor cold.",
    },
    Pitta: {
      risk: "highest",
      text: "HIGHEST RISK. Sharad is peak Pitta aggravation season. Bright sunshine immediately after rains creates extreme Pitta accumulation — expect skin rashes, inflammation, fever, and heightened irritability.",
      advice: "Strictly follow a Pitta-pacifying diet: cooling, sweet, bitter, and astringent tastes. Avoid spicy, sour, salty, and fermented foods. Use cooling herbs like shatavari, amalaki, and coriander.",
    },
    Kapha: {
      risk: "low",
      text: "Sharad is mostly balanced for Kapha. Post-monsoon clarity and dry air keep Kapha in check.",
      advice: "Maintain a moderate, active routine. Favour light seasonal foods and avoid heavy, oily preparations.",
    },
  },
  "Hemant Ritu": {
    Vata: {
      risk: "moderate",
      text: "Early winter's cold begins to aggravate Vata. Your constitution requires extra warmth and nourishment as temperatures drop.",
      advice: "Eat warm, heavy, nourishing, and oily foods — soups, root vegetables, warm ghee, and sesame. Keep warm; avoid cold and dry environments.",
    },
    Pitta: {
      risk: "low",
      text: "Hemant is a good season for Pitta. Cold weather pacifies your fire naturally, and your digestive Agni is at its strongest.",
      advice: "Enjoy heartily nourishing, wholesome foods. Your strong Agni handles heavier meals well this season. Avoid excess spice and fermented foods.",
    },
    Kapha: {
      risk: "high",
      text: "HIGH RISK. Cold weather begins significant Kapha accumulation this season. Heaviness, cold, and potential congestion threaten your dominant Kapha.",
      advice: "Favour warming, pungent, and light foods. Avoid cold, heavy, oily, and sweet foods. Increase physical activity. Use warming spices — ginger, black pepper, and cinnamon.",
    },
  },
  "Shishir Ritu": {
    Vata: {
      risk: "high",
      text: "HIGH RISK. Deep winter's peak cold and dryness maximally aggravate Vata. Your constitution is highly stressed — expect joint stiffness, dry skin, anxiety, and digestive irregularity.",
      advice: "Maximize warm, heavy, sweet, and oily nourishment. Daily Abhyanga (warm oil massage) is essential. Sesame oil, ghee, warm milk, and root vegetables are your allies.",
    },
    Pitta: {
      risk: "low",
      text: "Shishir keeps Pitta calm and stable. Your digestive fire (Agni) is at its strongest — this is your most nourishing season.",
      advice: "Enjoy rich, wholesome, and nourishing foods freely. Maintain warmth; leverage your strong digestion to build Ojas (vital essence).",
    },
    Kapha: {
      risk: "high",
      text: "HIGH RISK. Late winter maximally accumulates Kapha. Heaviness, lethargy, cold, and congestion are at their peak threat for your constitution.",
      advice: "Counter with vigorous daily exercise, pungent and light foods, warming spices, and dry brushing. Strictly avoid cold, heavy, oily, and sweet foods. Start preparing for spring Kapha detox.",
    },
  },
};

const DOSHA_ICONS: Record<string, typeof Wind> = { Vata: Wind, Pitta: Flame, Kapha: Droplets };
const DOSHA_COLORS: Record<string, string> = {
  Vata: "#A78BFA",
  Pitta: "#FB923C",
  Kapha: "#60A5FA",
};

const DIETARY_LABELS: Record<string, string> = {
  vegetarian: "Vegetarian",
  "lacto-vegetarian": "Lacto-Vegetarian",
  "lacto-ovo-vegetarian": "Lacto-Ovo-Vegetarian",
  "non-vegetarian": "Non-Vegetarian",
};

const ALLERGY_OPTIONS = [
  "Dairy / Milk", "Eggs", "Peanuts", "Tree Nuts", "Gluten / Wheat", "Soy", "Fish", "Shellfish",
  "Chickpea", "Lentils", "Black Gram", "Kidney Beans", "Sesame", "Mustard", "Brinjal", "Banana",
];

const CONDITION_OPTIONS = [
  "High Blood Pressure", "High Cholesterol / Dyslipidemia", "Heart Disease", "Stroke",
  "Diabetes (Type 1)", "Diabetes (Type 2)", "Thyroid Imbalance", "PCOD / PCOS", "Obesity",
  "Acid Reflux / GERD", "IBS", "IBD", "NAFLD", "Chronic Constipation",
  "Arthritis", "Gout / High Uric Acid", "Osteoporosis",
];

const SYNC_STEPS = [
  "Syncing to GNN Knowledge Graph...",
  "Re-indexing Allergy Nodes...",
  "Updating Pharmacological Map...",
  "Validating Safety Constraints...",
  "Profile Synced Successfully ✓",
];

// ─── FALLING LEAVES ─────────────────────────────────────────
const LEAF_CONFIGS = [
  { size: 14, x: 8,  startOffset: 0.00, dur: 15, sway: 20,  opacity: 0.12 },
  { size: 10, x: 25, startOffset: 0.25, dur: 18, sway: -16, opacity: 0.09 },
  { size: 17, x: 45, startOffset: 0.45, dur: 13, sway: 24,  opacity: 0.14 },
  { size: 9,  x: 62, startOffset: 0.60, dur: 17, sway: -14, opacity: 0.08 },
  { size: 13, x: 78, startOffset: 0.75, dur: 14, sway: 18,  opacity: 0.11 },
  { size: 16, x: 92, startOffset: 0.90, dur: 12, sway: -22, opacity: 0.13 },
];

function FallingLeaves() {
  return (
    <>
      <style>{`
        @keyframes dashLeafDrop {
          0%   { transform: translateY(-10vh); opacity: 0; }
          6%   { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(110vh); opacity: 0; }
        }
        @keyframes dashLeafDrift {
          0%, 100% { transform: translateX(0px) rotate(0deg); }
          25%      { transform: translateX(var(--sway)) rotate(55deg); }
          50%      { transform: translateX(0px) rotate(110deg); }
          75%      { transform: translateX(calc(var(--sway) * -0.6)) rotate(165deg); }
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {LEAF_CONFIGS.map((leaf, i) => {
          const dropDelay = -(leaf.startOffset * leaf.dur);
          const driftDur = leaf.dur * 0.75;
          const driftDelay = -(leaf.startOffset * driftDur);
          return (
            <div key={i} style={{
              position: "absolute", top: 0, left: `${leaf.x}%`, opacity: leaf.opacity,
              ["--sway" as string]: `${leaf.sway}px`,
              animation: `dashLeafDrop ${leaf.dur}s linear ${dropDelay.toFixed(2)}s infinite`,
            }}>
              <div style={{ animation: `dashLeafDrift ${driftDur.toFixed(2)}s ease-in-out ${driftDelay.toFixed(2)}s infinite` }}>
                <svg width={leaf.size} height={leaf.size} viewBox="0 0 24 24" fill="none"
                  style={{ display: "block", filter: `drop-shadow(0 0 ${Math.round(leaf.size * 0.4)}px rgba(57,255,20,0.45))` }}>
                  <path d="M12 2C6 2 2 8 2 14c0 4 2.5 7 6 8 0-4 2-8 4-10-2 3-3 7-3 10h2c0-3 1-7 3-9-1 3-2 6-2 9h2c0-4 1-7 3-9 0 4-1 7-1 9h2c0-3-.5-7 0-10 2-3 4-6 4-8C22 6 18 2 12 2z"
                    fill="rgba(57,255,20,0.5)" />
                  <path d="M12 4c0 0 0 8 0 16" stroke="rgba(167,243,208,0.35)" strokeWidth="0.8" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── TOOLTIP ────────────────────────────────────────────────
function GNNTooltip({ children, text }: { children: React.ReactNode; text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <AnimatePresence>
        {show && (
          <motion.span
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-black/90 border border-gray-700 rounded-lg text-[10px] text-gray-300 whitespace-nowrap z-50 pointer-events-none"
          >
            <span className="flex items-center gap-1.5">
              <Brain size={10} className="text-accent-green shrink-0" />
              {text}
            </span>
            <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-black/90" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─── TAG INPUT (for edit mode) ──────────────────────────────
function TagEditor({
  allOptions,
  selected,
  onToggle,
  custom,
  setCustom,
}: {
  allOptions: string[];
  selected: Set<string>;
  onToggle: (item: string) => void;
  custom: string[];
  setCustom: (c: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const addTag = () => {
    const t = input.trim();
    if (t && !custom.includes(t) && !allOptions.includes(t)) {
      setCustom([...custom, t]);
      setInput("");
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {allOptions.map((opt) => (
          <button key={opt} onClick={() => onToggle(opt)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
              selected.has(opt)
                ? "bg-accent-green/15 border-accent-green/50 text-accent-green"
                : "bg-black/30 border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-400"
            }`}>{opt}</button>
        ))}
      </div>
      {custom.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {custom.map((t) => (
            <span key={t} className="flex items-center gap-1 bg-accent-green/10 text-accent-green text-xs px-2 py-1 rounded-md border border-accent-green/20">
              {t}
              <button onClick={() => setCustom(custom.filter((c) => c !== t))} className="hover:text-white"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
          placeholder="Add other..." className="flex-1 bg-black/40 border border-gray-700 focus:border-accent-green rounded-lg px-3 py-2 text-xs text-white outline-none transition-colors" />
        <button onClick={addTag} disabled={!input.trim()}
          className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:text-accent-green hover:border-accent-green/50 transition-colors disabled:opacity-30">
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── ADHERENCE CHART HELPERS ───────────────────────────────
function buildAdherenceChart30(logs: AdherenceLog[]): { label: string; value: number | null }[] {
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const ds = d.toISOString().split("T")[0];
    const log = logs.find((l) => l.date === ds);
    return {
      label: i === 29 ? "Today" : `${DAYS[d.getDay()]} ${d.getDate()}`,
      value: log ? Math.round(log.completion_percentage) : null,
    };
  });
}

function calcStreak(logs: AdherenceLog[]): number {
  if (logs.length === 0) return 0;
  const today = new Date().toISOString().split("T")[0];
  let streak = 0;
  for (let i = 0; i < 31; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    const log = logs.find((l) => l.date === ds);
    if (log && log.completion_percentage > 0) {
      streak++;
    } else if (ds === today) {
      continue; // today not yet logged — don't break streak
    } else {
      break;
    }
  }
  return streak;
}

// ─── DOSHA RADAR CHART ──────────────────────────────────────
function DoshaRadar({ scores }: { scores: Record<string, number> }) {
  const data = Object.entries(scores).map(([name, value]) => ({
    dosha: name,
    value: Math.round(value * 100),
    fullMark: 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke="rgba(57,255,20,0.1)" />
        <PolarAngleAxis
          dataKey="dosha"
          tick={{ fill: "#A7F3D0", fontSize: 11, fontWeight: 500 }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={false}
          axisLine={false}
        />
        <Radar
          name="Dosha"
          dataKey="value"
          stroke="#39FF14"
          fill="#39FF14"
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════
export default function Dashboard() {
  const router = useRouter();

  // ── Data state ──
  const [profile, setProfile] = useState<Profile | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [adherenceLogs, setAdherenceLogs] = useState<AdherenceLog[]>([]);

  // ── Account menu state ──
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Close menu on outside click (checks both button wrapper and portal panel)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inBtn = menuRef.current?.contains(target);
      const inPanel = portalRef.current?.contains(target);
      if (!inBtn && !inPanel) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Sign out ──
  const handleSignOut = async () => {
    setAccountActionLoading(true);
    await supabase.auth.signOut();
    router.push("/");
  };

  // ── Delete account ──
  const handleDeleteAccount = async () => {
    setAccountActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Delete all user data (profiles cascade handles related rows)
        await supabase.from("user_assessments").delete().eq("user_id", user.id);
        await supabase.from("profiles").delete().eq("id", user.id);
      }
      await supabase.auth.signOut();
      router.push("/");
    } catch (err) {
      console.error("Delete account error:", err);
      setAccountActionLoading(false);
    }
  };

  // ── Edit state ──
  const [editing, setEditing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState(0);

  // ── Editable copies ──
  const [editDiet, setEditDiet] = useState("");
  const [editAllergies, setEditAllergies] = useState<Set<string>>(new Set());
  const [editCustomAllergies, setEditCustomAllergies] = useState<string[]>([]);
  const [editConditions, setEditConditions] = useState<Set<string>>(new Set());
  const [editCustomConditions, setEditCustomConditions] = useState<string[]>([]);
  const [editMeds, setEditMeds] = useState("");
  const [editRestrictions, setEditRestrictions] = useState("");

  // Guard against React StrictMode double-invocation which causes Supabase lock contention
  const hasLoaded = useRef(false);

  // ── Fetch on mount ──
  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [p, a, adh] = await Promise.all([getProfile(), getLatestAssessment(), getAdherenceLogs(30)]);
        if (p) {
          setProfile(p as Profile);
          // Reverse-geocode the stored lat/lng for a human-readable location label
          const lat = (p as Profile).location_lat;
          const lng = (p as Profile).location_lng;
          if (lat != null && lng != null) {
            try {
              const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
                { headers: { "Accept-Language": "en", "User-Agent": "AyuRithm/1.0" } }
              );
              if (geoRes.ok) {
                const geoData = await geoRes.json();
                const addr = geoData.address ?? {};
                const city = addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? addr.suburb ?? "";
                const district = addr.county ?? addr.state_district ?? addr.district ?? "";
                const state = addr.state ?? "";
                const parts = [city, district, state].filter(Boolean);
                if (parts.length > 0) setLocationLabel(parts.join(", "));
              }
            } catch { /* fall back to location_tag display */ }
          }
        }
        if (a) setAssessment(a as Assessment);
        setAdherenceLogs(adh);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Enter edit mode ──
  const startEditing = () => {
    if (!profile) return;
    setEditDiet(profile.dietary_preference ?? "");
    const knownAllergies = (profile.allergies ?? []).filter((a) => ALLERGY_OPTIONS.includes(a));
    const customAllergies = (profile.allergies ?? []).filter((a) => !ALLERGY_OPTIONS.includes(a));
    setEditAllergies(new Set(knownAllergies));
    setEditCustomAllergies(customAllergies);
    const knownConds = (profile.health_conditions ?? []).filter((c) => CONDITION_OPTIONS.includes(c));
    const customConds = (profile.health_conditions ?? []).filter((c) => !CONDITION_OPTIONS.includes(c));
    setEditConditions(new Set(knownConds));
    setEditCustomConditions(customConds);
    setEditMeds((profile.medications ?? []).join(", "));
    setEditRestrictions(profile.doctor_restrictions ?? "");
    setEditing(true);
  };

  // ── Save edits ──
  const saveEdits = useCallback(async () => {
    setSyncing(true);
    setSyncStep(0);

    const payload = {
      dietary_preference: editDiet || null,
      allergies: [...Array.from(editAllergies), ...editCustomAllergies],
      health_conditions: [...Array.from(editConditions), ...editCustomConditions],
      medications: editMeds.trim() ? editMeds.split(",").map((s) => s.trim()).filter(Boolean) : [],
      doctor_restrictions: editRestrictions.trim() || null,
    };

    const stepInterval = setInterval(() => {
      setSyncStep((prev) => {
        if (prev >= SYNC_STEPS.length - 1) { clearInterval(stepInterval); return prev; }
        return prev + 1;
      });
    }, 650);

    try {
      await updateProfile(payload);
      // Refresh local state
      setProfile((prev) => prev ? { ...prev, ...payload } : prev);
    } catch (err) {
      console.error("Dashboard save error:", err);
    }

    await new Promise((r) => setTimeout(r, SYNC_STEPS.length * 650 + 400));
    clearInterval(stepInterval);
    setSyncing(false);
    setEditing(false);
  }, [editDiet, editAllergies, editCustomAllergies, editConditions, editCustomConditions, editMeds, editRestrictions]);

  // ── Helpers ──
  const doshaScores = profile?.base_prakriti?.scores ?? assessment?.prakriti_scores ?? {};
  const dominant = profile?.base_prakriti?.dominant ?? assessment?.dominant_prakriti ?? "—";
  const secondary = profile?.base_prakriti?.secondary ?? "—";
  const suppressed = profile?.base_prakriti?.suppressed ?? assessment?.suppressed_prakriti ?? "—";
  const dualDosha = profile?.base_prakriti?.dual_dosha ?? `${dominant}-${secondary}`;
  const ritu = profile?.current_ritu ?? assessment?.current_ritu ?? "—";
  const location = locationLabel ?? profile?.location_tag?.replace(/_/g, " ") ?? assessment?.location_tag?.replace(/_/g, " ") ?? "—";
  const hasMedAlerts = (profile?.medications?.length ?? 0) > 0 || (profile?.health_conditions?.length ?? 0) > 0;

  const getRituEffect = () => {
    const effects = RITU_EFFECTS[ritu];
    if (!effects) return null;
    return effects[dominant] ?? effects[secondary] ?? Object.values(effects)[0] ?? null;
  };

  const RISK_STYLES: Record<string, string> = {
    low:     "bg-emerald-950/50 text-emerald-400 border-emerald-800/40",
    moderate:"bg-yellow-950/50 text-yellow-400 border-yellow-800/40",
    high:    "bg-orange-950/50 text-orange-400 border-orange-800/40",
    highest: "bg-red-950/50 text-red-400 border-red-800/40",
  };

  // ── Analytics computations ──
  const chart30    = buildAdherenceChart30(adherenceLogs);
  const loggedDays = adherenceLogs.filter((l) => l.completion_percentage > 0);
  const avg30      = loggedDays.length > 0
    ? Math.round(loggedDays.reduce((s, l) => s + l.completion_percentage, 0) / loggedDays.length)
    : 0;
  const best30     = loggedDays.length > 0
    ? Math.round(Math.max(...loggedDays.map((l) => l.completion_percentage)))
    : 0;
  const totalDone  = adherenceLogs.reduce((s, l) => s + l.tasks_completed, 0);
  const streak     = calcStreak(adherenceLogs);

  // ── Card stagger ──
  const stagger = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.1 } },
  };
  const cardIn = {
    hidden: { opacity: 0, y: 28, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: "easeOut" as const } },
  };

  // ═══════════════════════════════════════════════════════════
  // LOADING
  // ═══════════════════════════════════════════════════════════
  if (loading) {
    return (
      <main className="min-h-screen bg-void-green flex items-center justify-center">
        <FallingLeaves />
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-center z-10"
        >
          <Activity size={32} className="text-accent-green mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Initializing Biophilic Command Center...</p>
        </motion.div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-void-green flex items-center justify-center">
        <div className="glass-panel p-8 text-center max-w-sm">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-4" />
          <p className="text-gray-300">Profile not found. Please complete onboarding first.</p>
        </div>
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  const DominantIcon = DOSHA_ICONS[dominant] ?? Zap;
  const SuppressedIcon = DOSHA_ICONS[suppressed] ?? Zap;

  return (
    <main className="min-h-screen bg-void-green relative overflow-x-hidden">
      <FallingLeaves />

      {/* ── Dashboard BG ── */}
      <style>{`
        @keyframes dashBgFloat {
          0%   { transform: translate(-50%, -50%) scale(1.06) rotate(-2deg) translateY(0px);   }
          25%  { transform: translate(-50%, -50%) scale(1.10) rotate(0deg)  translateY(-22px);  }
          50%  { transform: translate(-50%, -50%) scale(1.07) rotate(2deg)  translateY(14px);   }
          75%  { transform: translate(-50%, -50%) scale(1.09) rotate(0deg)  translateY(-10px);  }
          100% { transform: translate(-50%, -50%) scale(1.06) rotate(-2deg) translateY(0px);   }
        }
        @keyframes dashBgGlow {
          0%, 100% {
            filter: blur(0px) brightness(1.4) saturate(2.2) opacity(0.44)
                    hue-rotate(0deg)
                    drop-shadow(0 0 48px rgba(57,255,20,0.30))
                    drop-shadow(0 0 96px rgba(57,255,20,0.16))
                    drop-shadow(0 0 180px rgba(167,139,250,0.12));
          }
          33% {
            filter: blur(0px) brightness(1.55) saturate(2.6) opacity(0.56)
                    hue-rotate(18deg)
                    drop-shadow(0 0 72px rgba(57,255,20,0.42))
                    drop-shadow(0 0 140px rgba(251,146,60,0.20))
                    drop-shadow(0 0 240px rgba(57,255,20,0.10));
          }
          66% {
            filter: blur(0px) brightness(1.45) saturate(2.4) opacity(0.50)
                    hue-rotate(-12deg)
                    drop-shadow(0 0 60px rgba(96,165,250,0.28))
                    drop-shadow(0 0 120px rgba(57,255,20,0.22))
                    drop-shadow(0 0 200px rgba(167,139,250,0.16));
          }
        }
        @keyframes dashBgPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.82; }
        }
        .dash-bg {
          position: fixed;
          top: 50%;
          left: 50%;
          width: 135vw;
          height: 135vh;
          object-fit: contain;
          transform: translate(-50%, -50%);
          pointer-events: none;
          mix-blend-mode: screen;
          animation:
            dashBgFloat 20s ease-in-out infinite,
            dashBgGlow  12s ease-in-out infinite,
            dashBgPulse  6s ease-in-out infinite;
          z-index: 0;
        }

        /* ── Boosted card contrast for lotus bg ── */
        .dash-frame .glass-panel {
          background: rgba(6, 12, 7, 0.91);
          border: 1px solid rgba(57, 255, 20, 0.22);
          box-shadow:
            0 8px 48px rgba(0, 0, 0, 0.72),
            0 0 0 1px rgba(57, 255, 20, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }
        .dash-frame .glass-panel:hover {
          border: 1px solid rgba(57, 255, 20, 0.38);
          box-shadow:
            0 8px 56px rgba(0, 0, 0, 0.78),
            0 0 28px rgba(57, 255, 20, 0.07);
        }

        /* ── Text brightness boosts ── */
        .dash-frame .text-gray-300 { color: rgb(243 244 246) !important; }
        .dash-frame .text-gray-400 { color: rgb(229 231 235) !important; }
        .dash-frame .text-gray-500 { color: rgb(209 213 219) !important; }
        .dash-frame .text-gray-600 { color: rgb(156 163 175) !important; }
      `}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/dash_bg.png" alt="" aria-hidden="true" className="dash-bg" />

      {/* ── Sync Overlay ── */}
      <AnimatePresence>
        {syncing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-void-green/95 backdrop-blur-sm"
          >
            <div className="w-full max-w-md glass-panel p-10 text-center">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="mx-auto w-16 h-16 mb-6 p-3 rounded-full bg-accent-green/10 border border-accent-green/20 flex items-center justify-center"
              >
                <Brain size={28} className="text-accent-green" />
              </motion.div>
              <h2 className="text-xl text-white font-light mb-6">Updating Safety Graph</h2>
              <div className="space-y-3 font-mono text-xs text-left">
                {SYNC_STEPS.map((step, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0.2, x: -10 }}
                    animate={{ opacity: i <= syncStep ? 1 : 0.2, x: i <= syncStep ? 0 : -10 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3"
                  >
                    {i < syncStep ? (
                      <Check size={14} className="text-accent-green shrink-0" />
                    ) : i === syncStep ? (
                      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity }}
                        className="w-3.5 h-3.5 rounded-full bg-accent-green shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full bg-gray-700 shrink-0" />
                    )}
                    <span className={i <= syncStep ? "text-gray-300" : "text-gray-600"}>{step}</span>
                  </motion.div>
                ))}
              </div>
              <div className="mt-8 h-1.5 bg-black/40 rounded-full overflow-hidden">
                <motion.div className="h-full bg-accent-green rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${((syncStep + 1) / SYNC_STEPS.length) * 100}%` }}
                  transition={{ duration: 0.35 }} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dashboard Content ── */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="dash-frame relative z-10 max-w-7xl mx-auto p-4 md:p-8"
      >
        {/* ── Delete Confirm Modal ── */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                className="glass-panel p-8 max-w-sm w-full mx-4 text-center"
              >
                <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-red-950/50 border border-red-800/40 flex items-center justify-center">
                  <Trash2 size={22} className="text-red-400" />
                </div>
                <h2 className="text-white text-lg font-medium mb-2">Delete Account?</h2>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">
                  This will permanently delete your profile, Prakriti data, and all assessments. This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={accountActionLoading}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:border-gray-500 transition-all text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={accountActionLoading}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-red-700/50 bg-red-950/30 text-red-400 hover:bg-red-950/50 transition-all text-sm font-medium disabled:opacity-50"
                  >
                    {accountActionLoading ? "Deleting..." : "Yes, Delete"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════ CARD 1: IDENTITY HEADER ═══════ */}
        <motion.div variants={cardIn} className="glass-panel p-6 md:p-8 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <p className="text-xs text-accent-green uppercase tracking-[0.3em] mb-1">
                  <Sparkles size={12} className="inline mr-1.5 mb-0.5" />
                  Biophilic Command Center
                </p>
                <h1 className="text-2xl md:text-3xl font-light text-white">
                  Welcome, <span className="text-accent-green font-normal">{profile.first_name}</span>
                </h1>
              </motion.div>
            </div>

            <div className="flex items-center gap-6">
              {/* Location */}
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="p-2 rounded-lg bg-emerald-900/30"
                >
                  <MapPin size={16} className="text-pastel-green" />
                </motion.div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Region</p>
                  <p className="text-sm text-gray-300">{location}</p>
                </div>
              </div>

              {/* Ritu */}
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.15, 1], rotate: [0, 8, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="p-2 rounded-lg bg-emerald-900/30"
                >
                  <Leaf size={16} className="text-pastel-green" />
                </motion.div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Current Ritu</p>
                  <p className="text-sm text-gray-300">{ritu}</p>
                </div>
              </div>

              {/* ── Account Menu ── */}
              <div className="relative" ref={menuRef}>
                <button
                  ref={menuBtnRef}
                  onClick={() => {
                    if (!menuOpen && menuBtnRef.current) {
                      const rect = menuBtnRef.current.getBoundingClientRect();
                      setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                    }
                    setMenuOpen((o) => !o);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-700 hover:border-accent-green/40 transition-all group"
                >
                  <div className="w-7 h-7 rounded-full bg-accent-green/10 border border-accent-green/20 flex items-center justify-center">
                    <User size={13} className="text-accent-green" />
                  </div>
                  <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors hidden sm:block">
                    {profile.first_name}
                  </span>
                  <ChevronDown size={12} className={`text-gray-500 transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              {/* Dropdown rendered via portal to escape backdrop-filter stacking contexts */}
              {mounted && createPortal(
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      ref={portalRef}
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      style={{ position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
                      className="w-48 bg-black/95 border border-gray-800 rounded-xl overflow-hidden shadow-2xl"
                    >
                      <div className="px-4 py-3 border-b border-gray-800">
                        <p className="text-xs text-white font-medium">{profile.first_name} {profile.last_name}</p>
                        <p className="text-[10px] text-gray-500 truncate mt-0.5">AyuRithm Account</p>
                      </div>
                      <button
                        onClick={handleSignOut}
                        disabled={accountActionLoading}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-white/5 hover:text-white transition-colors text-left disabled:opacity-50"
                      >
                        <LogOut size={14} className="text-gray-500" />
                        Sign Out
                      </button>
                      <button
                        onClick={() => { setMenuOpen(false); setShowDeleteConfirm(true); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-950/30 transition-colors text-left border-t border-gray-800"
                      >
                        <Trash2 size={14} className="text-red-500" />
                        Delete Account
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>,
                document.body
              )}
            </div>
          </div>
        </motion.div>

        {/* ═══════ BENTO GRID ═══════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ═══════ CARD 2: PRAKRITI DNA CARD (col span 1, tall) ═══════ */}
          <motion.div variants={cardIn} className="lg:row-span-2 relative overflow-hidden">
            {/* Glow gradient background */}
            <div className="absolute inset-0 rounded-[1.25rem] overflow-hidden pointer-events-none">
              <div className="absolute inset-0 bg-linear-to-br from-purple-900/20 via-transparent to-emerald-900/20" />
              <motion.div
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 bg-linear-to-t from-accent-green/5 via-transparent to-purple-500/5"
              />
            </div>

            <div className="glass-panel p-6 h-full relative">
              {/* Lock badge */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-accent-green/10 border border-accent-green/15">
                    <Activity size={20} className="text-accent-green" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium text-sm">Prakriti Core</h3>
                    <p className="text-[10px] text-gray-500">Immutable Constitution</p>
                  </div>
                </div>
                <GNNTooltip text="Your core constitution (Prakriti) is established at birth and remains constant.">
                  <div className="p-2 rounded-lg bg-gray-800/50 border border-gray-700/50 cursor-help">
                    <Lock size={14} className="text-gray-500" />
                  </div>
                </GNNTooltip>
              </div>

              {/* Dual Dosha Title */}
              <div className="text-center mb-4">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Dual Dosha</p>
                <div className="flex items-center justify-center gap-3">
                  <DominantIcon size={22} style={{ color: DOSHA_COLORS[dominant] ?? "#39FF14" }} />
                  <h2 className="text-2xl font-light text-white tracking-wide">{dualDosha}</h2>
                </div>
              </div>

              {/* Radar chart */}
              {Object.keys(doshaScores).length > 0 && (
                <div className="mb-4">
                  <DoshaRadar scores={doshaScores} />
                </div>
              )}

              {/* Dosha breakdown */}
              <div className="space-y-2.5 mb-5">
                {[
                  { label: "Dominant", dosha: dominant, color: DOSHA_COLORS[dominant] },
                  { label: "Secondary", dosha: secondary, color: DOSHA_COLORS[secondary] },
                  { label: "Suppressed", dosha: suppressed, color: DOSHA_COLORS[suppressed] },
                ].map((d) => {
                  const score = doshaScores[d.dosha];
                  return (
                    <div key={d.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color ?? "#666" }} />
                        <span className="text-xs text-gray-400">{d.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-300 font-medium">{d.dosha}</span>
                        {score !== undefined && (
                          <span className="text-[10px] text-gray-500 font-mono">
                            {Math.round(score * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Ritu Effect */}
              {getRituEffect() && (() => {
                const effect = getRituEffect()!;
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="bg-black/30 border border-gray-800 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Leaf size={12} className="text-pastel-green" />
                        <p className="text-[10px] text-pastel-green uppercase tracking-widest">Ritu Effect</p>
                      </div>
                      <span className={`text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border font-medium ${RISK_STYLES[effect.risk]}`}>
                        {effect.risk === "highest" ? "⚠ Highest Risk" : effect.risk === "high" ? "⚠ High Risk" : effect.risk === "moderate" ? "Moderate" : "Low Risk"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{effect.text}</p>
                  </motion.div>
                );
              })()}
            </div>
          </motion.div>

          {/* ═══════ RIGHT COLUMN: HEALTH CARDS (col span 2) ═══════ */}
          <div className="lg:col-span-2 space-y-6">

            {/* ── Edit controls ── */}
            <motion.div variants={cardIn} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-accent-green" />
                <span className="text-xs text-gray-500 uppercase tracking-[0.2em]">Health &amp; Diet Profile</span>
              </div>
              {!editing ? (
                <button onClick={startEditing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-700 text-gray-400 hover:border-accent-green/50 hover:text-accent-green transition-all text-xs">
                  <Pencil size={12} /> Update Vitals
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-700 text-gray-400 hover:border-red-500/50 hover:text-red-400 transition-all text-xs">
                    <X size={12} /> Cancel
                  </button>
                  <button onClick={saveEdits}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-accent-green/50 text-accent-green hover:bg-accent-green/10 transition-all text-xs">
                    <Save size={12} /> Save &amp; Sync
                  </button>
                </div>
              )}
            </motion.div>

            {/* ═══════ CARD 3: DIETARY & ALLERGIES ═══════ */}
            <motion.div variants={cardIn} layout className="glass-panel p-6">
              <AnimatePresence mode="wait">
                {!editing ? (
                  /* ── DISPLAY MODE ── */
                  <motion.div key="display-diet" initial={{ opacity: 0, rotateY: -5 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0, rotateY: 5 }} transition={{ duration: 0.35 }}>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="p-2.5 rounded-lg bg-emerald-900/30 text-pastel-green"><Salad size={20} /></div>
                      <h3 className="text-white font-medium text-sm">Dietary Preferences &amp; Allergies</h3>
                    </div>

                    {/* Diet tag */}
                    <div className="mb-5">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Primary Diet</p>
                      {profile.dietary_preference ? (
                        <span className="inline-block bg-accent-green text-void-green px-3 py-1 rounded-full text-xs font-medium">
                          {DIETARY_LABELS[profile.dietary_preference] ?? profile.dietary_preference}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600">Not specified</span>
                      )}
                    </div>

                    {/* Allergens */}
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Allergens</p>
                      {(profile.allergies?.length ?? 0) > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {profile.allergies.map((a) => (
                            <GNNTooltip key={a} text={`GNN monitoring: ${a} interactions`}>
                              <motion.span whileHover={{ scale: 1.05, y: -2 }}
                                className="inline-block bg-red-950/40 text-red-400 border border-red-800/30 px-3 py-1.5 rounded-lg text-xs cursor-help">
                                {a}
                              </motion.span>
                            </GNNTooltip>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600 flex items-center gap-1.5">
                          <Check size={12} className="text-accent-green" /> No known allergies
                        </span>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  /* ── EDIT MODE ── */
                  <motion.div key="edit-diet" initial={{ opacity: 0, rotateY: 5 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0, rotateY: -5 }} transition={{ duration: 0.35 }}>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="p-2.5 rounded-lg bg-emerald-900/30 text-pastel-green"><Salad size={20} /></div>
                      <h3 className="text-white font-medium text-sm">Edit Dietary Preferences &amp; Allergies</h3>
                    </div>

                    {/* Diet selector */}
                    <div className="mb-5">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Primary Diet</p>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(DIETARY_LABELS).map(([val, label]) => (
                          <button key={val} onClick={() => setEditDiet(val)}
                            className={`px-3 py-2.5 rounded-xl border text-xs text-left transition-all ${
                              editDiet === val
                                ? "bg-accent-green/15 border-accent-green/50 text-accent-green"
                                : "bg-black/25 border-gray-700 text-gray-400 hover:border-gray-500"
                            }`}>{label}</button>
                        ))}
                      </div>
                    </div>

                    {/* Allergy editor */}
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Allergens</p>
                      <TagEditor
                        allOptions={ALLERGY_OPTIONS}
                        selected={editAllergies}
                        onToggle={(item) => {
                          setEditAllergies((prev) => {
                            const n = new Set(prev);
                            if (n.has(item)) n.delete(item); else n.add(item);
                            return n;
                          });
                        }}
                        custom={editCustomAllergies}
                        setCustom={setEditCustomAllergies}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ═══════ CARD 4: MEDICAL SAFETY PROFILE ═══════ */}
            <motion.div variants={cardIn} layout className="relative">
              {/* Alert glow border */}
              {hasMedAlerts && !editing && (
                <motion.div
                  animate={{ opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -inset-px rounded-[1.25rem] pointer-events-none z-0"
                  style={{
                    background: "linear-gradient(135deg, rgba(251,146,60,0.2), transparent 40%, transparent 60%, rgba(251,146,60,0.15))",
                    boxShadow: "0 0 20px rgba(251,146,60,0.08), inset 0 0 20px rgba(251,146,60,0.03)",
                  }}
                />
              )}

              <div className="glass-panel p-6 relative z-10">
                <AnimatePresence mode="wait">
                  {!editing ? (
                    /* ── DISPLAY MODE ── */
                    <motion.div key="display-med" initial={{ opacity: 0, rotateY: -5 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0, rotateY: 5 }} transition={{ duration: 0.35 }}>
                      <div className="flex items-center gap-3 mb-5">
                        <div className={`p-2.5 rounded-lg ${hasMedAlerts ? "bg-orange-900/30 text-orange-400" : "bg-blue-900/30 text-blue-400"}`}>
                          <HeartPulse size={20} />
                        </div>
                        <div>
                          <h3 className="text-white font-medium text-sm">Medical Safety Profile</h3>
                          {hasMedAlerts && (
                            <p className="text-[10px] text-orange-400 flex items-center gap-1 mt-0.5">
                              <AlertTriangle size={10} /> Active safety monitoring
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Health Conditions */}
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Conditions</p>
                          {(profile.health_conditions?.length ?? 0) > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {profile.health_conditions.map((c) => (
                                <GNNTooltip key={c} text={`GNN monitoring: ${c} drug interactions & dietary conflicts`}>
                                  <motion.span whileHover={{ scale: 1.05, y: -2 }}
                                    className="inline-block bg-orange-950/40 text-orange-400 border border-orange-800/30 px-2.5 py-1 rounded-lg text-[11px] cursor-help">
                                    {c}
                                  </motion.span>
                                </GNNTooltip>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-600 flex items-center gap-1.5">
                              <Check size={12} className="text-accent-green" /> None reported
                            </span>
                          )}
                        </div>

                        {/* Medications */}
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Medications</p>
                          {(profile.medications?.length ?? 0) > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {profile.medications.map((m) => (
                                <GNNTooltip key={m} text={`GNN scanning: ${m} for Ayurvedic herb contraindications`}>
                                  <motion.span whileHover={{ scale: 1.05, y: -2 }}
                                    className="inline-block bg-purple-950/40 text-purple-400 border border-purple-800/30 px-2.5 py-1 rounded-lg text-[11px] cursor-help">
                                    <Pill size={10} className="inline mr-1 mb-px" />{m}
                                  </motion.span>
                                </GNNTooltip>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-600 flex items-center gap-1.5">
                              <Check size={12} className="text-accent-green" /> None
                            </span>
                          )}
                        </div>

                        {/* Doctor restrictions */}
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Doctor&apos;s Restrictions</p>
                          {profile.doctor_restrictions ? (
                            <p className="text-xs text-gray-400 leading-relaxed bg-black/20 rounded-lg p-3 border border-gray-800">
                              {profile.doctor_restrictions}
                            </p>
                          ) : (
                            <span className="text-xs text-gray-600 flex items-center gap-1.5">
                              <Check size={12} className="text-accent-green" /> None specified
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    /* ── EDIT MODE ── */
                    <motion.div key="edit-med" initial={{ opacity: 0, rotateY: 5 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0, rotateY: -5 }} transition={{ duration: 0.35 }}>
                      <div className="flex items-center gap-3 mb-5">
                        <div className="p-2.5 rounded-lg bg-blue-900/30 text-blue-400"><HeartPulse size={20} /></div>
                        <h3 className="text-white font-medium text-sm">Edit Medical Safety Profile</h3>
                      </div>

                      {/* Conditions editor */}
                      <div className="mb-5">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Health Conditions</p>
                        <TagEditor
                          allOptions={CONDITION_OPTIONS}
                          selected={editConditions}
                          onToggle={(item) => {
                            setEditConditions((prev) => {
                              const n = new Set(prev);
                              if (n.has(item)) n.delete(item); else n.add(item);
                              return n;
                            });
                          }}
                          custom={editCustomConditions}
                          setCustom={setEditCustomConditions}
                        />
                      </div>

                      {/* Medications */}
                      <div className="mb-5">
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Medications</p>
                          <span className="text-[9px] text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded-full border border-purple-700/30">AI NLP Input</span>
                        </div>
                        <textarea value={editMeds} onChange={(e) => setEditMeds(e.target.value)}
                          placeholder="e.g., Warfarin, Metformin, Atorvastatin..." rows={2}
                          className="w-full bg-black/40 border border-gray-700 focus:border-accent-green rounded-xl px-4 py-3 text-xs text-white outline-none transition-colors resize-none" />
                      </div>

                      {/* Restrictions */}
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Doctor&apos;s Restrictions</p>
                        <textarea value={editRestrictions} onChange={(e) => setEditRestrictions(e.target.value)}
                          placeholder="e.g., Low salt, avoid grapefruit, low potassium..." rows={2}
                          className="w-full bg-black/40 border border-gray-700 focus:border-accent-green rounded-xl px-4 py-3 text-xs text-white outline-none transition-colors resize-none" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          {/* ═══════ CARD 5: LOCAL DIET CTA ═══════ */}
          <motion.div variants={cardIn} className="lg:col-span-2">
            <motion.div
              whileHover={{ scale: 1.01 }}
              transition={{ duration: 0.2 }}
              onClick={() => router.push("/diet")}
              className="glass-panel p-6 cursor-pointer group relative overflow-hidden"
            >
              {/* Ambient glow */}
              <motion.div
                animate={{ opacity: [0.15, 0.35, 0.15] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 pointer-events-none rounded-[1.25rem]"
                style={{
                  background: "linear-gradient(120deg, rgba(57,255,20,0.08) 0%, transparent 50%, rgba(167,243,208,0.06) 100%)",
                }}
              />

              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-accent-green/10 border border-accent-green/20 group-hover:bg-accent-green/20 group-hover:border-accent-green/40 transition-all shrink-0">
                    <UtensilsCrossed size={22} className="text-accent-green" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-medium text-sm">Local Diet Suggestions</h3>
                      <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border bg-accent-green/10 text-accent-green border-accent-green/25 font-medium">
                        Personalised
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Seasonal, region-aware food recommendations tailored to your {dominant} Prakriti and current {ritu}.
                    </p>
                  </div>
                </div>

                <motion.div
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="shrink-0 p-2.5 rounded-xl border border-gray-700 group-hover:border-accent-green/50 group-hover:bg-accent-green/10 transition-all"
                >
                  <ArrowRight size={16} className="text-gray-500 group-hover:text-accent-green transition-colors" />
                </motion.div>
              </div>
            </motion.div>
          </motion.div>

        </div>

        {/* ═══════ ANALYTICS SECTION ═══════ */}
        <div className="mt-8 space-y-6">

          {/* Daily Quest CTA */}
          <motion.div variants={cardIn}>
            <motion.div
              whileHover={{ scale: 1.01 }}
              transition={{ duration: 0.2 }}
              onClick={() => router.push("/daily-quest")}
              className="glass-panel p-6 cursor-pointer group relative overflow-hidden"
            >
              <motion.div
                animate={{ opacity: [0.1, 0.3, 0.1] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 pointer-events-none rounded-[1.25rem]"
                style={{ background: "linear-gradient(120deg, rgba(57,255,20,0.07) 0%, transparent 50%, rgba(251,191,36,0.05) 100%)" }}
              />
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-accent-green/10 border border-accent-green/20 group-hover:bg-accent-green/20 group-hover:border-accent-green/40 transition-all shrink-0">
                    <Zap size={22} className="text-accent-green" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-medium text-sm">Daily Food Quest</h3>
                      <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full border bg-amber-950/30 text-amber-400 border-amber-700/30 font-medium">Today</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Track your Ayurvedic food adherence. Tick what you follow — prevent {dominant} Dosha imbalances.
                    </p>
                  </div>
                </div>
                <motion.div
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="shrink-0 p-2.5 rounded-xl border border-gray-700 group-hover:border-accent-green/50 group-hover:bg-accent-green/10 transition-all"
                >
                  <ArrowRight size={16} className="text-gray-500 group-hover:text-accent-green transition-colors" />
                </motion.div>
              </div>
            </motion.div>
          </motion.div>

          {/* Adherence analytics — only when data exists */}
          {adherenceLogs.length > 0 && (
            <>
              <motion.div variants={cardIn} className="flex items-center gap-2">
                <Activity size={14} className="text-accent-green" />
                <span className="text-xs text-gray-500 uppercase tracking-[0.2em]">Adherence Analytics</span>
              </motion.div>

              {/* Stat cards */}
              <motion.div variants={cardIn} className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {([
                  { label: "Current Streak",  value: `${streak}d`,      sub: "consecutive days",   Icon: Zap,      color: "text-amber-400",   border: "border-amber-800/25"   },
                  { label: "30-Day Average",   value: `${avg30}%`,       sub: "food adherence",     Icon: Activity, color: "text-sky-400",     border: "border-sky-800/25"     },
                  { label: "Best Day",         value: `${best30}%`,      sub: "peak adherence",     Icon: Sparkles, color: "text-accent-green", border: "border-emerald-800/25" },
                  { label: "Tasks Completed",  value: `${totalDone}`,    sub: "total foods logged", Icon: Check,    color: "text-violet-400",  border: "border-violet-800/25"  },
                ] as const).map(({ label, value, sub, Icon, color, border }) => (
                  <div key={label} className={`glass-panel p-5 border ${border}`}>
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide leading-tight pr-2">{label}</p>
                      <div className="p-1.5 rounded-lg bg-black/30 shrink-0">
                        <Icon size={12} className={color} />
                      </div>
                    </div>
                    <p className={`text-2xl font-light ${color}`}>{value}</p>
                    <p className="text-[10px] text-gray-600 mt-1">{sub}</p>
                  </div>
                ))}
              </motion.div>

              {/* 30-day chart + Dosha composition */}
              <motion.div variants={cardIn} className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Area chart */}
                <div className="glass-panel p-6 lg:col-span-2">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Food Adherence</p>
                      <p className="text-sm text-white font-light">30-Day Completion Trend</p>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-px bg-red-500/60 inline-block" />
                        60% threshold
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-4 h-px bg-yellow-400/50 inline-block" />
                        80% goal
                      </span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chart30} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="dashAdhGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#39FF14" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#39FF14" stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#4B5563", fontSize: 9 }}
                        tickLine={false}
                        axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                        interval={4}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: "#4B5563", fontSize: 9 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(6,12,7,0.97)",
                          border: "1px solid rgba(57,255,20,0.18)",
                          borderRadius: "10px",
                          fontSize: "11px",
                          padding: "8px 12px",
                        }}
                        labelStyle={{ color: "#9CA3AF", marginBottom: 4 }}
                        formatter={(v: unknown) => [`${v as number}%`, "Adherence"]}
                      />
                      <ReferenceLine
                        y={60}
                        stroke="rgba(239,68,68,0.45)"
                        strokeDasharray="4 4"
                        label={{ value: "60%", fill: "rgba(239,68,68,0.6)", fontSize: 9, position: "insideTopRight" }}
                      />
                      <ReferenceLine
                        y={80}
                        stroke="rgba(251,191,36,0.35)"
                        strokeDasharray="4 4"
                        label={{ value: "80%", fill: "rgba(251,191,36,0.55)", fontSize: 9, position: "insideTopRight" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#39FF14"
                        strokeWidth={2}
                        fill="url(#dashAdhGrad)"
                        connectNulls
                        dot={false}
                        activeDot={{ r: 4, fill: "#39FF14", strokeWidth: 0 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Dosha composition + Ritu risk */}
                <div className="glass-panel p-6">
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-0.5">Constitution</p>
                  <p className="text-sm text-white font-light mb-5">Dosha Composition</p>
                  {Object.keys(doshaScores).length > 0 ? (
                    <div className="space-y-4">
                      {Object.entries(doshaScores)
                        .sort(([, sA], [, sB]) => sB - sA)
                        .map(([dosha, score]) => {
                          const pct   = Math.round(score * 100);
                          const color = DOSHA_COLORS[dosha] ?? "#39FF14";
                          const DIcon = DOSHA_ICONS[dosha] ?? Zap;
                          return (
                            <div key={dosha}>
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <DIcon size={12} style={{ color }} />
                                  <span className="text-xs text-gray-300">{dosha}</span>
                                  {dosha === dominant && (
                                    <span
                                      className="text-[9px] px-1.5 py-px rounded-full border"
                                      style={{ color, borderColor: `${color}40`, background: `${color}15` }}
                                    >
                                      dominant
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs font-mono" style={{ color }}>{pct}%</span>
                              </div>
                              <div className="h-1.5 bg-gray-800/80 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 0.9, delay: 0.3, ease: "easeOut" }}
                                  className="h-full rounded-full"
                                  style={{ background: `linear-gradient(90deg, ${color}70, ${color})` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-600">Complete your assessment to see breakdown.</p>
                  )}

                  {getRituEffect() && (() => {
                    const effect      = getRituEffect()!;
                    const RISK_LEVELS = ["low", "moderate", "high", "highest"] as const;
                    const rIdx        = RISK_LEVELS.indexOf(effect.risk as typeof RISK_LEVELS[number]);
                    const barColors   = ["#10B981", "#F59E0B", "#F97316", "#EF4444"] as const;
                    return (
                      <div className="mt-6 pt-5 border-t border-gray-800/60">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">Seasonal Risk</p>
                        <div className={`rounded-xl p-4 border ${RISK_STYLES[effect.risk]}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1.5">
                              <Leaf size={10} />
                              <span className="text-[10px] font-medium">{ritu}</span>
                            </div>
                            <span className="text-[9px] uppercase tracking-wider font-bold">{effect.risk} risk</span>
                          </div>
                          <div className="flex items-end gap-1 mb-3">
                            {RISK_LEVELS.map((r, idx) => (
                              <div
                                key={r}
                                className="rounded-sm flex-1"
                                style={{
                                  height: `${8 + idx * 4}px`,
                                  background: idx <= rIdx ? barColors[rIdx] : "rgba(255,255,255,0.08)",
                                }}
                              />
                            ))}
                          </div>
                          <p className="text-[10px] leading-relaxed opacity-75">{effect.advice}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </motion.div>
            </>
          )}

          {/* No data state */}
          {adherenceLogs.length === 0 && (
            <motion.div
              variants={cardIn}
              className="glass-panel p-8 border border-dashed border-gray-800 text-center"
            >
              <Activity size={24} className="text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Complete a Daily Food Quest to unlock adherence analytics.</p>
              <p className="text-[11px] text-gray-700 mt-1.5">Streak, 30-day trends, and Dosha risk charts will appear here.</p>
            </motion.div>
          )}
        </div>

        {/* ── Disclaimer Footer ── */}
        {/* <motion.div variants={cardIn}
          className="mt-8 mb-12 flex items-start gap-3 bg-black/30 border border-gray-800 rounded-xl px-5 py-4 max-w-7xl mx-auto"
        >
          <Info size={14} className="text-gray-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Data displayed here is sourced from your Supabase profile. Prakriti scores are locked after assessment.
            Health &amp; diet data can be updated anytime — changes are synced to the GNN safety graph in real-time.
          </p>
        </motion.div> */}
      </motion.div>
    </main>
  );
}
