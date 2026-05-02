"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  TreePine,
  Zap,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Leaf,
  Sun,
  CloudRain,
  Wind,
  Snowflake,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { insertAssessment } from "@/lib/queries";

// ─── QUESTION DATA ──────────────────────────────────────────
interface Question {
  id: number;
  category: string;
  question: string;
  options: [string, string, string]; // [Vata(0), Pitta(1), Kapha(2)]
}

const QUESTIONS: Question[] = [
  { id: 1, category: "Body", question: "What best describes your body build?", options: ["Thin / Lean", "Smooth / Medium", "Soft / Large"] },
  { id: 2, category: "Body", question: "How would you describe your height?", options: ["Short", "Medium", "Tall"] },
  { id: 3, category: "Body", question: "What is your skin type?", options: ["Dry / Rough", "Warm / Oily", "Moist / Smooth"] },
  { id: 4, category: "Body", question: "What is your hair type?", options: ["Dry / Frizzy", "Fine / Straight", "Oily / Wavy"] },
  { id: 5, category: "Body", question: "How would you describe your eyes?", options: ["Small / Dry", "Medium / Sharp", "Large / Calm"] },
  { id: 6, category: "Digestion", question: "How is your appetite?", options: ["Irregular / Low", "Frequent / High", "Regular / Moderate"] },
  { id: 7, category: "Digestion", question: "How is your digestion?", options: ["Irregular / Gas", "Quick / Acidic", "Slow / Heavy"] },
  { id: 8, category: "Mind", question: "How is your sleep pattern?", options: ["Light / Restless", "Moderate / Sound", "Deep / Heavy"] },
  { id: 9, category: "Mind", question: "What is your mental nature?", options: ["Anxious / Restless", "Focused / Analytical", "Calm / Steady"] },
  { id: 10, category: "Mind", question: "How would you describe your activity level?", options: ["High / Restless", "Goal-oriented", "Lethargic / Slow"] },
  { id: 11, category: "Environment", question: "What climate do you dislike most?", options: ["Cold / Wind", "Heat / Summer", "Damp / Winter"] },
  { id: 12, category: "Behavior", question: "How is your speech?", options: ["Fast / Scattered", "Sharp / Precise", "Slow / Soft"] },
  { id: 13, category: "Behavior", question: "How would you describe your memory?", options: ["Quick to learn, quick to forget", "Sharp / Accurate", "Slow to learn, long-term retention"] },
  { id: 14, category: "Behavior", question: "How do you typically respond to stress?", options: ["Anxiety / Fear", "Anger / Frustration", "Withdrawal / Depression"] },
  { id: 15, category: "Behavior", question: "What physical issues do you experience most?", options: ["Cracking joints / Dryness", "Inflammation / Acidity", "Congestion / Mucus"] },
];

const CATEGORY_ICONS: Record<string, typeof Brain> = {
  Body: Activity,
  Digestion: Zap,
  Mind: Brain,
  Environment: Sun,
  Behavior: TreePine,
};

// ─── PROCESSING MESSAGES ────────────────────────────────────
const PROCESSING_STEPS = [
  "Initializing Random Forest Ensemble (n_estimators=100)...",
  "Encoding 15 Clinical Features into feature vector...",
  "Traversing 100 Decision Trees in parallel...",
  "Calculating Feature Importance via Gini Impurity...",
  "Running predict_proba() across Dosha classes...",
  "Deriving Dominant & Suppressed Prakriti...",
  "Cross-referencing with current Ritu (Season)...",
  "Generating your Ayurvedic Profile...",
];

// ─── RITU WISDOM ENGINE ─────────────────────────────────────
interface RituEffect {
  icon: typeof Leaf;
  effect: string;
}

function getRituEffect(
  dominant: string,
  suppressed: string,
  ritu: string
): RituEffect {
  const rituLower = ritu.toLowerCase();

  if (rituLower.includes("vasant")) {
    // Spring — Kapha liquefies
    if (suppressed === "Kapha") {
      return {
        icon: Leaf,
        effect: `Spring liquefies Kapha. Since Kapha is your suppressed dosha, you are currently well-balanced, but your ${dominant} needs grounding.`,
      };
    }
    if (dominant === "Kapha") {
      return {
        icon: Leaf,
        effect: "Spring liquefies your dominant Kapha. This season aggravates your primary dosha — be cautious.",
      };
    }
    return {
      icon: Leaf,
      effect: `Spring (Vasant) is a transitional season. Your ${dominant} dosha remains stable, but watch for Kapha-related sluggishness.`,

    };
  }

  if (rituLower.includes("grishma")) {
    // Summer — Pitta aggravates
    if (dominant === "Pitta" || dominant === "Pitta") {
      return {
        icon: Sun,
        effect: "Summer heat directly aggravates your dominant Pitta. Cooling regimens are strictly recommended.",
      };
    }
    return {
      icon: Sun,
      effect: `Summer accumulates Vata and aggravates Pitta. Your ${dominant} constitution should favor cooling foods.`,

    };
  }

  if (rituLower.includes("varsha")) {
    // Monsoon — Vata aggravates
    if (dominant === "Vata") {
      return {
        icon: CloudRain,
        effect: "Monsoon severely aggravates your dominant Vata. Grounding and warming protocols are critical.",
      };
    }
    return {
      icon: CloudRain,
      effect: `Monsoon aggravates Vata and can destabilize digestion. Your ${dominant} dosha is relatively stable but watch for digestive issues.`,

    };
  }

  if (rituLower.includes("sharad")) {
    // Autumn — Pitta aggravates
    if (dominant === "Pitta") {
      return {
        icon: Wind,
        effect: "Autumn carries accumulated Pitta from summer into full aggravation. This is your most vulnerable season.",
      };
    }
    return {
      icon: Wind,
      effect: `Autumn (Sharad) aggravates Pitta. Your ${dominant}-dominant constitution should still favor cooling, sweet foods.`,

    };
  }

  if (rituLower.includes("hemant")) {
    // Pre-winter — Pitta pacifies, Kapha may accumulate
    return {
      icon: Snowflake,
      effect: `Pre-winter pacifies Pitta and strengthens digestion. Your ${dominant} constitution benefits from nourishing, heavier foods.`,

    };
  }

  // Shishir — Winter — Kapha accumulates
  return {
    icon: Snowflake,
    effect: `Winter accumulates Kapha. ${dominant === "Kapha" ? "Your dominant Kapha is most at risk — stay active and eat light." : `Your ${dominant} constitution should favor warm, lightly spiced meals.`}`,
  };
}

// ─── DOSHA COLORS ───────────────────────────────────────────
const DOSHA_COLORS: Record<string, string> = {
  Vata: "text-blue-400",
  Pitta: "text-orange-400",
  Kapha: "text-emerald-400",
};

const DOSHA_BG: Record<string, string> = {
  Vata: "from-blue-900/30 to-blue-950/10",
  Pitta: "from-orange-900/30 to-orange-950/10",
  Kapha: "from-emerald-900/30 to-emerald-950/10",
};

// ─── FALLING LEAVES BACKGROUND ─────────────────────────────
// startOffset (0–1): where in the fall cycle each leaf begins at page load.
// A negative CSS animation-delay of -(startOffset * dur) pre-seeds every
// leaf at a different vertical position so the screen is never empty.
const LEAF_CONFIGS = [
  { size: 18, x: 8,  startOffset: 0.00, dur: 12, sway: 28,  rot: 20,  opacity: 0.20 },
  { size: 12, x: 20, startOffset: 0.15, dur: 15, sway: -22, rot: -35, opacity: 0.15 },
  { size: 22, x: 35, startOffset: 0.33, dur: 11, sway: 32,  rot: 50,  opacity: 0.22 },
  { size: 10, x: 50, startOffset: 0.50, dur: 14, sway: -18, rot: -25, opacity: 0.12 },
  { size: 16, x: 62, startOffset: 0.65, dur: 13, sway: 24,  rot: 40,  opacity: 0.18 },
  { size: 20, x: 75, startOffset: 0.80, dur: 10, sway: -30, rot: -15, opacity: 0.20 },
  { size: 14, x: 88, startOffset: 0.92, dur: 16, sway: 20,  rot: 60,  opacity: 0.14 },
  { size: 9,  x: 15, startOffset: 0.25, dur: 13, sway: 26,  rot: -45, opacity: 0.10 },
  { size: 17, x: 45, startOffset: 0.45, dur: 12, sway: -24, rot: 30,  opacity: 0.17 },
  { size: 11, x: 70, startOffset: 0.70, dur: 15, sway: 22,  rot: -60, opacity: 0.13 },
  { size: 24, x: 92, startOffset: 0.08, dur: 11, sway: -28, rot: 10,  opacity: 0.16 },
  { size: 13, x: 55, startOffset: 0.58, dur: 14, sway: 18,  rot: -30, opacity: 0.12 },
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
          0%, 100% { transform: translateX(0px)  rotate(0deg); }
          25%      { transform: translateX(var(--sway)) rotate(55deg); }
          50%      { transform: translateX(0px)  rotate(110deg); }
          75%      { transform: translateX(calc(var(--sway) * -0.6)) rotate(165deg); }
        }
      `}</style>
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {LEAF_CONFIGS.map((leaf, i) => {
          const dropDelay  = -(leaf.startOffset * leaf.dur);
          const driftDur   = leaf.dur * 0.75;
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
                <svg
                  width={leaf.size}
                  height={leaf.size}
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{
                    display: "block",
                    filter: `drop-shadow(0 0 ${Math.round(leaf.size * 0.4)}px rgba(57,255,20,0.55))`,
                  }}
                >
                  <path
                    d="M12 2C6 2 2 8 2 14c0 4 2.5 7 6 8 0-4 2-8 4-10-2 3-3 7-3 10h2c0-3 1-7 3-9-1 3-2 6-2 9h2c0-4 1-7 3-9 0 4-1 7-1 9h2c0-3-.5-7 0-10 2-3 4-6 4-8C22 6 18 2 12 2z"
                    fill="rgba(57,255,20,0.6)"
                  />
                  {/* Center vein */}
                  <path
                    d="M12 4c0 0 0 8 0 16"
                    stroke="rgba(167,243,208,0.4)"
                    strokeWidth="0.8"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────
export default function Assessment() {
  const router = useRouter();
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(15).fill(null)
  );
  const [currentQ, setCurrentQ] = useState(0);
  const [direction, setDirection] = useState(1); // 1=forward, -1=backward

  // Processing state
  const [phase, setPhase] = useState<"questions" | "processing" | "results">(
    "questions"
  );
  const [processingStep, setProcessingStep] = useState(0);

  // Result state
  const [result, setResult] = useState<{
    dominant: string;
    secondary: string;
    suppressed: string;
    dual_dosha: string;
    scores: Record<string, number>;
    feature_importances: number[];
  } | null>(null);
  const [rituEffect, setRituEffect] = useState<RituEffect | null>(null);
  const [currentRitu, setCurrentRitu] = useState("");

  // ─── ANSWER HANDLER ───────────────────────────────────────
  const selectOption = (value: number) => {
    const updated = [...answers];
    updated[currentQ] = value;
    setAnswers(updated);

    // Auto-advance after a short delay
    setTimeout(() => {
      if (currentQ < 14) {
        setDirection(1);
        setCurrentQ((prev) => prev + 1);
      } else {
        // All 15 answered → send to ML backend
        submitToBackend(updated as number[]);
      }
    }, 350);
  };

  const goBack = () => {
    if (currentQ > 0) {
      setDirection(-1);
      setCurrentQ((prev) => prev - 1);
    }
  };

  // ─── ML BACKEND CALL ─────────────────────────────────────
  const submitToBackend = useCallback(async (finalAnswers: number[]) => {
    setPhase("processing");

    try {
      // Call the Python FastAPI backend
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_ML_BACKEND_URL || "http://localhost:8000"}/predict`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: finalAnswers }),
        }
      );

      if (!res.ok) throw new Error("ML backend returned an error");
      const data = await res.json();
      setResult(data);

      // Fetch the user's current_ritu from Supabase profile
      const { data: { user } } = await supabase.auth.getUser();
      let ritu = "Vasant Ritu"; // fallback
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("current_ritu, location_tag, location_lat, location_lng")
          .eq("id", user.id)
          .single();

        if (profile?.current_ritu) ritu = profile.current_ritu;

        // Save assessment to Supabase
        await insertAssessment({
          assessment_answers: finalAnswers,
          dominant_prakriti: data.dominant,
          suppressed_prakriti: data.suppressed,
          prakriti_scores: data.scores,
          location_tag: profile?.location_tag ?? null,
          location_lat: profile?.location_lat ?? null,
          location_lng: profile?.location_lng ?? null,
          system_date: new Date().toISOString().split("T")[0],
          current_ritu: ritu,
        });

        // Update profile with prakriti
        await supabase
          .from("profiles")
          .update({
            base_prakriti: {
              dominant: data.dominant,
              secondary: data.secondary,
              suppressed: data.suppressed,
              dual_dosha: data.dual_dosha,
              scores: data.scores,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      }

      setCurrentRitu(ritu);
      setRituEffect(getRituEffect(data.dominant, data.suppressed, ritu));
    } catch {
      // If backend is unreachable, show an error in results
      setResult(null);
      setCurrentRitu("");
      setRituEffect(null);
    }
  }, []);

  // ─── PROCESSING ANIMATION ─────────────────────────────────
  useEffect(() => {
    if (phase !== "processing") return;

    const interval = setInterval(() => {
      setProcessingStep((prev) => {
        if (prev >= PROCESSING_STEPS.length - 1) {
          clearInterval(interval);
          // Transition to results after the last step
          setTimeout(() => setPhase("results"), 800);
          return prev;
        }
        return prev + 1;
      });
    }, 900);

    return () => clearInterval(interval);
  }, [phase]);

  // ─── PROGRESS ─────────────────────────────────────────────
  const answered = answers.filter((a) => a !== null).length;
  const progress = (answered / 15) * 100;

  const question = QUESTIONS[currentQ];
  const CategoryIcon = CATEGORY_ICONS[question.category] || Brain;

  // ─── SLIDE VARIANTS ───────────────────────────────────────
  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <main className="min-h-screen bg-void-green flex items-center justify-center p-4 relative overflow-hidden">
      <FallingLeaves />

      {/* ── Prakriti Mandala Background ── */}
      <style>{`
        @keyframes mandalaFloat {
          0%, 100% { transform: translate(-50%, -50%) scale(1)    translateY(0px);   }
          33%       { transform: translate(-50%, -50%) scale(1.04) translateY(-22px); }
          66%       { transform: translate(-50%, -50%) scale(0.97) translateY(14px);  }
        }
        @keyframes mandalaGlow {
          0%, 100% {
            filter: blur(0px) brightness(2.0) saturate(3) opacity(0.38)
                    drop-shadow(0 0 60px rgba(57,255,20,0.35))
                    drop-shadow(0 0 120px rgba(57,255,20,0.18));
          }
          50% {
            filter: blur(0px) brightness(2.4) saturate(3.8) opacity(0.52)
                    drop-shadow(0 0 90px rgba(57,255,20,0.55))
                    drop-shadow(0 0 180px rgba(57,255,20,0.28));
          }
        }
        .mandala-bg {
          position: fixed;
          top: 50%;
          left: 50%;
          width: 100vw;
          height: 100vh;
          object-fit: cover;
          transform: translate(-50%, -50%);
          pointer-events: none;
          mix-blend-mode: screen;
          animation:
            mandalaFloat 14s ease-in-out infinite,
            mandalaGlow   7s ease-in-out infinite;
          z-index: 0;
        }
      `}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/prakriti_bg.png"
        alt=""
        aria-hidden="true"
        className="mandala-bg"
      />

      <AnimatePresence mode="wait">
        {/* ═══════ QUESTION PHASE ═══════ */}
        {phase === "questions" && (
          <motion.div
            key="question-phase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-xl z-10"
          >
            {/* Progress Bar */}
            <div className="mb-8">
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>
                  Question {currentQ + 1} of 15
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-black/40 rounded-full overflow-hidden border border-gray-800">
                <motion.div
                  className="h-full bg-gradient-to-r from-accent-green/60 to-accent-green rounded-full"
                  initial={false}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              {/* Category dots */}
              <div className="flex gap-1.5 mt-3 justify-center">
                {QUESTIONS.map((q, i) => (
                  <div
                    key={q.id}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i === currentQ
                        ? "bg-accent-green scale-125"
                        : answers[i] !== null
                        ? "bg-accent-green/50"
                        : "bg-gray-700"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Question Card */}
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentQ}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="glass-panel p-8"
              >
                {/* Category Badge */}
                <div className="flex items-center gap-2 mb-6">
                  <div className="p-2 rounded-lg bg-accent-green/10 text-accent-green">
                    <CategoryIcon size={18} />
                  </div>
                  <span className="text-xs text-gray-400 uppercase tracking-widest">
                    {question.category}
                  </span>
                </div>

                {/* Question Text */}
                <h2 className="text-xl md:text-2xl font-light text-white mb-8 leading-relaxed">
                  {question.question}
                </h2>

                {/* Options */}
                <div className="space-y-3">
                  {question.options.map((option, idx) => {
                    const isSelected = answers[currentQ] === idx;
                    return (
                      <motion.button
                        key={idx}
                        onClick={() => selectOption(idx)}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        className={`w-full text-left px-5 py-4 rounded-xl border transition-all ${
                          isSelected
                            ? "bg-accent-green/15 border-accent-green/50 text-accent-green"
                            : "bg-black/30 border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                              isSelected
                                ? "border-accent-green bg-accent-green/20"
                                : "border-gray-600"
                            }`}
                          >
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-2.5 h-2.5 rounded-full bg-accent-green"
                              />
                            )}
                          </div>
                          <span className="text-sm md:text-base">{option}</span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Navigation */}
                <div className="flex justify-between mt-8">
                  <button
                    onClick={goBack}
                    disabled={currentQ === 0}
                    className="flex items-center gap-2 text-gray-400 hover:text-white text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>
                  {answers[currentQ] !== null && currentQ < 14 && (
                    <button
                      onClick={() => {
                        setDirection(1);
                        setCurrentQ((prev) => prev + 1);
                      }}
                      className="flex items-center gap-2 text-accent-green text-sm hover:gap-3 transition-all"
                    >
                      Next
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}

        {/* ═══════ PROCESSING PHASE ═══════ */}
        {phase === "processing" && (
          <motion.div
            key="processing-phase"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-lg glass-panel p-10 z-10"
          >
            {/* Animated brain icon */}
            <div className="flex justify-center mb-8">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="p-4 rounded-full bg-accent-green/10 border border-accent-green/20"
              >
                <Brain size={40} className="text-accent-green" />
              </motion.div>
            </div>

            <h2 className="text-xl font-light text-white text-center mb-2">
              Analyzing Your Constitution
            </h2>
            <p className="text-gray-500 text-center text-xs mb-8">
              Random Forest Ensemble • 100 Decision Trees
            </p>

            {/* Processing steps */}
            <div className="space-y-3 font-mono text-xs">
              {PROCESSING_STEPS.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{
                    opacity: i <= processingStep ? 1 : 0.2,
                    x: i <= processingStep ? 0 : -20,
                  }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-3"
                >
                  {i < processingStep ? (
                    <CheckCircle2
                      size={14}
                      className="text-accent-green shrink-0"
                    />
                  ) : i === processingStep ? (
                    <motion.div
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="w-3.5 h-3.5 rounded-full bg-accent-green shrink-0"
                    />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full bg-gray-700 shrink-0" />
                  )}
                  <span
                    className={
                      i <= processingStep ? "text-gray-300" : "text-gray-600"
                    }
                  >
                    {step}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Progress bar for processing */}
            <div className="mt-8 h-1.5 bg-black/40 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-accent-green rounded-full"
                initial={{ width: "0%" }}
                animate={{
                  width: `${((processingStep + 1) / PROCESSING_STEPS.length) * 100}%`,
                }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </motion.div>
        )}

        {/* ═══════ RESULTS PHASE ═══════ */}
        {phase === "results" && (
          <motion.div
            key="results-phase"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="w-full max-w-2xl z-10 space-y-6"
          >
            {result ? (
              <>
                {/* Dual-Dosha Identity Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className={`glass-panel p-8 bg-gradient-to-br ${DOSHA_BG[result.dominant]}`}
                >
                  <div className="text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-[0.3em] mb-3">
                      Your Ayurvedic Constitution
                    </p>
                    <h1
                      className={`text-4xl md:text-5xl font-light mb-2 ${DOSHA_COLORS[result.dominant]}`}
                    >
                      {result.dual_dosha}
                    </h1>
                    <p className="text-gray-400 text-sm">
                      Dominant:{" "}
                      <span className={DOSHA_COLORS[result.dominant]}>
                        {result.dominant}
                      </span>{" "}
                      • Suppressed:{" "}
                      <span className={DOSHA_COLORS[result.secondary]}>
                        {result.secondary}
                      </span>
                    </p>
                  </div>
                </motion.div>

                {/* Probability Scores */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="glass-panel p-6"
                >
                  <h3 className="text-sm text-gray-400 uppercase tracking-wider mb-5">
                    predict_proba() Output
                  </h3>
                  <div className="space-y-4">
                    {(["Vata", "Pitta", "Kapha"] as const).map((dosha) => {
                      const score = result.scores[dosha] ?? 0;
                      const pct = Math.round(score * 100);
                      return (
                        <div key={dosha}>
                          <div className="flex justify-between text-sm mb-1.5">
                            <span className={DOSHA_COLORS[dosha]}>{dosha}</span>
                            <span className="text-gray-300 font-mono">
                              {pct}%
                            </span>
                          </div>
                          <div className="h-3 bg-black/40 rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${
                                dosha === "Vata"
                                  ? "bg-blue-500"
                                  : dosha === "Pitta"
                                  ? "bg-orange-500"
                                  : "bg-emerald-500"
                              }`}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{
                                duration: 1.2,
                                delay: 0.6,
                                ease: "easeOut",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Ritu Cross-Reference Card */}
                {rituEffect && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="glass-panel p-6 border-l-4 border-l-accent-green"
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-full bg-black/50 text-pastel-green shrink-0">
                        <rituEffect.icon size={24} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-sm font-medium text-white">
                            Seasonal Analysis
                          </h3>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent-green/10 text-accent-green border border-accent-green/20">
                            {currentRitu}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed mb-3">
                          {rituEffect.effect}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Proceed to Health & Diet Profile */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                >
                  <button
                    onClick={() => router.push("/medical-profile")}
                    className="w-full border border-accent-green text-accent-green hover:bg-accent-green/10 font-medium py-4 rounded-xl flex items-center justify-center transition-all group"
                  >
                    Give your Health &amp; Diet Information
                    <ArrowRight
                      className="ml-2 group-hover:translate-x-1 transition-transform"
                      size={18}
                    />
                  </button>
                </motion.div>
              </>
            ) : (
              /* Error state — backend unreachable */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-panel p-10 text-center"
              >
                <AlertTriangle
                  size={48}
                  className="mx-auto text-red-400 mb-4"
                />
                <h2 className="text-xl text-white mb-2">
                  ML Backend Unreachable
                </h2>
                <p className="text-gray-400 text-sm mb-6">
                  Could not connect to the Prakriti prediction engine at{" "}
                  <code className="text-accent-green text-xs">
                    {process.env.NEXT_PUBLIC_ML_BACKEND_URL ||
                      "http://localhost:8000"}
                  </code>
                  . Ensure the Python backend is running.
                </p>
                <div className="bg-black/40 rounded-lg p-4 text-left font-mono text-xs text-gray-400 mb-6">
                  <p>cd backend</p>
                  <p>pip install -r requirements.txt</p>
                  <p>uvicorn prakriti_model:app --reload</p>
                </div>
                <button
                  onClick={() => {
                    setPhase("questions");
                    setProcessingStep(0);
                    setCurrentQ(14);
                  }}
                  className="text-accent-green text-sm hover:underline"
                >
                  Retry Assessment
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
