"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  UtensilsCrossed,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Leaf,
  Flame,
  Wind,
  Droplets,
  Sparkles,
  Coffee,
  Soup,
  Cookie,
  Candy,
  FlaskConical,
  Info,
  X,
  ChevronDown,
  Search,
  Check,
  Zap,
  Activity,
} from "lucide-react";
import { getProfile, getLatestAssessment } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface ReasoningEntry {
  level: number;
  type: string;
  label: string;
  detail: string;
  weight: number;
  trigger: string;
}

interface FoodItem {
  node_id: string;
  food_name: string;
  local_name: string;
  image_url: string;
  category: string;
  is_veg: boolean;
  is_vegan: boolean;
  status: "Consume" | "Moderate" | "Avoid";
  score: number;
  reasoning_stack: ReasoningEntry[];
}

interface GNNResponse {
  total_foods: number;
  filtered_out: number;
  results: Record<string, FoodItem[]>;
  graph_stats: {
    total_nodes: number;
    total_edges: number;
    food_nodes: number;
    disease_nodes: number;
    drug_nodes: number;
  };
}

interface Profile {
  first_name: string;
  last_name: string;
  location_lat: number | null;
  location_lng: number | null;
  location_tag: string | null;
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

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const ML_URL = process.env.NEXT_PUBLIC_ML_BACKEND_URL ?? "http://localhost:8000";

const MEAL_TABS = [
  { key: "Breakfast", icon: Coffee, label: "Breakfast" },
  { key: "Lunch & Dinner", icon: Soup, label: "Lunch & Dinner" },
  { key: "Snacks", icon: Cookie, label: "Snacks" },
  { key: "Sweets & Desserts", icon: Candy, label: "Sweets & Desserts" },
  { key: "Condiments", icon: FlaskConical, label: "Condiments" },
];

const STATUS_CONFIG = {
  Consume: {
    border: "border-emerald-500/40",
    glow: "shadow-[0_0_20px_rgba(57,255,20,0.08)]",
    bg: "bg-emerald-950/20",
    badge: "bg-emerald-950/60 text-emerald-400 border-emerald-700/40",
    badgeLabel: "Consume Freely",
    icon: Check,
    iconColor: "text-emerald-400",
  },
  Moderate: {
    border: "border-amber-500/40",
    glow: "shadow-[0_0_20px_rgba(251,191,36,0.08)]",
    bg: "bg-amber-950/20",
    badge: "bg-amber-950/60 text-amber-400 border-amber-700/40",
    badgeLabel: "In Moderation",
    icon: AlertTriangle,
    iconColor: "text-amber-400",
  },
  Avoid: {
    border: "border-red-500/30",
    glow: "shadow-[0_0_20px_rgba(239,68,68,0.06)]",
    bg: "bg-red-950/20",
    badge: "bg-red-950/60 text-red-400 border-red-700/40",
    badgeLabel: "Avoid",
    icon: Lock,
    iconColor: "text-red-400",
  },
};

const DOSHA_ICONS: Record<string, typeof Wind> = {
  Vata: Wind,
  Pitta: Flame,
  Kapha: Droplets,
};

const ORACLE_STEPS = [
  "Constructing heterogeneous knowledge graph...",
  "Indexing 403 Goan foods × 40 pharmacological profiles...",
  "Applying allergen & dietary hard-filters...",
  "Level 1: Scanning drug–food biochemical conflicts...",
  "Level 2: Evaluating disease-aggravation pathways...",
  "Level 3: Computing Ayurvedic dosha-pacification scores...",
  "Level 4: Aligning with current Ritu seasonality...",
  "Message passing complete — classifying safety thresholds...",
  "GNN resolution complete ✓",
];

// ═══════════════════════════════════════════════════════════
// LEAF BACKGROUND
// ═══════════════════════════════════════════════════════════

const LEAF_CONFIGS = [
  { size: 14, x: 8, startOffset: 0.0, dur: 15, sway: 20, opacity: 0.1 },
  { size: 10, x: 30, startOffset: 0.3, dur: 18, sway: -16, opacity: 0.07 },
  { size: 16, x: 55, startOffset: 0.5, dur: 13, sway: 22, opacity: 0.12 },
  { size: 9, x: 75, startOffset: 0.7, dur: 17, sway: -14, opacity: 0.06 },
  { size: 13, x: 92, startOffset: 0.9, dur: 14, sway: 18, opacity: 0.09 },
];

function FallingLeaves() {
  return (
    <>
      <style>{`
        @keyframes dietLeafFall {
          0%   { transform: translateY(-5vh) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
        @keyframes dietLeafSway {
          0%, 100% { transform: translateX(0px); }
          50%      { transform: translateX(var(--sway)); }
        }
      `}</style>
      {LEAF_CONFIGS.map((l, i) => (
        <div
          key={i}
          className="fixed pointer-events-none z-0"
          style={{
            left: `${l.x}%`,
            top: "-5vh",
            animation: `dietLeafFall ${l.dur}s linear infinite`,
            animationDelay: `${l.startOffset * l.dur}s`,
          }}
        >
          <div
            style={{
              // @ts-expect-error CSS custom property
              "--sway": `${l.sway}px`,
              animation: `dietLeafSway ${l.dur / 2}s ease-in-out infinite`,
            }}
          >
            <Leaf
              size={l.size}
              className="text-accent-green"
              style={{ opacity: l.opacity }}
            />
          </div>
        </div>
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// REASONING POPOVER
// ═══════════════════════════════════════════════════════════

function ReasoningPopover({
  food,
  onClose,
}: {
  food: FoodItem;
  onClose: () => void;
}) {
  const config = STATUS_CONFIG[food.status];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="glass-panel max-w-lg w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium text-base leading-tight">
              {food.food_name}
            </h3>
            {food.local_name && (
              <p className="text-gray-500 text-xs mt-1 italic">
                {food.local_name}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border font-medium ${config.badge}`}
              >
                {config.badgeLabel}
              </span>
              <span className="text-xs text-gray-500 font-mono">
                S = {food.score.toFixed(2)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors shrink-0 ml-3"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Formula reminder */}
        <div className="bg-black/40 rounded-xl p-3 mb-4 border border-gray-800">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1.5">
            GNN Safety Formula
          </p>
          <p className="text-xs text-gray-400 font-mono leading-relaxed">
            S = (W<sub>safety</sub>·E<sub>conflict</sub>) + (W<sub>disease</sub>
            ·E<sub>aggravate</sub>) + (W<sub>wellness</sub>·E
            <sub>balance</sub>) + Ritu
          </p>
        </div>

        {/* Reasoning stack */}
        <div className="space-y-2.5">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">
            Reasoning Stack ({food.reasoning_stack.length} edges resolved)
          </p>
          {food.reasoning_stack.map((r, i) => {
            const isPositive = r.weight > 0;
            const isNegative = r.weight < 0;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-xl p-3 border ${
                  isNegative
                    ? "bg-red-950/20 border-red-800/30"
                    : isPositive
                    ? "bg-emerald-950/20 border-emerald-800/30"
                    : "bg-gray-900/40 border-gray-800/30"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-white">
                    {r.label}
                  </span>
                  <span
                    className={`text-xs font-mono font-bold ${
                      isNegative
                        ? "text-red-400"
                        : isPositive
                        ? "text-emerald-400"
                        : "text-gray-500"
                    }`}
                  >
                    {r.weight > 0 ? "+" : ""}
                    {r.weight.toFixed(1)}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  {r.detail}
                </p>
                <p className="text-[9px] text-gray-600 font-mono mt-1">
                  L{r.level} · {r.trigger}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Total */}
        <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
          <span className="text-xs text-gray-500">Total Safety Score</span>
          <span
            className={`text-lg font-mono font-bold ${
              food.score < 0
                ? "text-red-400"
                : food.score <= 1
                ? "text-amber-400"
                : "text-emerald-400"
            }`}
          >
            {food.score.toFixed(2)}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// FOOD CARD
// ═══════════════════════════════════════════════════════════

function FoodCard({
  food,
  index,
  onSelect,
}: {
  food: FoodItem;
  index: number;
  onSelect: () => void;
}) {
  const config = STATUS_CONFIG[food.status];
  const StatusIcon = config.icon;
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.03, duration: 0.35, ease: "easeOut" }}
      whileHover={{ scale: 1.02, y: -3 }}
      onClick={onSelect}
      className={`relative glass-panel overflow-hidden cursor-pointer group border ${
        config.border
      } ${config.glow} ${food.status === "Avoid" ? "opacity-70" : ""}`}
    >
      {/* Image */}
      <div className="relative h-36 overflow-hidden">
        {/* Veg / Non-Veg indicator (Indian restaurant style) */}
        <div className={`absolute top-2.5 left-2.5 z-10 w-4 h-4 rounded-sm border-2 flex items-center justify-center ${
          food.is_veg ? "border-emerald-500 bg-black/60" : "border-red-500 bg-black/60"
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${
            food.is_veg ? "bg-emerald-500" : "bg-red-500"
          }`} />
        </div>
        {!imgError ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={food.image_url}
            alt={food.food_name}
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${
              food.status === "Avoid" ? "grayscale brightness-50" : ""
            }`}
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-linear-to-br from-gray-900 to-gray-800 flex items-center justify-center">
            <UtensilsCrossed size={28} className="text-gray-700" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />

        {/* Status badge */}
        <div className="absolute top-2.5 right-2.5">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium uppercase tracking-wider ${config.badge}`}
          >
            <StatusIcon size={10} />
            {config.badgeLabel}
          </div>
        </div>

        {/* Avoid lock overlay */}
        {food.status === "Avoid" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="p-3 rounded-full bg-red-950/60 border border-red-800/40"
            >
              <Lock size={20} className="text-red-400" />
            </motion.div>
          </div>
        )}

        {/* Score pill */}
        <div className="absolute bottom-2.5 left-2.5">
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border backdrop-blur-sm ${
              food.score < 0
                ? "text-red-400 border-red-800/40 bg-red-950/60"
                : food.score <= 1
                ? "text-amber-400 border-amber-800/40 bg-amber-950/60"
                : "text-emerald-400 border-emerald-800/40 bg-emerald-950/60"
            }`}
          >
            S = {food.score.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5">
        <h4 className="text-white text-sm font-medium leading-tight line-clamp-2 mb-1">
          {food.food_name}
        </h4>
        {food.local_name && (
          <p className="text-gray-500 text-[11px] italic truncate mb-2">
            {food.local_name}
          </p>
        )}

        {/* Mini reasoning preview */}
        <div className="flex flex-wrap gap-1">
          {food.reasoning_stack.slice(0, 2).map((r, i) => (
            <span
              key={i}
              className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                r.weight < 0
                  ? "text-red-400 border-red-900/40 bg-red-950/30"
                  : r.weight > 0
                  ? "text-emerald-400 border-emerald-900/40 bg-emerald-950/30"
                  : "text-gray-500 border-gray-800 bg-gray-900/30"
              }`}
            >
              {r.weight > 0 ? "+" : ""}
              {r.weight.toFixed(1)}
            </span>
          ))}
          {food.reasoning_stack.length > 2 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full border text-gray-500 border-gray-800 bg-gray-900/30">
              +{food.reasoning_stack.length - 2} more
            </span>
          )}
        </div>
      </div>

      {/* Hover info line */}
      <div className="absolute bottom-0 inset-x-0 h-0.5 bg-linear-to-r from-transparent via-accent-green/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// ORACLE LOADER
// ═══════════════════════════════════════════════════════════

function OracleLoader({ step }: { step: number }) {
  return (
    <div className="min-h-screen bg-void-green flex items-center justify-center relative overflow-hidden">
      <FallingLeaves />

      {/* Animated graph background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <svg className="w-full h-full opacity-10" viewBox="0 0 800 600">
          {/* Animated nodes */}
          {Array.from({ length: 20 }).map((_, i) => (
            <motion.circle
              key={i}
              cx={100 + (i % 5) * 150 + Math.sin(i) * 40}
              cy={80 + Math.floor(i / 5) * 130 + Math.cos(i) * 30}
              r={4 + (i % 3) * 2}
              fill="#39FF14"
              initial={{ opacity: 0, scale: 0 }}
              animate={{
                opacity: [0.2, 0.8, 0.2],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{
                delay: i * 0.15,
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
          {/* Animated edges */}
          {Array.from({ length: 15 }).map((_, i) => {
            const x1 = 100 + (i % 5) * 150 + Math.sin(i) * 40;
            const y1 = 80 + Math.floor(i / 5) * 130 + Math.cos(i) * 30;
            const j = (i + 3) % 20;
            const x2 = 100 + (j % 5) * 150 + Math.sin(j) * 40;
            const y2 = 80 + Math.floor(j / 5) * 130 + Math.cos(j) * 30;
            return (
              <motion.line
                key={`e${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#39FF14"
                strokeWidth={0.5}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.4, 0] }}
                transition={{
                  delay: i * 0.2,
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            );
          })}
        </svg>
      </div>

      {/* Main content */}
      <div className="relative z-10 w-full max-w-lg glass-panel p-10 text-center mx-4">
        {/* Spinning brain */}
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="mx-auto w-20 h-20 mb-8 p-4 rounded-full bg-accent-green/10 border border-accent-green/20 flex items-center justify-center"
        >
          <Activity size={32} className="text-accent-green" />
        </motion.div>

        <h2 className="text-xl text-white font-light mb-2">
          GNN Knowledge Graph
        </h2>
        <p className="text-xs text-gray-500 mb-8">
          Resolving biochemical pathways & safety constraints
        </p>

        {/* Steps */}
        <div className="space-y-2.5 font-mono text-xs text-left mb-8">
          {ORACLE_STEPS.map((s, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0.15, x: -10 }}
              animate={{
                opacity: i <= step ? 1 : 0.15,
                x: i <= step ? 0 : -10,
              }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-3"
            >
              {i < step ? (
                <Check size={13} className="text-accent-green shrink-0" />
              ) : i === step ? (
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-3 h-3 rounded-full bg-accent-green shrink-0"
                />
              ) : (
                <div className="w-3 h-3 rounded-full bg-gray-700 shrink-0" />
              )}
              <span
                className={i <= step ? "text-gray-300" : "text-gray-700"}
              >
                {s}
              </span>
            </motion.div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-accent-green rounded-full"
            initial={{ width: "0%" }}
            animate={{
              width: `${((step + 1) / ORACLE_STEPS.length) * 100}%`,
            }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STATS BAR
// ═══════════════════════════════════════════════════════════

function StatsBar({
  data,
  dominant,
  ritu,
  dietaryPref,
}: {
  data: GNNResponse;
  dominant: string;
  ritu: string;
  dietaryPref: string | null;
}) {
  const DoshaIcon = DOSHA_ICONS[dominant] ?? Zap;
  const allFoods = Object.values(data.results).flat();
  const consumeCount = allFoods.filter((f) => f.status === "Consume").length;
  const moderateCount = allFoods.filter(
    (f) => f.status === "Moderate"
  ).length;
  const avoidCount = allFoods.filter((f) => f.status === "Avoid").length;
  const isNonVeg = dietaryPref?.toLowerCase() === "non-vegetarian";
  const isVegan = dietaryPref?.toLowerCase() === "vegan";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="glass-panel p-5 mb-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Context */}
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-xl bg-accent-green/10 border border-accent-green/20">
            <DoshaIcon size={20} className="text-accent-green" />
          </div>
          <div>
            <p className="text-xs text-gray-500">
              Personalised for{" "}
              <span className="text-accent-green font-medium">
                {dominant}
              </span>{" "}
              Prakriti ·{" "}
              <span className="text-pastel-green">{ritu}</span>
            </p>
            <p className="text-[10px] text-gray-600 mt-0.5">
              {data.graph_stats.total_nodes} nodes ·{" "}
              {data.graph_stats.total_edges} edges resolved ·{" "}
              {data.filtered_out} foods filtered by allergens/diet
            </p>
          </div>
        </div>

        {/* Right: Diet badge + counts */}
        <div className="flex items-center gap-3">
          {/* Diet preference badge */}
          {dietaryPref && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
              isNonVeg
                ? "bg-red-950/30 border-red-800/30"
                : isVegan
                ? "bg-emerald-950/30 border-emerald-800/30"
                : "bg-emerald-950/20 border-emerald-800/20"
            }`}>
              {/* Indian restaurant-style indicator */}
              <div className={`w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0 ${
                isNonVeg ? "border-red-500" : "border-emerald-500"
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  isNonVeg ? "bg-red-500" : "bg-emerald-500"
                }`} />
              </div>
              <span className={`text-xs font-medium ${
                isNonVeg ? "text-red-300" : "text-emerald-300"
              }`}>
                {dietaryPref}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-800/30">
            <Check size={12} className="text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium">
              {consumeCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/30 border border-amber-800/30">
            <AlertTriangle size={12} className="text-amber-400" />
            <span className="text-xs text-amber-400 font-medium">
              {moderateCount}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/30 border border-red-800/30">
            <Lock size={12} className="text-red-400" />
            <span className="text-xs text-red-400 font-medium">
              {avoidCount}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════

export default function DietPage() {
  const router = useRouter();

  // Data
  const [profile, setProfile] = useState<Profile | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [gnnData, setGnnData] = useState<GNNResponse | null>(null);

  // UI states
  const [loading, setLoading] = useState(true);
  const [oracleStep, setOracleStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Breakfast");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);

  // Derived
  const dominant =
    profile?.base_prakriti?.dominant ??
    assessment?.dominant_prakriti ??
    "Vata";
  const secondary = profile?.base_prakriti?.secondary ?? "Pitta";
  const suppressed =
    profile?.base_prakriti?.suppressed ??
    assessment?.suppressed_prakriti ??
    "Kapha";
  const ritu =
    profile?.current_ritu ?? assessment?.current_ritu ?? "Vasant Ritu";

  // Filtered foods for current tab
  const currentFoods = useMemo(() => {
    if (!gnnData) return [];
    // Deduplicate by node_id in case backend served stale in-memory data
    const seen = new Set<string>();
    let foods = (gnnData.results[activeTab] ?? []).filter((f) => {
      if (seen.has(f.node_id)) return false;
      seen.add(f.node_id);
      return true;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      foods = foods.filter(
        (f) =>
          f.food_name.toLowerCase().includes(q) ||
          f.local_name.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      foods = foods.filter((f) => f.status === statusFilter);
    }
    return foods;
  }, [gnnData, activeTab, searchQuery, statusFilter]);

  // Tab counts for badges
  const tabCounts = useMemo(() => {
    if (!gnnData) return {};
    const counts: Record<string, number> = {};
    for (const tab of MEAL_TABS) {
      counts[tab.key] = (gnnData.results[tab.key] ?? []).length;
    }
    return counts;
  }, [gnnData]);

  // ── Load profile + call GNN ──
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/");
          return;
        }

        const [p, a] = await Promise.all([
          getProfile(),
          getLatestAssessment(),
        ]);
        if (!p) {
          setError("Profile not found. Complete onboarding first.");
          setLoading(false);
          return;
        }

        const prof = p as Profile;
        const assess = a as Assessment | null;
        setProfile(prof);
        if (assess) setAssessment(assess);

        // Build GNN request
        const gnnReq = {
          dominant_dosha:
            prof.base_prakriti?.dominant ??
            assess?.dominant_prakriti ??
            "Vata",
          secondary_dosha: prof.base_prakriti?.secondary ?? "Pitta",
          suppressed_dosha:
            prof.base_prakriti?.suppressed ??
            assess?.suppressed_prakriti ??
            "Kapha",
          current_ritu:
            prof.current_ritu ?? assess?.current_ritu ?? "Vasant Ritu",
          dietary_preference: prof.dietary_preference,
          allergies: prof.allergies ?? [],
          health_conditions: prof.health_conditions ?? [],
          medications: prof.medications ?? [],
          doctor_restrictions: prof.doctor_restrictions,
        };

        // Start oracle animation
        const stepInterval = setInterval(() => {
          if (cancelled) {
            clearInterval(stepInterval);
            return;
          }
          setOracleStep((prev) => {
            if (prev >= ORACLE_STEPS.length - 2) {
              clearInterval(stepInterval);
              return prev;
            }
            return prev + 1;
          });
        }, 500);

        // Call backend
        const res = await fetch(`${ML_URL}/recommend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(gnnReq),
        });

        if (!res.ok) {
          throw new Error(`Backend returned ${res.status}`);
        }

        const data: GNNResponse = await res.json();

        // Finish oracle animation
        clearInterval(stepInterval);
        setOracleStep(ORACLE_STEPS.length - 1);

        // Brief pause to show completion
        await new Promise((r) => setTimeout(r, 800));

        if (!cancelled) {
          setGnnData(data);

          // Cache for daily-quest page (keyed by user + date, refreshes daily)
          try {
            const today = new Date().toISOString().split("T")[0];
            const cacheKey = `ayurithm_gnn_${user.id}_${today}`;
            localStorage.setItem(cacheKey, JSON.stringify(data));
            // Purge stale keys from prior days
            for (const k of Object.keys(localStorage)) {
              if (k.startsWith("ayurithm_gnn_") && k !== cacheKey) {
                localStorage.removeItem(k);
              }
            }
          } catch { /* storage unavailable */ }

          // Auto-select first tab with results
          for (const tab of MEAL_TABS) {
            if ((data.results[tab.key] ?? []).length > 0) {
              setActiveTab(tab.key);
              break;
            }
          }
          setLoading(false);
        }
      } catch (err) {
        console.error("Diet page error:", err);
        if (!cancelled) {
          setError(
            "Unable to connect to the GNN engine. Make sure the Python backend is running on port 8000."
          );
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ═══════════════════════════════════════════════════════════
  // RENDER: LOADING / ORACLE
  // ═══════════════════════════════════════════════════════════

  if (loading && !error) {
    return <OracleLoader step={oracleStep} />;
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: ERROR
  // ═══════════════════════════════════════════════════════════

  if (error) {
    return (
      <main className="min-h-screen bg-void-green flex items-center justify-center p-4">
        <div className="glass-panel p-8 text-center max-w-md">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-white text-lg font-medium mb-2">
            Connection Error
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            {error}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.push("/dashboard")}
              className="px-4 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:border-gray-500 transition-all text-sm"
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 rounded-xl border border-accent-green/50 text-accent-green hover:bg-accent-green/10 transition-all text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!gnnData) return null;

  // ═══════════════════════════════════════════════════════════
  // RENDER: MAIN DASHBOARD
  // ═══════════════════════════════════════════════════════════

  return (
    <main className="min-h-screen bg-void-green relative overflow-x-hidden pb-28">
      <FallingLeaves />

      {/* Dashboard-style enhanced cards */}
      <style>{`
        .diet-frame .glass-panel {
          background: rgba(6, 12, 7, 0.91);
          border: 1px solid rgba(57, 255, 20, 0.22);
          box-shadow:
            0 8px 48px rgba(0, 0, 0, 0.72),
            0 0 0 1px rgba(57, 255, 20, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }
        .diet-frame .glass-panel:hover {
          border: 1px solid rgba(57, 255, 20, 0.38);
          box-shadow:
            0 8px 56px rgba(0, 0, 0, 0.78),
            0 0 28px rgba(57, 255, 20, 0.07);
        }
        .diet-frame .text-gray-300 { color: rgb(243 244 246) !important; }
        .diet-frame .text-gray-400 { color: rgb(229 231 235) !important; }
        .diet-frame .text-gray-500 { color: rgb(209 213 219) !important; }
        .diet-frame .text-gray-600 { color: rgb(156 163 175) !important; }
      `}</style>

      {/* Background lotus (same as dashboard) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/dash_bg.png" alt="" aria-hidden="true" className="fixed top-1/2 left-1/2 w-[135vw] h-[135vh] object-contain -translate-x-1/2 -translate-y-1/2 pointer-events-none mix-blend-screen opacity-30 z-0" style={{ filter: "blur(0px) brightness(1.2) saturate(1.8)" }} />

      {/* Reasoning popover */}
      <AnimatePresence>
        {selectedFood && (
          <ReasoningPopover
            food={selectedFood}
            onClose={() => setSelectedFood(null)}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="diet-frame relative z-10 max-w-7xl mx-auto p-4 md:p-8"
      >
        {/* ═══════ HEADER ═══════ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-6 md:p-8 mb-6"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/dashboard")}
                className="p-2.5 rounded-xl border border-gray-700 hover:border-accent-green/40 transition-all shrink-0"
              >
                <ArrowLeft size={16} className="text-gray-400" />
              </button>
              <div>
                <p className="text-xs text-accent-green uppercase tracking-[0.3em] mb-1">
                  <Sparkles
                    size={12}
                    className="inline mr-1.5 mb-0.5"
                  />
                  GNN Diet Oracle
                </p>
                <h1 className="text-2xl md:text-3xl font-light text-white">
                  Local Diet{" "}
                  <span className="text-accent-green font-normal">
                    Suggestions
                  </span>
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Leaf size={14} className="text-pastel-green" />
                <span className="text-xs text-gray-400">{ritu}</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-accent-green" />
                <span className="text-xs text-gray-400">
                  Safety-First Filtering
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ═══════ STATS BAR ═══════ */}
        <StatsBar data={gnnData} dominant={dominant} ritu={ritu} dietaryPref={profile?.dietary_preference ?? null} />

        {/* ═══════ TABS + FILTERS ═══════ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6"
        >
          {/* Meal tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            {MEAL_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              const count = tabCounts[tab.key] ?? 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs transition-all ${
                    isActive
                      ? "bg-accent-green/15 border-accent-green/50 text-accent-green"
                      : "bg-black/20 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? "bg-accent-green/20 text-accent-green"
                        : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search + status filter */}
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-50">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search foods..."
                className="w-full bg-black/40 border border-gray-700 focus:border-accent-green rounded-xl pl-9 pr-4 py-2.5 text-xs text-white outline-none transition-colors"
              />
            </div>

            {/* Status filter */}
            <div className="flex gap-1.5">
              {[
                { key: "all", label: "All" },
                { key: "Consume", label: "Consume" },
                { key: "Moderate", label: "Moderate" },
                { key: "Avoid", label: "Avoid" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-2 rounded-xl border text-xs transition-all ${
                    statusFilter === f.key
                      ? "bg-accent-green/15 border-accent-green/50 text-accent-green"
                      : "bg-black/20 border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ═══════ FOOD GRID ═══════ */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeTab}-${statusFilter}-${searchQuery}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {currentFoods.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {currentFoods.map((food, i) => (
                  <FoodCard
                    key={food.node_id}
                    food={food}
                    index={i}
                    onSelect={() => setSelectedFood(food)}
                  />
                ))}
              </div>
            ) : (
              <div className="glass-panel p-12 text-center">
                <UtensilsCrossed
                  size={32}
                  className="text-gray-700 mx-auto mb-4"
                />
                <p className="text-gray-500 text-sm">
                  No foods found for this combination.
                </p>
                <p className="text-gray-600 text-xs mt-1">
                  Try adjusting the filters or search query.
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* ═══════ LEGEND / FOOTER ═══════ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 glass-panel p-5"
        >
          <div className="flex items-start gap-3">
            <Info size={14} className="text-gray-600 mt-0.5 shrink-0" />
            <div className="text-[11px] text-gray-600 leading-relaxed space-y-1">
              <p>
                <span className="text-emerald-400 font-medium">
                  Consume (S &gt; 1.0):
                </span>{" "}
                Zero medical conflicts, actively heals — aligns with your
                Prakriti &amp; Ritu.
              </p>
              <p>
                <span className="text-amber-400 font-medium">
                  Moderate (0.0 – 1.0):
                </span>{" "}
                No clinical danger, but limited dosha-pacifying benefits or
                slight imbalance.
              </p>
              <p>
                <span className="text-red-400 font-medium">
                  Avoid (S &lt; 0.0):
                </span>{" "}
                Drug or disease conflict detected — pharmacological safety
                overrides Ayurvedic benefits.
              </p>
              <p className="mt-2 text-gray-700">
                Click any food card to view the full GNN reasoning stack
                with weighted edge breakdowns.
              </p>
            </div>
          </div>
        </motion.div>

      </motion.div>

      {/* ═══════ DAILY QUEST FIXED BOTTOM BAR ═══════ */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.5 }}
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: "rgba(4, 9, 5, 0.92)",
          borderTop: "1px solid rgba(57,255,20,0.22)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(57,255,20,0.05)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-accent-green/10 border border-accent-green/20 shrink-0">
              <Zap size={18} className="text-accent-green" />
            </div>
            <div>
              <p className="text-[10px] text-accent-green uppercase tracking-[0.25em] mb-0.5">
                Up Next
              </p>
              <h3 className="text-base font-light text-white leading-tight">
                Daily{" "}
                <span className="text-accent-green font-normal">Quest</span>
              </h3>
              <p className="text-[11px] text-gray-500 leading-relaxed max-w-md hidden sm:block">
                Complete personalised Ayurvedic micro-tasks — breathing
                exercises, herbal routines, and mindful rituals — tuned to
                your Prakriti and today&apos;s Ritu.
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/daily-quest")}
            className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-accent-green text-black font-medium text-sm hover:bg-pastel-green transition-all shrink-0 shadow-[0_0_24px_rgba(57,255,20,0.3)]"
          >
            <Activity size={16} />
            Start Daily Quest
            <ArrowLeft size={14} className="rotate-180" />
          </button>
        </div>
      </motion.div>
    </main>
  );
}
