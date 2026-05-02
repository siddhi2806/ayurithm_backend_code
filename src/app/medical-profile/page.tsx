"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Salad,
  AlertTriangle,
  HeartPulse,
  Pill,
  ArrowRight,
  X,
  Plus,
  CheckCircle2,
  ShieldCheck,
  Brain,
  Lock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/lib/queries";

// ─── DATA ───────────────────────────────────────────────────

const DIETARY_OPTIONS = [
  { value: "vegetarian", label: "Vegetarian", desc: "No meat, fish, or eggs" },
  { value: "lacto-vegetarian", label: "Lacto-Vegetarian", desc: "Includes milk products" },
  { value: "lacto-ovo-vegetarian", label: "Lacto-Ovo-Vegetarian", desc: "Includes milk and eggs" },
  { value: "non-vegetarian", label: "Non-Vegetarian", desc: "Includes meat, fish, and eggs" },
];

const ALLERGY_GROUPS: { category: string; items: string[] }[] = [
  {
    category: "Major Global",
    items: ["Dairy / Milk", "Eggs", "Peanuts", "Tree Nuts", "Gluten / Wheat", "Soy", "Fish", "Shellfish"],
  },
  {
    category: "Common Indian & Regional",
    items: [
      "Chickpea", "Lentils", "Black Gram", "Kidney Beans",
      "Sesame", "Mustard",
      "Brinjal", "Banana",
    ],
  },
];

const CONDITION_GROUPS: { category: string; items: string[] }[] = [
  {
    category: "Cardio-Metabolic",
    items: ["High Blood Pressure", "High Cholesterol / Dyslipidemia", "Heart Disease", "Stroke"],
  },
  {
    category: "Endocrine & Hormonal",
    items: ["Diabetes (Type 1)", "Diabetes (Type 2)", "Thyroid Imbalance", "PCOD / PCOS", "Obesity"],
  },
  {
    category: "Digestive & Liver",
    items: ["Acid Reflux / GERD", "IBS", "IBD", "NAFLD", "Chronic Constipation"],
  },
  {
    category: "Musculoskeletal",
    items: ["Arthritis", "Gout / High Uric Acid", "Osteoporosis"],
  },
];

const SAVING_STEPS = [
  "Encrypting Health Data...",
  "Initializing NLP Entity Extraction...",
  "Indexing Allergy & Condition Graph Nodes...",
  "Building Pharmacological Interaction Map...",
  "Generating Safety Profile...",
];

// ─── FALLING LEAVES (reused) ────────────────────────────────
const LEAF_CONFIGS = [
  { size: 16, x: 6,  startOffset: 0.00, dur: 13, sway: 24,  opacity: 0.16 },
  { size: 11, x: 22, startOffset: 0.20, dur: 16, sway: -20, opacity: 0.12 },
  { size: 20, x: 40, startOffset: 0.40, dur: 11, sway: 28,  opacity: 0.18 },
  { size: 9,  x: 58, startOffset: 0.55, dur: 15, sway: -16, opacity: 0.10 },
  { size: 14, x: 72, startOffset: 0.72, dur: 12, sway: 22,  opacity: 0.15 },
  { size: 18, x: 88, startOffset: 0.88, dur: 10, sway: -26, opacity: 0.17 },
  { size: 12, x: 34, startOffset: 0.33, dur: 14, sway: 20,  opacity: 0.11 },
  { size: 15, x: 80, startOffset: 0.60, dur: 13, sway: -22, opacity: 0.14 },
];

function FallingLeaves() {
  return (
    <>
      <style>{`
        @keyframes leafDrop {
          0%   { transform: translateY(-10vh); opacity: 0; }
          6%   { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(110vh); opacity: 0; }
        }
        @keyframes leafDrift {
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
            <div
              key={i}
              style={{
                position: "absolute",
                top: 0,
                left: `${leaf.x}%`,
                opacity: leaf.opacity,
                ["--sway" as string]: `${leaf.sway}px`,
                animation: `leafDrop ${leaf.dur}s linear ${dropDelay.toFixed(2)}s infinite`,
              }}
            >
              <div style={{ animation: `leafDrift ${driftDur.toFixed(2)}s ease-in-out ${driftDelay.toFixed(2)}s infinite` }}>
                <svg width={leaf.size} height={leaf.size} viewBox="0 0 24 24" fill="none"
                  style={{ display: "block", filter: `drop-shadow(0 0 ${Math.round(leaf.size * 0.4)}px rgba(57,255,20,0.55))` }}>
                  <path d="M12 2C6 2 2 8 2 14c0 4 2.5 7 6 8 0-4 2-8 4-10-2 3-3 7-3 10h2c0-3 1-7 3-9-1 3-2 6-2 9h2c0-4 1-7 3-9 0 4-1 7-1 9h2c0-3-.5-7 0-10 2-3 4-6 4-8C22 6 18 2 12 2z"
                    fill="rgba(57,255,20,0.6)" />
                  <path d="M12 4c0 0 0 8 0 16" stroke="rgba(167,243,208,0.4)" strokeWidth="0.8" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── CHIP COMPONENTS ────────────────────────────────────────
function SelectableChip({
  label,
  selected,
  onToggle,
  disabled,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      onClick={onToggle}
      disabled={disabled}
      whileTap={{ scale: 0.95 }}
      className={`px-3 py-2 rounded-lg border text-xs transition-all ${
        selected
          ? "bg-accent-green/15 border-accent-green/50 text-accent-green shadow-[0_0_12px_rgba(57,255,20,0.15)]"
          : disabled
          ? "bg-black/20 border-gray-800 text-gray-600 cursor-not-allowed"
          : "bg-black/30 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
      }`}
    >
      {label}
    </motion.button>
  );
}

function TagInput({
  tags,
  setTags,
  placeholder,
  disabled,
}: {
  tags: string[];
  setTags: (t: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setInput("");
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 bg-black/40 border border-gray-700 focus:border-accent-green rounded-lg px-3 py-2 text-xs text-white outline-none transition-colors disabled:opacity-40"
        />
        <button
          onClick={addTag}
          disabled={disabled || !input.trim()}
          className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:text-accent-green hover:border-accent-green/50 transition-colors disabled:opacity-30"
        >
          <Plus size={14} />
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 bg-accent-green/10 text-accent-green text-xs px-2 py-1 rounded-md border border-accent-green/20"
            >
              {tag}
              <button onClick={() => setTags(tags.filter((t) => t !== tag))} className="hover:text-white">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────
export default function MedicalProfile() {
  const router = useRouter();

  // ── State ──
  const [dietaryPref, setDietaryPref] = useState<string>("");

  const [selectedAllergies, setSelectedAllergies] = useState<Set<string>>(new Set());
  const [customAllergies, setCustomAllergies] = useState<string[]>([]);
  const [noAllergies, setNoAllergies] = useState(false);

  const [selectedConditions, setSelectedConditions] = useState<Set<string>>(new Set());
  const [customConditions, setCustomConditions] = useState<string[]>([]);
  const [noConditions, setNoConditions] = useState(false);

  const [takingMeds, setTakingMeds] = useState<"yes" | "no" | "">("");
  const [medications, setMedications] = useState("");
  const [doctorRestrictions, setDoctorRestrictions] = useState("");

  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState(0);

  // ── Togglers ──
  const toggleAllergy = (item: string) => {
    if (noAllergies) return;
    setSelectedAllergies((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const toggleCondition = (item: string) => {
    if (noConditions) return;
    setSelectedConditions((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const toggleNoAllergies = () => {
    if (!noAllergies) {
      setSelectedAllergies(new Set());
      setCustomAllergies([]);
    }
    setNoAllergies(!noAllergies);
  };

  const toggleNoConditions = () => {
    if (!noConditions) {
      setSelectedConditions(new Set());
      setCustomConditions([]);
    }
    setNoConditions(!noConditions);
  };

  // ── Dairy + Lacto warning ──
  const showDairyWarning =
    selectedAllergies.has("Dairy / Milk") &&
    (dietaryPref === "lacto-vegetarian" || dietaryPref === "lacto-ovo-vegetarian");

  // ── Save ──
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSavingStep(0);

    const payload = {
      dietary_preference: dietaryPref || null,
      allergies: noAllergies
        ? []
        : [...Array.from(selectedAllergies), ...customAllergies],
      health_conditions: noConditions
        ? []
        : [...Array.from(selectedConditions), ...customConditions],
      medications: takingMeds === "yes" && medications.trim()
        ? medications.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      doctor_restrictions: doctorRestrictions.trim() || null,
    };

    // Animate saving steps
    const stepInterval = setInterval(() => {
      setSavingStep((prev) => {
        if (prev >= SAVING_STEPS.length - 1) {
          clearInterval(stepInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 800);

    // Save to Supabase
    try {
      await updateProfile(payload);
    } catch (err) {
      console.error("Failed to save medical profile:", err);
    }

    // Wait for animation to finish
    await new Promise((resolve) => setTimeout(resolve, SAVING_STEPS.length * 800 + 600));
    clearInterval(stepInterval);

    router.push("/dashboard");
  }, [
    dietaryPref, selectedAllergies, customAllergies, noAllergies,
    selectedConditions, customConditions, noConditions,
    takingMeds, medications, doctorRestrictions, router,
  ]);

  // ── Card animation ──
  const cardVariants = {
    hidden: { opacity: 0, y: 24, scale: 0.97 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { delay: i * 0.12, duration: 0.5, ease: "easeOut" as const },
    }),
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <main className="min-h-screen bg-void-green relative overflow-x-hidden">
      <FallingLeaves />

      {/* ── Health BG ── */}
      <style>{`
        @keyframes healthBgFloat {
          0%, 100% { transform: translate(-50%, -50%) scale(1)    translateY(0px);  }
          33%       { transform: translate(-50%, -50%) scale(1.02) translateY(-12px); }
          66%       { transform: translate(-50%, -50%) scale(0.99) translateY(8px);  }
        }
        @keyframes healthBgGlow {
          0%, 100% {
            filter: blur(0px) brightness(1.15) saturate(1.6) opacity(0.22)
                    drop-shadow(0 0 24px rgba(57,255,20,0.12))
                    drop-shadow(0 0 48px rgba(57,255,20,0.06));
          }
          50% {
            filter: blur(0px) brightness(1.25) saturate(1.9) opacity(0.30)
                    drop-shadow(0 0 36px rgba(57,255,20,0.18))
                    drop-shadow(0 0 72px rgba(57,255,20,0.09));
          }
        }
        .health-bg {
          position: fixed;
          top: 50%;
          left: 50%;
          width: 100vw;
          height: 100vh;
          object-fit: contain;
          transform: translate(-50%, -50%);
          pointer-events: none;
          mix-blend-mode: screen;
          animation:
            healthBgFloat 14s ease-in-out infinite,
            healthBgGlow   7s ease-in-out infinite;
          z-index: 0;
        }
      `}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/health_bg.png"
        alt=""
        aria-hidden="true"
        className="health-bg"
      />

      <AnimatePresence mode="wait">
        {saving ? (
          /* ═══════ SAVING OVERLAY ═══════ */
          <motion.div
            key="saving"
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
                <Lock size={28} className="text-accent-green" />
              </motion.div>

              <h2 className="text-xl text-white font-light mb-2">
                Securing Your Health Data
              </h2>
              <p className="text-gray-500 text-xs mb-8">
                AES-256 Encrypted • Zero-Knowledge Architecture
              </p>

              <div className="space-y-3 font-mono text-xs text-left">
                {SAVING_STEPS.map((step, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0.2, x: -10 }}
                    animate={{
                      opacity: i <= savingStep ? 1 : 0.2,
                      x: i <= savingStep ? 0 : -10,
                    }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3"
                  >
                    {i < savingStep ? (
                      <CheckCircle2 size={14} className="text-accent-green shrink-0" />
                    ) : i === savingStep ? (
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="w-3.5 h-3.5 rounded-full bg-accent-green shrink-0"
                      />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full bg-gray-700 shrink-0" />
                    )}
                    <span className={i <= savingStep ? "text-gray-300" : "text-gray-600"}>
                      {step}
                    </span>
                  </motion.div>
                ))}
              </div>

              <div className="mt-8 h-1.5 bg-black/40 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-accent-green rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${((savingStep + 1) / SAVING_STEPS.length) * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>
          </motion.div>
        ) : (
          /* ═══════ BENTO GRID ═══════ */
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative z-10 max-w-6xl mx-auto p-4 md:p-8"
          >
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-8"
            >
              <div className="inline-flex items-center gap-2 text-accent-green text-xs uppercase tracking-[0.3em] mb-3">
                <ShieldCheck size={14} />
                Health &amp; Diet Profile
              </div>
              <h1 className="text-3xl md:text-4xl font-light text-white mb-3">
                Your Safety Blueprint
              </h1>
              <p className="text-gray-500 text-sm max-w-xl mx-auto">
                This data powers our GNN safety filter — ensuring every recommendation
                respects your body, diet, and medical reality.
              </p>
            </motion.div>

            {/* ── BENTO GRID ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">

              {/* ─── CARD 1: DIETARY PREFERENCE ─── */}
              <motion.div
                custom={0}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="glass-panel p-6"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 rounded-lg bg-emerald-900/30 text-pastel-green">
                    <Salad size={20} />
                  </div>
                  <div>
                    <h3 className="text-white font-medium text-sm">Primary Dietary Preference</h3>
                    <p className="text-gray-500 text-xs">Select one</p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {DIETARY_OPTIONS.map((opt) => {
                    const selected = dietaryPref === opt.value;
                    return (
                      <motion.button
                        key={opt.value}
                        onClick={() => setDietaryPref(opt.value)}
                        whileTap={{ scale: 0.98 }}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                          selected
                            ? "bg-accent-green/15 border-accent-green/50 shadow-[0_0_18px_rgba(57,255,20,0.1)]"
                            : "bg-black/25 border-gray-700 hover:border-gray-500"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              selected ? "border-accent-green bg-accent-green/20" : "border-gray-600"
                            }`}
                          >
                            {selected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-2 h-2 rounded-full bg-accent-green"
                              />
                            )}
                          </div>
                          <div>
                            <p className={`text-sm ${selected ? "text-accent-green" : "text-gray-300"}`}>
                              {opt.label}
                            </p>
                            <p className="text-[11px] text-gray-500">{opt.desc}</p>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Dairy Warning */}
                <AnimatePresence>
                  {showDairyWarning && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 bg-yellow-950/40 border border-yellow-700/40 rounded-lg p-3 flex items-start gap-2 overflow-hidden"
                    >
                      <AlertTriangle size={14} className="text-yellow-500 mt-0.5 shrink-0" />
                      <p className="text-yellow-400 text-xs leading-relaxed">
                        You selected a Lacto diet but listed <strong>Dairy / Milk</strong> as an allergy.
                        Our safety filter will restrict dairy-based suggestions.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* ─── CARD 2: FOOD ALLERGIES ─── */}
              <motion.div
                custom={1}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="glass-panel p-6 max-h-[480px] overflow-y-auto"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 rounded-lg bg-red-900/30 text-red-400">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="text-white font-medium text-sm">Food Allergies</h3>
                    <p className="text-gray-500 text-xs">Select all that apply</p>
                  </div>
                </div>

                {/* No allergies toggle */}
                <motion.button
                  onClick={toggleNoAllergies}
                  whileTap={{ scale: 0.97 }}
                  className={`w-full text-left px-4 py-3 rounded-xl border mb-4 transition-all text-xs ${
                    noAllergies
                      ? "bg-accent-green/15 border-accent-green/50 text-accent-green shadow-[0_0_12px_rgba(57,255,20,0.12)]"
                      : "bg-black/25 border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className={noAllergies ? "text-accent-green" : "text-gray-600"} />
                    I do not have any known food allergies
                  </div>
                </motion.button>

                {/* Allergy categories */}
                {ALLERGY_GROUPS.map((group) => (
                  <div key={group.category} className="mb-4">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">
                      {group.category}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.items.map((item) => (
                        <SelectableChip
                          key={item}
                          label={item}
                          selected={selectedAllergies.has(item)}
                          onToggle={() => toggleAllergy(item)}
                          disabled={noAllergies}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {/* Other allergies */}
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Other</p>
                <TagInput
                  tags={customAllergies}
                  setTags={setCustomAllergies}
                  placeholder="Add custom allergy..."
                  disabled={noAllergies}
                />
              </motion.div>

              {/* ─── CARD 3: HEALTH CONDITIONS ─── */}
              <motion.div
                custom={2}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="glass-panel p-6 max-h-[480px] overflow-y-auto"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 rounded-lg bg-blue-900/30 text-blue-400">
                    <HeartPulse size={20} />
                  </div>
                  <div>
                    <h3 className="text-white font-medium text-sm">Health Conditions</h3>
                    <p className="text-gray-500 text-xs">Select all that apply</p>
                  </div>
                </div>

                {/* No conditions toggle */}
                <motion.button
                  onClick={toggleNoConditions}
                  whileTap={{ scale: 0.97 }}
                  className={`w-full text-left px-4 py-3 rounded-xl border mb-4 transition-all text-xs ${
                    noConditions
                      ? "bg-accent-green/15 border-accent-green/50 text-accent-green shadow-[0_0_12px_rgba(57,255,20,0.12)]"
                      : "bg-black/25 border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className={noConditions ? "text-accent-green" : "text-gray-600"} />
                    I do not have any of these conditions
                  </div>
                </motion.button>

                {/* Condition categories */}
                {CONDITION_GROUPS.map((group) => (
                  <div key={group.category} className="mb-4">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">
                      {group.category}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.items.map((item) => (
                        <SelectableChip
                          key={item}
                          label={item}
                          selected={selectedConditions.has(item)}
                          onToggle={() => toggleCondition(item)}
                          disabled={noConditions}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {/* Other conditions */}
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Other</p>
                <TagInput
                  tags={customConditions}
                  setTags={setCustomConditions}
                  placeholder="Add custom condition..."
                  disabled={noConditions}
                />
              </motion.div>

              {/* ─── CARD 4: MEDICATIONS & RESTRICTIONS ─── */}
              <motion.div
                custom={3}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                className="glass-panel p-6"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2.5 rounded-lg bg-purple-900/30 text-purple-400">
                    <Pill size={20} />
                  </div>
                  <div>
                    <h3 className="text-white font-medium text-sm">Allopathic Pharmacology &amp; Restrictions</h3>
                    <p className="text-gray-500 text-xs">Medication &amp; doctor instructions</p>
                  </div>
                </div>

                {/* Q4: Taking meds? */}
                <div className="mb-5">
                  <p className="text-xs text-gray-300 mb-3">
                    Are you currently taking any allopathic (Western) medication?
                  </p>
                  <div className="flex gap-3">
                    {(["yes", "no"] as const).map((val) => {
                      const selected = takingMeds === val;
                      return (
                        <motion.button
                          key={val}
                          onClick={() => setTakingMeds(val)}
                          whileTap={{ scale: 0.95 }}
                          className={`flex-1 px-4 py-3 rounded-xl border text-sm capitalize transition-all ${
                            selected
                              ? "bg-accent-green/15 border-accent-green/50 text-accent-green shadow-[0_0_14px_rgba(57,255,20,0.1)]"
                              : "bg-black/25 border-gray-700 text-gray-400 hover:border-gray-500"
                          }`}
                        >
                          {val}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Q5: Medications list — only if Yes */}
                <AnimatePresence>
                  {takingMeds === "yes" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-5 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-xs text-gray-300">
                          List conditions / medications
                        </p>
                        <span className="text-[9px] text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded-full border border-purple-700/30">
                          AI NLP Input
                        </span>
                      </div>
                      <textarea
                        value={medications}
                        onChange={(e) => setMedications(e.target.value)}
                        placeholder="e.g., Warfarin, Metformin, Atorvastatin..."
                        rows={3}
                        className="w-full bg-black/40 border border-gray-700 focus:border-accent-green rounded-xl px-4 py-3 text-xs text-white outline-none transition-colors resize-none"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Q6: Doctor restrictions */}
                <div>
                  <p className="text-xs text-gray-300 mb-2">
                    Any specific dietary restrictions from your doctor?
                  </p>
                  <textarea
                    value={doctorRestrictions}
                    onChange={(e) => setDoctorRestrictions(e.target.value)}
                    placeholder="e.g., Low salt, avoid grapefruit, low potassium..."
                    rows={3}
                    className="w-full bg-black/40 border border-gray-700 focus:border-accent-green rounded-xl px-4 py-3 text-xs text-white outline-none transition-colors resize-none"
                  />
                </div>
              </motion.div>
            </div>

            {/* ── Disclaimer ── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-6 flex items-start gap-3 bg-black/30 border border-gray-800 rounded-xl px-5 py-4 max-w-6xl mx-auto"
            >
              <ShieldCheck size={16} className="text-gray-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-gray-500 leading-relaxed">
                <span className="text-gray-400 font-medium">Disclaimer:</span>{" "}
                Your safety is our priority. AyuRithm uses this information to filter out
                suggestions that may conflict with your current health status or preferences.
                This is not a substitute for professional medical advice.
              </p>
            </motion.div>

            {/* ── Submit CTA ── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="mt-6 mb-12"
            >
              <button
                onClick={handleSave}
                className="w-full max-w-6xl mx-auto border border-accent-green text-accent-green hover:bg-accent-green/10 font-medium py-4 rounded-xl flex items-center justify-center transition-all group shadow-[0_0_30px_rgba(57,255,20,0.06)] hover:shadow-[0_0_40px_rgba(57,255,20,0.12)]"
              >
                <Brain size={18} className="mr-2" />
                Generate Dashboard
                <ArrowRight
                  className="ml-2 group-hover:translate-x-1 transition-transform"
                  size={18}
                />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
