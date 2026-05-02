"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Wind,
  Flame,
  Droplets,
  Leaf,
  Check,
  AlertTriangle,
  Coffee,
  Soup,
  Cookie,
  Candy,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  getProfile,
  getLatestAssessment,
  getAdherenceLogs,
  upsertAdherenceLog,
} from "@/lib/queries";
import { supabase } from "@/lib/supabase";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface FoodTask {
  id:         string;
  node_id:    string;
  food_name:  string;
  local_name: string;
  meal_cat:   string;
  sub_cat:    string;
  status:     "Consume" | "Moderate";
  completed:  boolean;
}

interface Particle {
  id: number; x: number; y: number;
  tx: number; ty: number;
  color: string; size: number;
}

interface AdherenceDay {
  label: string;
  value: number | null;
}

interface MealCat {
  key:   string;
  label: string;
  icon:  React.ElementType;
  color: string;
  bg:    string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const ML_URL = process.env.NEXT_PUBLIC_ML_BACKEND_URL ?? "http://localhost:8000";
const THRESHOLD       = 60; // % below which disorders panel shows
const PICKS_PER_SUBCAT = 2; // foods picked per sub-category per day (rotation)

const MEAL_CATS: MealCat[] = [
  { key: "Breakfast",         label: "Breakfast",         icon: Coffee,       color: "text-amber-400",   bg: "bg-amber-950/30 border-amber-700/30"    },
  { key: "Lunch & Dinner",    label: "Lunch & Dinner",    icon: Soup,         color: "text-emerald-400", bg: "bg-emerald-950/30 border-emerald-700/30" },
  { key: "Sweets & Desserts", label: "Sweets & Desserts", icon: Candy,        color: "text-pink-400",    bg: "bg-pink-950/30 border-pink-700/30"       },
  { key: "Condiments",        label: "Condiments",        icon: FlaskConical, color: "text-violet-400",  bg: "bg-violet-950/30 border-violet-700/30"   },
  { key: "Snacks",            label: "Snacks",            icon: Cookie,       color: "text-sky-400",     bg: "bg-sky-950/30 border-sky-700/30"         },
];

const DOSHA_CFG = {
  Vata: {
    icon:        Wind,
    badge:       "bg-indigo-950/60 text-indigo-300 border-indigo-600/40",
    particles:   ["#818cf8", "#a5b4fc", "#c7d2fe"] as string[],
    wBg:         "rgba(30,27,75,0.97)",
    wBorder:     "rgba(129,140,248,0.4)",
    wGlow:       "0 4px 40px rgba(99,102,241,0.25)",
    wTitle:      "text-indigo-200",
    wBody:       "text-indigo-300/80",
    wBadge:      "bg-indigo-900/50 text-indigo-300 border-indigo-500/40",
  },
  Pitta: {
    icon:        Flame,
    badge:       "bg-orange-950/60 text-orange-300 border-orange-600/40",
    particles:   ["#fb923c", "#fbbf24", "#f97316"] as string[],
    wBg:         "rgba(67,20,7,0.97)",
    wBorder:     "rgba(249,115,22,0.4)",
    wGlow:       "0 4px 40px rgba(234,88,12,0.25)",
    wTitle:      "text-orange-200",
    wBody:       "text-orange-300/80",
    wBadge:      "bg-orange-900/50 text-orange-300 border-orange-500/40",
  },
  Kapha: {
    icon:        Droplets,
    badge:       "bg-teal-950/60 text-teal-300 border-teal-600/40",
    particles:   ["#2dd4bf", "#34d399", "#5eead4"] as string[],
    wBg:         "rgba(4,47,46,0.97)",
    wBorder:     "rgba(45,212,191,0.4)",
    wGlow:       "0 4px 40px rgba(20,184,166,0.25)",
    wTitle:      "text-teal-200",
    wBody:       "text-teal-300/80",
    wBadge:      "bg-teal-900/50 text-teal-300 border-teal-500/40",
  },
};

const PATHOLOGIES: Record<string, Record<string, string[]>> = {
  Vata: {
    "Musculoskeletal":       ["Sciatica (Gridhrasi)", "Tremors (Kampa)", "Joint degeneration (Sandhivata)"],
    "Digestive":             ["Constipation (Vibandha)", "Bloating & intestinal spasms", "Vata-type IBS"],
    "Mental & Neurological": ["Anxiety (Chittodvega)", "Insomnia (Anidra)", "Cognitive fog"],
  },
  Pitta: {
    "Digestive":       ["Amlapitta — Hyperacidity", "Peptic ulcers (Parinama Shula)", "Liver inflammation"],
    "Skin":            ["Eczema (Vicharchika)", "Urticaria & heat rashes", "Acne (Mukhadushika)"],
    "Cardiovascular":  ["Hypertension (Raktagata Vata)", "Inflammatory cardiac events"],
  },
  Kapha: {
    "Respiratory":     ["Asthma (Tamaka Shwasa)", "Chronic congestion & sinusitis", "Bronchitis (Kasa)"],
    "Metabolic":       ["Sthaulya — Obesity", "Prameha — Pre-Diabetes / Diabetes", "Hypothyroidism (Medo Roga)"],
  },
};

// ═══════════════════════════════════════════════════════════════
// SUB-CATEGORY RULES  (keyword-based inference from food name)
// ═══════════════════════════════════════════════════════════════

const SUB_CAT_RULES: Record<string, Array<[string[], string]>> = {
  "Breakfast": [
    [["pav","poee","polo","sanna","sannas","idli","dosa","appam","roti","bread","chapati","bhakri","amboli","flatbread"], "Breads & Flatbreads"],
    [["rice","bhaat","kanji","pej","khichdi","pongal","congee","porridge","satav","gruel","upkari"], "Rice & Porridge"],
    [["bhaji","usal","vada","samosa","poha","upma","ambode","sheera","sorak","cutlet","pakora"], "Savoury Dishes"],
    [["tea","chai","coffee","juice","milk","lassi","kokum","sol kadhi","neer","drink","beverage"], "Beverages"],
  ],
  "Lunch & Dinner": [
    [["rice","bhaat","pulao","khichdi","shevai","shevaio","grain"], "Rice & Grains"],
    [["fish","prawn","crab","lobster","clam","mussel","oyster","squid","mackerel","bangda","surmai","pomfret","tisrio","kismur","bindal","sardine","tuna","rechad","seafood","masla"], "Seafood"],
    [["chicken","pork","mutton","beef","sorpotel","vindaloo","cafreal","chourico","meat","lamb","xacuti"], "Meat"],
    [["dal","dali","lentil","peas","chana","moong","urad","rajma","bean","tofu","soybean"], "Dal & Legumes"],
    [["curry","ambot","caldine","khatkhate","gajbaje","ambat","ambade","tarri","gravy","stew"], "Curries"],
  ],
  "Snacks": [
    [["bhajia","bhaji","vada","samosa","chips","puri","fried","fry","pakora","bonda","frittar"], "Fried Snacks"],
    [["idli","dhokla","modak","steamed","baked","roasted","boiled"], "Steamed & Baked"],
  ],
  "Sweets & Desserts": [
    [["coconut","bolinhas","bebinca","bibinca","narali","nariyal","coconut halwa","barfi","kozhukattai"], "Coconut-based"],
    [["patoleo","kheer","payasam","ladoo","modak","halwa","rice pudding","mandas","jaggery","gud"], "Rice & Jaggery"],
    [["milk","serradura","pudding","cream","paneer","rabdi","phirni","dhood","kheer"], "Milk-based"],
  ],
  "Condiments": [
    [["chutney"], "Chutneys"],
    [["pickle","lonche","achar","kismur","preserve"], "Pickles"],
  ],
};

const SUB_CAT_DEFAULTS: Record<string, string> = {
  "Breakfast":         "Savoury Dishes",
  "Lunch & Dinner":    "Vegetable Dishes",
  "Snacks":            "Light Bites",
  "Sweets & Desserts": "Traditional Sweets",
  "Condiments":        "Sauces & Spices",
};

function inferSubCat(foodName: string, localName: string, mealCat: string): string {
  const text  = `${foodName} ${localName}`.toLowerCase();
  const rules = SUB_CAT_RULES[mealCat] ?? [];
  for (const [keywords, label] of rules) {
    if (keywords.some((kw) => text.includes(kw))) return label;
  }
  return SUB_CAT_DEFAULTS[mealCat] ?? "Other";
}

// ═══════════════════════════════════════════════════════════════
// SEEDED ROTATION HELPERS
// ═══════════════════════════════════════════════════════════════

/** Mulberry32 PRNG — deterministic per seed */
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle using a supplied RNG */
function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Derive a numeric seed from userId + date string + sub-category label */
function dailySeed(userId: string, date: string, extra: string): number {
  const str = userId.replace(/-/g, "") + date.replace(/-/g, "") + extra;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function buildChart(logs: { date: string; completion_percentage: number }[]): AdherenceDay[] {
  const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (4 - i));
    const ds = d.toISOString().split("T")[0];
    const log = logs.find((l) => l.date === ds);
    return {
      label: i === 4 ? "Today" : DAY[d.getDay()],
      value: log ? Math.round(log.completion_percentage) : null,
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? completed / total : 0;
  const r = 22, circ = 2 * Math.PI * r;
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" strokeWidth="3" stroke="rgba(57,255,20,0.12)" />
        <motion.circle
          cx="28" cy="28" r={r} fill="none" strokeWidth="3" stroke="#39ff14"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-medium text-white leading-none">{completed}</span>
        <span className="text-[9px] text-gray-600">/{total}</span>
      </div>
    </div>
  );
}

function FoodRow({
  task,
  onToggle,
}: {
  task:     FoodTask;
  onToggle: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <motion.div
      layout
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200
        ${task.completed
          ? "bg-accent-green/8 border-accent-green/20"
          : "bg-black/20 border-white/6 hover:border-white/12"
        }`}
    >
      <button
        onClick={(e) => onToggle(task.id, e)}
        className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
          ${task.completed ? "bg-accent-green border-accent-green" : "border-gray-600 hover:border-accent-green/60"}`}
      >
        {task.completed && <Check size={11} className="text-black" strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${task.completed ? "line-through text-gray-500" : "text-gray-200"}`}>
          {task.food_name}
        </p>
        {task.local_name && (
          <p className="text-[10px] text-gray-600 mt-0.5 italic">{task.local_name}</p>
        )}
      </div>
    </motion.div>
  );
}

function CatSection({
  cat, tasks, onToggle, defaultOpen,
}: {
  cat:         MealCat;
  tasks:       FoodTask[];
  onToggle:    (id: string, e: React.MouseEvent) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (tasks.length === 0) return null;

  const done = tasks.filter((t) => t.completed).length;
  const Icon = cat.icon;

  // Group by sub_cat, preserving insertion order
  const subCatMap = new Map<string, FoodTask[]>();
  for (const t of tasks) {
    if (!subCatMap.has(t.sub_cat)) subCatMap.set(t.sub_cat, []);
    subCatMap.get(t.sub_cat)!.push(t);
  }
  const subCatEntries = Array.from(subCatMap.entries());

  return (
    <div className="glass-panel overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/2 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg border ${cat.bg}`}>
            <Icon size={14} className={cat.color} />
          </div>
          <div className="text-left">
            <p className={`text-sm font-light ${cat.color}`}>{cat.label}</p>
            <p className="text-[10px] text-gray-600">{done}/{tasks.length} followed today · {subCatEntries.length} categories</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-accent-green rounded-full"
              animate={{ width: `${tasks.length > 0 ? (done / tasks.length) * 100 : 0}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <motion.svg
            animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" className="text-gray-500 shrink-0"
          >
            <polyline points="6 9 12 15 18 9" />
          </motion.svg>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-4">
              {subCatEntries.map(([subCat, subTasks], gi) => {
                const subDone = subTasks.filter((t) => t.completed).length;
                return (
                  <div key={subCat}>
                    {/* Sub-category header */}
                    <div className="flex items-center justify-between mb-2 mt-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${cat.color.replace('text-', 'bg-')}`} />
                        <p className={`text-[10px] uppercase tracking-[0.2em] font-medium ${cat.color}`}>{subCat}</p>
                      </div>
                      <span className="text-[9px] text-gray-600">{subDone}/{subTasks.length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {subTasks.map((t, i) => (
                        <motion.div
                          key={t.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: (gi * 0.08) + i * 0.04 }}
                        >
                          <FoodRow task={t} onToggle={onToggle} />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConsequencePanel({ pct, dosha }: { pct: number; dosha: string }) {
  const cfg   = DOSHA_CFG[dosha as keyof typeof DOSHA_CFG] ?? DOSHA_CFG.Vata;
  const paths = PATHOLOGIES[dosha] ?? {};
  const atRisk = pct < THRESHOLD;

  return (
    <AnimatePresence mode="wait">
      {atRisk ? (
        <motion.div
          key="risk"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}
          className="rounded-2xl border overflow-hidden"
          style={{ background: cfg.wBg, borderColor: cfg.wBorder, boxShadow: cfg.wGlow }}
        >
          <div className="px-5 py-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 rounded-xl mt-0.5 shrink-0"
                style={{ background: `${cfg.wBorder}25`, border: `1px solid ${cfg.wBorder}` }}>
                <AlertTriangle size={18} className={cfg.wTitle} />
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-[0.3em] opacity-60 mb-0.5 ${cfg.wTitle}`}>
                  Adherence Risk — {dosha} Dosha
                </p>
                <h3 className={`text-sm font-light ${cfg.wTitle}`}>
                  {pct === 0
                    ? "No recommended foods followed yet today"
                    : `Only ${Math.round(pct)}% of recommended foods followed`}
                </h3>
              </div>
            </div>

            <p className={`text-xs leading-relaxed mb-4 ${cfg.wBody}`}>
              Consistently skipping your {dosha}-pacifying diet increases the risk of the following Ayurvedic imbalances.
              Complete at least <span className="font-medium">{THRESHOLD}%</span> of today&apos;s food recommendations to stay protected.
            </p>

            <div className="space-y-3">
              {Object.entries(paths).map(([category, conditions]) => (
                <div
                  key={category} className="rounded-lg p-3"
                  style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${cfg.wBorder}35` }}
                >
                  <p className={`text-[10px] uppercase tracking-wide font-medium mb-2 ${cfg.wTitle}`}>{category}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {conditions.map((c) => (
                      <span key={c} className={`px-2 py-0.5 rounded-md text-[11px] border ${cfg.wBadge}`}>{c}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="ok"
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}
          className="rounded-2xl border bg-emerald-950/20 border-emerald-700/30 p-5"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-700/40">
              <ShieldCheck size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-500/70 mb-0.5">
                Dosha Balance Protected
              </p>
              <p className="text-sm text-emerald-200 font-light">
                {pct >= 100
                  ? "Perfect adherence! Your Dosha is fully balanced today."
                  : `${Math.round(pct)}% adherence — your ${dosha} is in balance. Keep going!`}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function DailyQuestPage() {
  const router = useRouter();

  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [tasks,     setTasks]     = useState<FoodTask[]>([]);
  const [dosha,     setDosha]     = useState("Vata");
  const [ritu,      setRitu]      = useState("");
  const [firstName, setFirstName] = useState("");
  const [chartData, setChartData] = useState<AdherenceDay[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);

  const cfg       = DOSHA_CFG[dosha as keyof typeof DOSHA_CFG] ?? DOSHA_CFG.Vata;
  const DoshaIcon = cfg.icon;
  const completed = tasks.filter((t) => t.completed).length;
  const pct       = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;

  // Particles
  const spawnParticles = useCallback((cx: number, cy: number, colors: string[]) => {
    const newP: Particle[] = Array.from({ length: 10 }, (_, i) => {
      const angle = (i / 10) * Math.PI * 2;
      const dist  = 40 + Math.random() * 55;
      return {
        id:    Date.now() + i,
        x:     cx, y: cy,
        tx:    cx + Math.cos(angle) * dist,
        ty:    cy + Math.sin(angle) * dist,
        color: colors[i % colors.length],
        size:  4 + Math.random() * 5,
      };
    });
    setParticles((p) => [...p, ...newP]);
    setTimeout(() => setParticles((p) => p.filter((x) => !newP.find((n) => n.id === x.id))), 800);
  }, []);

  // Toggle
  const handleToggle = useCallback((id: string, e: React.MouseEvent) => {
    const colors = (DOSHA_CFG[dosha as keyof typeof DOSHA_CFG] ?? DOSHA_CFG.Vata).particles;
    setTasks((prev) => {
      const updated   = prev.map((t) => t.id === id ? { ...t, completed: !t.completed } : t);
      const didCheck  = updated.find((t) => t.id === id)?.completed ?? false;
      if (didCheck) spawnParticles(e.clientX, e.clientY, colors);
      const done = updated.filter((t) => t.completed).length;
      upsertAdherenceLog(updated.length, done).catch(() => null);
      return updated;
    });
  }, [dosha, spawnParticles]);

  // Load
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/"); return; }

        const [profile, assessment, logs] = await Promise.all([
          getProfile(),
          getLatestAssessment(),
          getAdherenceLogs(5),
        ]);
        if (!profile) { router.push("/onboarding"); return; }

        const dom = profile.base_prakriti?.dominant  ?? "Vata";
        const sec = profile.base_prakriti?.secondary ?? "Pitta";
        const sup = profile.base_prakriti?.suppressed ?? "Kapha";
        const rit = assessment?.current_ritu ?? profile.current_ritu ?? "Grishma Ritu";

        if (!cancelled) {
          setDosha(dom);
          setRitu(rit);
          setFirstName(profile.first_name);
          setChartData(buildChart(logs));
        }

        // Try localStorage cache first (written by diet page on same day)
        const today = new Date().toISOString().split("T")[0];
        const cacheKey = `ayurithm_gnn_${user.id}_${today}`;
        let cachedRaw: string | null = null;
        try { cachedRaw = localStorage.getItem(cacheKey); } catch { /* ignore */ }

        type GNNResult = {
          results: Record<string, Array<{
            node_id:    string;
            food_name:  string;
            local_name: string;
            status:     string;
            score:      number;
          }>>;
        };

        let gnn: GNNResult;
        if (cachedRaw) {
          gnn = JSON.parse(cachedRaw) as GNNResult;
        } else {
          // Fall back to direct backend call
          const res = await fetch(`${ML_URL}/recommend`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dominant_dosha:      dom,
              secondary_dosha:     sec,
              suppressed_dosha:    sup,
              current_ritu:        rit,
              dietary_preference:  profile.dietary_preference ?? null,
              allergies:           profile.allergies           ?? [],
              health_conditions:   profile.health_conditions   ?? [],
              medications:         profile.medications         ?? [],
              doctor_restrictions: profile.doctor_restrictions ?? null,
            }),
          });
          if (!res.ok) throw new Error("Backend unavailable — visit the Diet page first, or start the Python server on port 8000.");
          gnn = await res.json() as GNNResult;
          // Cache it for next time
          try { localStorage.setItem(cacheKey, JSON.stringify(gnn)); } catch { /* ignore */ }
        }

        // Build daily food tasks using seeded rotation
        // Per sub-category within each meal category, pick PICKS_PER_SUBCAT foods.
        // Seed = userId + date + subCat → deterministic but changes daily.
        const today2 = new Date().toISOString().split("T")[0];
        const foodTasks: FoodTask[] = [];

        for (const cat of MEAL_CATS) {
          // All "Consume" foods for this meal category
          const pool = (gnn.results[cat.key] ?? [])
            .filter((f) => f.status === "Consume");

          // Group by inferred sub-category
          const bySubCat = new Map<string, typeof pool>();
          for (const f of pool) {
            const sc = inferSubCat(f.food_name, f.local_name ?? "", cat.key);
            if (!bySubCat.has(sc)) bySubCat.set(sc, []);
            bySubCat.get(sc)!.push(f);
          }

          // For each sub-cat: seeded-shuffle then pick PICKS_PER_SUBCAT
          for (const [subCat, foods] of bySubCat) {
            const seed    = dailySeed(user.id, today2, `${cat.key}__${subCat}`);
            const rng     = mulberry32(seed);
            const picked  = seededShuffle(foods, rng).slice(0, PICKS_PER_SUBCAT);

            for (const f of picked) {
              foodTasks.push({
                id:         `${f.node_id}_${cat.key}`,
                node_id:    f.node_id,
                food_name:  f.food_name,
                local_name: f.local_name ?? "",
                meal_cat:   cat.key,
                sub_cat:    subCat,
                status:     "Consume",
                completed:  false,
              });
            }
          }
        }

        if (!cancelled) {
          setTasks(foodTasks);

          // Only create an initial log if there's no entry for today yet —
          // avoids overwriting real progress when the page is re-opened.
          const today3 = new Date().toISOString().split("T")[0];
          const todayLog = logs.find((l) => l.date === today3);
          if (!todayLog) {
            upsertAdherenceLog(foodTasks.length, 0).catch(() => null);
          }

          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : (err as { message?: string })?.message ?? "Failed to load food quest.";
          setError(msg);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [router]);

  // ─── Loading ─────────────────────────────────────────────────
  if (loading) return (
    <main className="min-h-screen bg-void-green flex items-center justify-center">
      <div className="text-center space-y-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 rounded-full border-2 border-accent-green/20 border-t-accent-green mx-auto"
        />
        <p className="text-xs text-gray-500">Loading your food quest…</p>
      </div>
    </main>
  );

  // ─── Error ───────────────────────────────────────────────────
  if (error) return (
    <main className="min-h-screen bg-void-green flex items-center justify-center p-8">
      <div className="text-center space-y-3 max-w-sm">
        <AlertTriangle size={28} className="text-red-400 mx-auto" />
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={() => router.push("/diet")} className="text-xs text-gray-500 underline">
          ← Back to Diet
        </button>
      </div>
    </main>
  );

  // ─── Main render ─────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-void-green relative overflow-x-hidden pb-10">
      {/* Background lotus */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/dash_bg.png" alt="" aria-hidden="true"
        className="fixed top-1/2 left-1/2 w-[130vw] h-[130vh] object-contain -translate-x-1/2 -translate-y-1/2 pointer-events-none mix-blend-screen opacity-20 z-0"
      />

      {/* Particle overlay */}
      <div className="fixed inset-0 pointer-events-none z-50">
        <AnimatePresence>
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{ x: p.x, y: p.y, opacity: 1, scale: 1 }}
              animate={{ x: p.tx, y: p.ty, opacity: 0, scale: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.75, ease: "easeOut" }}
              className="absolute rounded-full"
              style={{ width: p.size, height: p.size, background: p.color, left: 0, top: 0, translateX: "-50%", translateY: "-50%" }}
            />
          ))}
        </AnimatePresence>
      </div>

      <style>{`
        .quest-frame .glass-panel {
          background: rgba(6,12,7,0.91);
          border: 1px solid rgba(57,255,20,0.20);
          box-shadow: 0 8px 48px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.04);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-radius: 16px;
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}
        className="quest-frame relative z-10 max-w-2xl mx-auto p-4 md:p-8 space-y-5"
      >
        {/* ═══ HEADER ═══ */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/diet")}
                className="p-2.5 rounded-xl border border-gray-700 hover:border-accent-green/40 transition-all shrink-0"
              >
                <ArrowLeft size={16} className="text-gray-400" />
              </button>
              <div>
                <p className="text-xs text-accent-green uppercase tracking-[0.3em] mb-0.5">Daily Food Quest</p>
                <h1 className="text-xl font-light text-white">
                  {firstName ? `${firstName}'s ` : ""}
                  <span className="text-accent-green font-normal">Food Adherence</span>
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs ${cfg.badge}`}>
                <DoshaIcon size={12} />{dosha}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-700 text-gray-400 text-xs">
                <Leaf size={12} className="text-pastel-green" />{ritu}
              </span>
              <ProgressRing completed={completed} total={tasks.length} />
            </div>
          </div>

          {/* Overall progress bar */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full transition-colors duration-500 ${pct >= THRESHOLD ? "bg-accent-green" : "bg-red-500/70"}`}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <span className={`text-xs shrink-0 ${pct >= THRESHOLD ? "text-accent-green" : "text-red-400"}`}>
              {Math.round(pct)}%
            </span>
          </div>
        </motion.div>

        {/* ═══ FOOD CATEGORIES ═══ */}
        <div className="space-y-3">
          {MEAL_CATS.map((cat, i) => (
            <motion.div
              key={cat.key}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <CatSection
                cat={cat}
                tasks={tasks.filter((t) => t.meal_cat === cat.key)}
                onToggle={handleToggle}
                defaultOpen={i < 2}
              />
            </motion.div>
          ))}
        </div>

        {/* ═══ LEGEND ═══ */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1"
        >
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-[11px] text-gray-600">Eat — GNN-recommended for your Dosha (score &gt; 1.0)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="text-[11px] text-gray-600">Moderate — no clinical conflict, limited benefit (0–1.0)</span>
          </div>
        </motion.div>

        {/* ═══ CONSEQUENCE ANALYZER ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
        >
          <p className="text-[10px] text-gray-600 uppercase tracking-[0.25em] mb-3 px-1">
            Consequence Analyzer · Threshold {THRESHOLD}%
          </p>
          <ConsequencePanel pct={pct} dosha={dosha} />
        </motion.div>

        {/* ═══ 5-DAY HISTORY ═══ */}
        {chartData.some((d) => d.value !== null) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
            className="glass-panel p-5"
          >
            <p className="text-xs text-accent-green uppercase tracking-[0.25em] mb-0.5">5-Day Adherence</p>
            <p className="text-base font-light text-white mb-4">Historical Progress</p>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="adhrGradDQ" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#39ff14" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#39ff14" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fill: "#4b5563", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#4b5563", fontSize: 11 }} axisLine={false} tickLine={false} />
                <ReferenceLine y={THRESHOLD} stroke="rgba(239,68,68,0.3)" strokeDasharray="4 4"
                  label={{ value: `${THRESHOLD}%`, position: "right", fill: "#6b7280", fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ background: "rgba(4,9,5,0.97)", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#6b7280" }}
                  formatter={(v: number) => [`${v}%`, "Adherence"]}
                />
                <Area
                  type="monotone" dataKey="value" stroke="#39ff14" strokeWidth={2}
                  fill="url(#adhrGradDQ)" connectNulls={false}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  dot={(props: any) => {
                    if (props.payload.value === null) return <g />;
                    const c = props.payload.value >= 80 ? "#34d399" : props.payload.value >= THRESHOLD ? "#fbbf24" : "#f87171";
                    return <circle cx={props.cx} cy={props.cy} r={5} fill={c} stroke="rgba(0,0,0,0.6)" strokeWidth={1.5} />;
                  }}
                  activeDot={{ r: 6, fill: "#39ff14" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </motion.div>
    </main>
  );
}
