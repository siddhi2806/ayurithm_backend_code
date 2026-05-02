"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Sun, Wind, CloudRain, Leaf, Snowflake, ArrowRight, LogOut, Trash2, Pencil, Search, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { LucideIcon } from "lucide-react";

interface RituInfo {
  name: string;
  desc: string;
  icon: LucideIcon;
  color: string;
}

// Indian Seasons (Ritu) Logic based on 2026-2027 Schedule
const getRitu = (date: Date): RituInfo => {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();

  if ((month === 2 && day >= 18) || month === 3 || (month === 4 && day <= 19)) {
    return { name: "Vasant Ritu", desc: "Spring — Kapha Liquefaction", icon: Leaf, color: "text-pastel-green" };
  } else if ((month === 4 && day >= 20) || month === 5 || (month === 6 && day <= 20)) {
    return { name: "Grishma Ritu", desc: "Summer — Vata Accumulation", icon: Sun, color: "text-yellow-400" };
  } else if ((month === 6 && day >= 21) || month === 7 || (month === 8 && day <= 22)) {
    return { name: "Varsha Ritu", desc: "Monsoon — Vata Aggravation", icon: CloudRain, color: "text-blue-400" };
  } else if ((month === 8 && day >= 23) || month === 9 || (month === 10 && day <= 22)) {
    return { name: "Sharad Ritu", desc: "Autumn — Pitta Aggravation", icon: Wind, color: "text-orange-400" };
  } else if ((month === 10 && day >= 23) || month === 11 || (month === 12 && day <= 21)) {
    return { name: "Hemant Ritu", desc: "Pre-winter — Pitta Pacification", icon: Snowflake, color: "text-gray-300" };
  } else {
    return { name: "Shishir Ritu", desc: "Winter — Kapha Accumulation", icon: Snowflake, color: "text-white" };
  }
};

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);

  const [rituData, setRituData] = useState<RituInfo | null>(null);
  const [locationStr, setLocationStr] = useState<string>("");
  const [savedLat, setSavedLat] = useState<number | null>(null);
  const [savedLng, setSavedLng] = useState<number | null>(null);

  // Manual location correction
  const [editingLocation, setEditingLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- SIGN OUT ---
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // --- DELETE ACCOUNT ---
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "This will permanently delete your account and all medical data. This action cannot be undone. Continue?"
    );
    if (!confirmed) return;

    setDeletingAccount(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const res = await fetch("/api/delete-account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to delete account");
      }

      await supabase.auth.signOut();
      router.push("/");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setDeletingAccount(false);
    }
  };

  const detectContext = async () => {
    setPermissionBlocked(false);
    setLoading(true);

    // 1. Calculate Ritu based on System Clock
    const today = new Date();
    const currentRitu = getRitu(today);
    setRituData(currentRitu);

    // Format system_date as YYYY-MM-DD for Supabase date column
    const systemDate = today.toISOString().split("T")[0];

    // 2. Check permission state first — if denied, browser won't prompt again
    if ("permissions" in navigator) {
      const perm = await navigator.permissions.query({ name: "geolocation" });
      if (perm.state === "denied") {
        setPermissionBlocked(true);
        setLoading(false);
        return;
      }
    }

    // 3. Grab Geolocation — enableHighAccuracy forces GPS/WiFi, not IP-based
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setSavedLat(lat);
          setSavedLng(lng);

          // Determine region tag from coordinates (Goa/Konkan detection)
          const regionTag = (lat >= 14.5 && lat <= 16.5 && lng >= 73.0 && lng <= 74.5)
            ? "KONKAN_ALL"
            : "GLOBAL_DEFAULT";

          // Reverse geocode using OpenStreetMap Nominatim (no API key required)
          let regionLabel = `Lat ${lat.toFixed(2)}, Lng ${lng.toFixed(2)}`;
          try {
            const geoRes = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
              { headers: { "Accept-Language": "en", "User-Agent": "AyuRithm/1.0" } }
            );
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              const addr = geoData.address ?? {};
              const city =
                addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? addr.suburb ?? "";
              const district =
                addr.county ?? addr.state_district ?? addr.district ?? "";
              const state = addr.state ?? "";
              const parts = [city, district, state].filter(Boolean);
              if (parts.length > 0) regionLabel = parts.join(", ");
            }
          } catch {
            // Nominatim unreachable — fall back to raw coords already set
          }
          setLocationStr(regionLabel);

          // 3. Save full context to Supabase profiles table
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from("profiles").upsert({
              id: user.id,
              first_name: user.user_metadata?.first_name ?? '',
              last_name: user.user_metadata?.last_name ?? '',
              email: user.email ?? '',
              location_tag: regionTag,
              location_lat: lat,
              location_lng: lng,
              system_date: systemDate,
              current_ritu: currentRitu.name,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
          }

          setLoading(false);
          setStep(2);
        },
        async (err) => {
          // code 1 = PERMISSION_DENIED
          if (err.code === 1) {
            setPermissionBlocked(true);
            setLoading(false);
            return;
          }
          // Fallback for other errors (timeout, position unavailable) — still save ritu & date
          setLocationStr("Region: Unknown (Global Default)");

          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase.from("profiles").upsert({
              id: user.id,
              first_name: user.user_metadata?.first_name ?? '',
              last_name: user.user_metadata?.last_name ?? '',
              email: user.email ?? '',
              location_tag: "GLOBAL_DEFAULT",
              system_date: systemDate,
              current_ritu: currentRitu.name,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
          }

          setLoading(false);
          setStep(2);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else {
      setLocationStr("Geolocation not supported");
      setLoading(false);
      setStep(2);
    }
  };

  // ── PLACE SEARCH (Nominatim forward geocode) ──────────────
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setSearchResults([]);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (val.trim().length < 3) return;
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&addressdetails=1&limit=5&countrycodes=in`,
          { headers: { "Accept-Language": "en", "User-Agent": "AyuRithm/1.0" } }
        );
        if (res.ok) setSearchResults(await res.json());
      } catch { /* ignore */ } finally {
        setSearchLoading(false);
      }
    }, 500);
  };

  const applyManualLocation = async (result: { display_name: string; lat: string; lon: string }) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setSavedLat(lat);
    setSavedLng(lng);

    // Build a clean label from the first 3 comma-separated parts
    const parts = result.display_name.split(",").slice(0, 3).map((s) => s.trim());
    const label = parts.join(", ");
    setLocationStr(label);
    setEditingLocation(false);
    setSearchQuery("");
    setSearchResults([]);

    const regionTag = (lat >= 14.5 && lat <= 16.5 && lng >= 73.0 && lng <= 74.5)
      ? "KONKAN_ALL"
      : "GLOBAL_DEFAULT";

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").upsert({
        id: user.id,
        first_name: user.user_metadata?.first_name ?? '',
        last_name: user.user_metadata?.last_name ?? '',
        email: user.email ?? '',
        location_tag: regionTag,
        location_lat: lat,
        location_lng: lng,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    }
  };

  const proceedToAssessment = () => {
    router.push("/assessment");
  };

  const RituIcon = rituData?.icon;

  return (
    <main className="min-h-screen bg-void-green flex items-center justify-center p-6 relative">
      {/* Top-right account actions */}
      <div className="absolute top-6 right-6 flex gap-3 z-20">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
        >
          <LogOut size={14} />
          Sign Out
        </button>
        <button
          onClick={handleDeleteAccount}
          disabled={deletingAccount}
          className="flex items-center gap-2 text-red-400 hover:text-red-300 text-sm border border-red-900 hover:border-red-700 rounded-lg px-3 py-2 transition-colors"
        >
          <Trash2 size={14} />
          {deletingAccount ? "Deleting..." : "Delete Account"}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="w-full max-w-lg glass-panel p-10 text-center"
          >
            <MapPin size={48} className="mx-auto text-accent-green mb-6" />
            <h2 className="text-3xl font-light text-white mb-4">Environmental Context</h2>
            <p className="text-gray-400 mb-8 text-sm leading-relaxed">
              Ayurveda relies on the interplay between your body, your location (Desha), and the
              current season (Ritu/Kala). AyuRithm needs to securely detect your environment to
              calibrate the safety engine.
            </p>

            <button
              onClick={detectContext}
              disabled={loading}
              className="w-full bg-accent-green text-void-green font-semibold py-4 rounded-xl flex items-center justify-center transition-all hover:opacity-90"
            >
              {loading ? (
                <span className="animate-pulse">Calibrating Sensors...</span>
              ) : (
                "Detect My Environment"
              )}
            </button>

            {/* Shown when the browser has a cached DENIED decision */}
            {permissionBlocked && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 bg-red-950/50 border border-red-700/50 rounded-xl p-4 text-left"
              >
                <p className="text-red-400 font-medium text-sm mb-2">
                  Location access is blocked
                </p>
                <p className="text-gray-400 text-xs leading-relaxed mb-3">
                  Your browser has a saved &quot;Blocked&quot; decision for this site. To fix this:
                </p>
                <ol className="text-gray-400 text-xs leading-relaxed space-y-1 list-decimal list-inside mb-3">
                  <li>Click the <span className="text-white">lock / info icon</span> in the address bar</li>
                  <li>Find <span className="text-white">Location</span> and set it to <span className="text-white">Allow</span></li>
                  <li>Reload the page and click the button again</li>
                </ol>
                <p className="text-gray-500 text-xs">
                  Chrome: address bar → 🔒 → Site settings → Location → Allow
                  <br />
                  Firefox: address bar → 🔒 → Connection secure → More info → Permissions
                </p>
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-full max-w-lg glass-panel p-10"
          >
            <h2 className="text-2xl font-light text-white mb-8 text-center">
              Context Established
            </h2>

            <div className="space-y-4 mb-10">
              {/* Ritu Card */}
              <div className="bg-black/30 border border-gray-700 rounded-xl p-5 flex items-center">
                <div className={`p-3 rounded-full bg-black/50 mr-4 ${rituData?.color}`}>
                  {RituIcon && <RituIcon size={24} />}
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                    Current Season
                  </p>
                  <p className="text-lg font-medium text-white">{rituData?.name}</p>
                  <p className="text-xs text-pastel-green">{rituData?.desc}</p>
                </div>
              </div>

              {/* Location Card */}
              <div className="bg-black/30 border border-gray-700 rounded-xl p-5">
                {!editingLocation ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="p-3 rounded-full bg-black/50 mr-4 text-accent-green shrink-0">
                        <MapPin size={24} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                          Detected Region
                        </p>
                        <p className="text-base font-medium text-white">{locationStr}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setEditingLocation(true)}
                      className="ml-4 flex items-center gap-1.5 text-xs text-gray-400 hover:text-accent-green border border-gray-700 hover:border-accent-green/50 rounded-lg px-3 py-2 transition-colors shrink-0"
                    >
                      <Pencil size={12} />
                      Fix
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-3">Search Your City</p>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                      <input
                        autoFocus
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="e.g. Panjim, Goa"
                        className="w-full bg-black/50 border border-gray-600 focus:border-accent-green rounded-lg pl-9 pr-4 py-2.5 text-white text-sm outline-none transition-colors"
                      />
                      {searchLoading && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 animate-pulse">Searching...</span>
                      )}
                    </div>
                    {searchResults.length > 0 && (
                      <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                        {searchResults.map((r, i) => (
                          <li key={i}>
                            <button
                              onClick={() => applyManualLocation(r)}
                              className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-lg bg-black/40 hover:bg-accent-green/10 border border-transparent hover:border-accent-green/30 transition-colors"
                            >
                              <CheckCircle2 size={13} className="text-accent-green shrink-0" />
                              <span className="text-xs text-gray-300 truncate">{r.display_name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      onClick={() => { setEditingLocation(false); setSearchQuery(""); setSearchResults([]); }}
                      className="mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={proceedToAssessment}
              className="w-full border border-accent-green text-accent-green hover:bg-accent-green/10 font-medium py-4 rounded-xl flex items-center justify-center transition-all group"
            >
              Begin Prakriti Assessment
              <ArrowRight
                className="ml-2 group-hover:translate-x-1 transition-transform"
                size={18}
              />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
