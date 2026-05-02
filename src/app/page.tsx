"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, Activity, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const [isLogin, setIsLogin] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        // --- SIGN IN ---
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/onboarding");
      } else {
        // --- SIGN UP ---
        // 1. Create the auth user with metadata
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { first_name: firstName, last_name: lastName },
          },
        });
        if (signUpError) throw signUpError;

        // Profile row is auto-created by the handle_new_user() DB trigger.
        alert("Account created! Check your email for the verification link.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-void-green flex items-center justify-center relative overflow-hidden">
      {/* Background Subtle Watermark */}
      <div className="absolute inset-0 opacity-5 flex items-center justify-center pointer-events-none">
        <Leaf size={800} className="text-pastel-green" />
      </div>

      <AnimatePresence mode="wait">
        {showSplash ? (
          /* --- SPLASH SCREEN --- */
          <motion.div
            key="splash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.8 }}
            className="flex flex-col items-center z-10"
          >
            <div className="relative w-32 h-32 flex items-center justify-center mb-6">
              <motion.div
                initial={{ opacity: 1, scale: 0.8 }}
                animate={{ opacity: [1, 0.5, 1], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute"
              >
                <Leaf size={80} className="text-pastel-green drop-shadow-[0_0_15px_rgba(167,243,208,0.5)]" />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.5, duration: 1, ease: "easeOut" }}
                className="absolute"
              >
                <Activity size={100} className="text-accent-green drop-shadow-[0_0_20px_rgba(57,255,20,0.6)]" />
              </motion.div>
            </div>

            <motion.h1
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="text-4xl md:text-6xl font-light text-white tracking-widest mb-2"
            >
              Ayu<span className="text-pastel-green font-semibold">Rithm</span>
            </motion.h1>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.8 }}
              className="text-accent-green tracking-[0.2em] text-sm md:text-base uppercase"
            >
              AI-Powered Clinical Safety
            </motion.p>
          </motion.div>
        ) : (
          /* --- AUTHENTICATION PANEL --- */
          <motion.div
            key="auth"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="z-10 w-full max-w-md p-8 glass-panel"
          >
            <div className="text-center mb-8">
              <h2 className="text-3xl font-light text-white mb-2">
                {isLogin ? "Welcome Back" : "Begin Your Journey"}
              </h2>
              <p className="text-gray-400 text-sm">
                Secure, logic-driven integrative healthcare.
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              {/* Name fields — only shown on Sign Up */}
              {!isLogin && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-pastel-green text-xs uppercase tracking-wider mb-2">
                      First Name
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required={!isLogin}
                      className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent-green transition-colors"
                      placeholder="Jane"
                    />
                  </div>
                  <div>
                    <label className="block text-pastel-green text-xs uppercase tracking-wider mb-2">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required={!isLogin}
                      className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent-green transition-colors"
                      placeholder="Doe"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-pastel-green text-xs uppercase tracking-wider mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent-green transition-colors"
                  placeholder="name@example.com"
                />
              </div>

              <div>
                <label className="block text-pastel-green text-xs uppercase tracking-wider mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent-green transition-colors"
                  placeholder="••••••••"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent-green/20 hover:bg-accent-green/30 border border-accent-green/50 text-accent-green font-medium py-3 rounded-lg flex items-center justify-center transition-all group"
              >
                {loading ? "Processing..." : isLogin ? "Sign In" : "Create Account"}
                {!loading && (
                  <ChevronRight className="ml-2 group-hover:translate-x-1 transition-transform" size={18} />
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                }}
                className="text-gray-400 hover:text-white text-sm transition-colors"
              >
                {isLogin
                  ? "New to AyuRithm? Create an account"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
