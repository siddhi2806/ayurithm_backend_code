"""
AyuRithm — GNN-based Food Safety Recommendation Engine
========================================================
Uses NetworkX to construct a heterogeneous knowledge graph of
User ↔ Food ↔ Disease ↔ Drug nodes, then performs weighted
message-passing to score every food item for a given user profile.

Run alongside prakriti_model.py:
  python -m uvicorn prakriti_model:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

import networkx as nx
from pydantic import BaseModel

# ═══════════════════════════════════════════════════════════════
# 1. DATA LOADING
# ═══════════════════════════════════════════════════════════════

BASE_DIR = Path(__file__).resolve().parent.parent  # ayurithm/

def _load_json(filename: str) -> list[dict]:
    path = BASE_DIR / filename
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def _dedup_by_node_id(items: list[dict]) -> list[dict]:
    """Remove duplicate entries sharing the same node_id, keeping the first occurrence."""
    seen: set[str] = set()
    out: list[dict] = []
    for item in items:
        nid = item.get("node_id", "")
        if nid not in seen:
            seen.add(nid)
            out.append(item)
    return out

FOOD_DB: list[dict] = _dedup_by_node_id(_load_json("goan_food.json"))
MEDICINE_DB: list[dict] = _load_json("medicines.json")

# ═══════════════════════════════════════════════════════════════
# 2. CATEGORY NORMALISATION
# ═══════════════════════════════════════════════════════════════

def normalise_categories(raw: str) -> list[str]:
    """Map a raw food category string to one or more UI meal buckets.

    Every keyword that appears in the raw category contributes its bucket,
    so e.g. 'Street food/Breakfast/Snack' → ['Snacks', 'Breakfast']
    and 'Snack/Breakfast/Meat' → ['Snacks', 'Breakfast'].
    """
    low = raw.lower().strip()
    buckets: list[str] = []

    if "dessert" in low or "sweet" in low or "candy" in low:
        buckets.append("Sweets & Desserts")
    if "condiment" in low or "spice" in low or "pickle" in low:
        buckets.append("Condiments")
    if ("snack" in low or "appetizer" in low
            or "street food" in low or "fast food" in low):
        buckets.append("Snacks")
    if "breakfast" in low:
        buckets.append("Breakfast")
    if "lunch" in low or "dinner" in low:
        buckets.append("Lunch & Dinner")

    return buckets if buckets else ["Lunch & Dinner"]

# ═══════════════════════════════════════════════════════════════
# 3. RITU NAME MAPPING
# ═══════════════════════════════════════════════════════════════

RITU_KEY_MAP: dict[str, str] = {
    "Vasant Ritu": "vasant",
    "Grishma Ritu": "grishma",
    "Varsha Ritu": "varsha",
    "Sharad Ritu": "sharad",
    "Hemant Ritu": "hemant",
    "Shishir Ritu": "shishir",
}

# ═══════════════════════════════════════════════════════════════
# 4. DIETARY FILTER HELPERS
# ═══════════════════════════════════════════════════════════════

def _diet_blocks_food(diet_pref: str | None, food: dict) -> bool:
    """Hard-filter: return True if the user's dietary preference blocks this food."""
    if not diet_pref:
        return False
    tags = food.get("metadata", {}).get("dietary_tags", {})
    pref = diet_pref.lower()
    if pref == "vegan":
        return not tags.get("is_vegan", False)
    if pref in ("vegetarian", "lacto-vegetarian", "lacto-ovo-vegetarian"):
        return not tags.get("is_veg", True)
    # non-vegetarian — no hard block on any food
    return False

def _allergen_blocks_food(user_allergies: list[str], food: dict) -> bool:
    """Hard-filter: return True if any user allergy overlaps food allergens."""
    if not user_allergies:
        return False
    food_allergens = food.get("metadata", {}).get("dietary_tags", {}).get("contains_allergens", [])
    if not food_allergens:
        return False
    # Normalise for comparison (case-insensitive, strip whitespace)
    user_set = {a.lower().strip() for a in user_allergies}
    for fa in food_allergens:
        fa_lower = fa.lower().strip()
        for ua in user_set:
            # Partial matching: "dairy / milk" matches "dairy" or "milk"
            if ua in fa_lower or fa_lower in ua:
                return True
    return False

# ═══════════════════════════════════════════════════════════════
# 5. MEDICINE MATCHING
# ═══════════════════════════════════════════════════════════════

def _match_user_meds(user_meds: list[str]) -> list[dict]:
    """Return all medicine DB entries that match any user medication (fuzzy)."""
    if not user_meds:
        return []
    matched: list[dict] = []
    user_tokens = set()
    for m in user_meds:
        for token in re.split(r"[\s,/]+", m.strip().lower()):
            if len(token) >= 3:
                user_tokens.add(token)

    for med in MEDICINE_DB:
        idents = med.get("identifiers", {})
        names = [n.lower() for n in idents.get("generic_names", [])]
        brands = [b.lower() for b in idents.get("brand_names", [])]
        all_names = names + brands
        for name in all_names:
            for token in user_tokens:
                if token in name or name in token:
                    matched.append(med)
                    break
            else:
                continue
            break
    return matched

# ═══════════════════════════════════════════════════════════════
# 6. DISEASE MAPPING
# ═══════════════════════════════════════════════════════════════

DISEASE_MAP: dict[str, list[str]] = {
    "high blood pressure":           ["Hypertension"],
    "high cholesterol / dyslipidemia": ["Dyslipidemia", "Hypercholesterolemia"],
    "heart disease":                 ["Cardiovascular Disease", "Heart Disease"],
    "stroke":                        ["Stroke", "Cerebrovascular"],
    "diabetes (type 1)":             ["Diabetes Mellitus", "Insulin Resistance", "Diabetes"],
    "diabetes (type 2)":             ["Diabetes Mellitus", "Insulin Resistance", "Diabetes"],
    "thyroid imbalance":             ["Thyroid", "Hypothyroidism", "Hyperthyroidism"],
    "pcod / pcos":                   ["PCOS", "PCOD"],
    "obesity":                       ["Obesity"],
    "acid reflux / gerd":            ["Hyperacidity", "Acid Reflux", "Gastritis", "GERD"],
    "ibs":                           ["IBS", "Irritable Bowel"],
    "ibd":                           ["IBD", "Inflammatory Bowel", "Crohn"],
    "nafld":                         ["NAFLD", "Fatty Liver"],
    "chronic constipation":          ["Constipation"],
    "arthritis":                     ["Arthritis"],
    "gout / high uric acid":        ["Gout", "Hyperuricemia", "Uric Acid"],
    "osteoporosis":                  ["Osteoporosis"],
}

def _user_disease_tags(health_conditions: list[str]) -> set[str]:
    """Expand user health conditions to all matchable disease tags."""
    tags: set[str] = set()
    for cond in health_conditions:
        key = cond.lower().strip()
        if key in DISEASE_MAP:
            tags.update(t.lower() for t in DISEASE_MAP[key])
        else:
            tags.add(key)
    return tags

# ═══════════════════════════════════════════════════════════════
# 7. GRAPH CONSTRUCTION & GNN SCORING
# ═══════════════════════════════════════════════════════════════

# Weights as specified
W_SAFETY  = -3.0   # Level 1: drug-food pharmacological conflict
W_DISEASE = -2.0   # Level 2: disease aggravation
W_WELLNESS = +1.5  # Level 3: Ayurvedic dosha pacification
W_RITU    = +0.5   # Level 4: seasonal alignment

DOSHA_LOWER = {"vata": "Vata", "pitta": "Pitta", "kapha": "Kapha"}


class FoodResult(BaseModel):
    node_id: str
    food_name: str
    local_name: str
    image_url: str
    category: str
    is_veg: bool
    is_vegan: bool
    status: str          # "Consume" | "Moderate" | "Avoid"
    score: float
    reasoning_stack: list[dict[str, Any]]


class GNNRecommendationRequest(BaseModel):
    dominant_dosha: str
    secondary_dosha: str
    suppressed_dosha: str
    current_ritu: str
    dietary_preference: str | None = None
    allergies: list[str] = []
    health_conditions: list[str] = []
    medications: list[str] = []
    doctor_restrictions: str | None = None


class GNNRecommendationResponse(BaseModel):
    total_foods: int
    filtered_out: int
    results: dict[str, list[FoodResult]]   # category → foods
    graph_stats: dict[str, int]


def run_gnn_scoring(req: GNNRecommendationRequest) -> GNNRecommendationResponse:
    """
    Core GNN pipeline:
      1. Build heterogeneous knowledge graph (NetworkX)
      2. Hard-filter allergens & dietary preference
      3. Message-passing: compute Safety Score S per food
      4. Classify into Consume / Moderate / Avoid
      5. Return categorised results
    """

    # ── Step 0: Prepare user context ──
    dominant_lower = req.dominant_dosha.lower()
    suppressed_lower = req.suppressed_dosha.lower()
    ritu_key = RITU_KEY_MAP.get(req.current_ritu, "")
    user_disease_tags = _user_disease_tags(req.health_conditions)
    matched_meds = _match_user_meds(req.medications)

    # Build a lookup: biochemical → list of (interaction_effect, weight)
    drug_conflict_map: dict[str, list[tuple[str, float, str]]] = {}
    disease_aggravate_map: dict[str, list[tuple[str, float, str]]] = {}

    for med in matched_meds:
        rules = med.get("gnn_conflict_rules", {})
        drug_name = med.get("identifiers", {}).get("generic_names", ["Unknown"])[0]

        for interaction in rules.get("severe_drug_food_interactions", []):
            bio = interaction["interacting_biochemical"].lower()
            drug_conflict_map.setdefault(bio, []).append((
                interaction["interaction_effect"],
                interaction.get("weight_penalty", W_SAFETY),
                drug_name,
            ))

        for profile in rules.get("disease_aggravating_profiles", []):
            macro = profile["interacting_macronutrient"].lower()
            disease_aggravate_map.setdefault(macro, []).append((
                profile["interaction_effect"],
                profile.get("weight_penalty", W_DISEASE),
                drug_name,
            ))

    # ── Step 1: Build the Knowledge Graph ──
    G = nx.DiGraph()

    # User node
    G.add_node("USER", type="user",
               dominant=req.dominant_dosha,
               secondary=req.secondary_dosha,
               suppressed=req.suppressed_dosha,
               ritu=req.current_ritu)

    # Disease nodes
    for tag in user_disease_tags:
        node_id = f"DISEASE_{tag.upper().replace(' ', '_')}"
        G.add_node(node_id, type="disease", label=tag)
        G.add_edge("USER", node_id, relation="has_condition")

    # Drug nodes
    for med in matched_meds:
        mid = med["node_id"]
        G.add_node(mid, type="drug",
                   label=med["identifiers"]["generic_names"][0])
        G.add_edge("USER", mid, relation="takes_medication")

    # Food nodes (pre-filter)
    filtered_count = 0
    surviving_foods: list[dict] = []

    for food in FOOD_DB:
        fid = food["node_id"]

        # Hard filter: dietary preference
        if _diet_blocks_food(req.dietary_preference, food):
            filtered_count += 1
            continue

        # Hard filter: allergens
        if _allergen_blocks_food(req.allergies, food):
            filtered_count += 1
            continue

        surviving_foods.append(food)

        G.add_node(fid, type="food", label=food["name_english"])

        # Edges: food → disease contraindications
        contras = food.get("biochemical_profile", {}).get("known_contraindications", [])
        for contra in contras:
            contra_lower = contra.lower()
            for tag in user_disease_tags:
                if tag in contra_lower or contra_lower in tag:
                    disease_node = f"DISEASE_{tag.upper().replace(' ', '_')}"
                    G.add_edge(fid, disease_node, relation="aggravates")

        # Edges: food → drug conflicts (via active compounds)
        compounds = food.get("biochemical_profile", {}).get("active_compounds", [])
        macros = food.get("biochemical_profile", {}).get("macronutrients", {})
        for med in matched_meds:
            mid = med["node_id"]
            rules = med.get("gnn_conflict_rules", {})
            for interaction in rules.get("severe_drug_food_interactions", []):
                bio = interaction["interacting_biochemical"].lower()
                for comp in compounds:
                    if bio in comp.lower() or comp.lower() in bio:
                        G.add_edge(fid, mid, relation="conflicts_drug",
                                   weight=interaction.get("weight_penalty", W_SAFETY))

        # Edge: food → user (dosha effect)
        dosha_effect = food.get("ayurvedic_profile", {}).get("dosha_effect", {})
        if dosha_effect:
            G.add_edge(fid, "USER", relation="dosha_effect",
                       vata=dosha_effect.get("vata", 0),
                       pitta=dosha_effect.get("pitta", 0),
                       kapha=dosha_effect.get("kapha", 0))

    # ── Step 2: Message Passing — Compute Safety Score S ──
    results_by_category: dict[str, list[FoodResult]] = {}

    for food in surviving_foods:
        fid = food["node_id"]
        ayur = food.get("ayurvedic_profile", {})
        biochem = food.get("biochemical_profile", {})
        dosha_effect = ayur.get("dosha_effect", {})
        ritu_compat = ayur.get("ritu_compatibility", {})
        compounds = [c.lower() for c in biochem.get("active_compounds", [])]
        macros = biochem.get("macronutrients", {})
        contras = [c.lower() for c in biochem.get("known_contraindications", [])]

        score = 0.0
        reasoning: list[dict[str, Any]] = []

        # ── Level 1: Pharmacological Safety (W_SAFETY = -3.0) ──
        for med in matched_meds:
            rules = med.get("gnn_conflict_rules", {})
            drug_name = med["identifiers"]["generic_names"][0]

            for interaction in rules.get("severe_drug_food_interactions", []):
                bio = interaction["interacting_biochemical"].lower()
                penalty = interaction.get("weight_penalty", W_SAFETY)

                # Check against active compounds
                for comp in compounds:
                    if bio in comp or comp in bio:
                        score += penalty
                        reasoning.append({
                            "level": 1,
                            "type": "drug_conflict",
                            "label": f"⚠ Conflicts with {drug_name}",
                            "detail": interaction["interaction_effect"],
                            "weight": penalty,
                            "trigger": f"Compound: {comp} ↔ {drug_name}",
                        })

                # Check macronutrient-named biochemicals (e.g., High_Potassium)
                if bio.startswith("high_"):
                    macro_key = bio.replace("high_", "")
                    for mk, mv in macros.items():
                        if macro_key in mk.lower() and mv.lower() in ("high", "medium"):
                            score += penalty
                            reasoning.append({
                                "level": 1,
                                "type": "drug_conflict",
                                "label": f"⚠ {mk} conflicts with {drug_name}",
                                "detail": interaction["interaction_effect"],
                                "weight": penalty,
                                "trigger": f"Macro: {mk}={mv} ↔ {drug_name}",
                            })

        # ── Level 2: Disease Management (W_DISEASE = -2.0) ──
        # 2a: Direct contraindication match
        for contra in contras:
            for tag in user_disease_tags:
                if tag in contra or contra in tag:
                    score += W_DISEASE
                    reasoning.append({
                        "level": 2,
                        "type": "disease_aggravation",
                        "label": f"⚠ Aggravates {tag.title()}",
                        "detail": f"Known contraindication: {contra}",
                        "weight": W_DISEASE,
                        "trigger": f"Contra: {contra} ↔ Condition: {tag}",
                    })

        # 2b: Macronutrient disease conflicts from medication profiles
        for med in matched_meds:
            rules = med.get("gnn_conflict_rules", {})
            drug_name = med["identifiers"]["generic_names"][0]
            for profile_entry in rules.get("disease_aggravating_profiles", []):
                macro_target = profile_entry["interacting_macronutrient"].lower()
                penalty = profile_entry.get("weight_penalty", W_DISEASE)

                if macro_target.startswith("high_"):
                    macro_key = macro_target.replace("high_", "")
                    for mk, mv in macros.items():
                        if macro_key in mk.lower() and mv.lower() == "high":
                            score += penalty
                            reasoning.append({
                                "level": 2,
                                "type": "disease_macro_conflict",
                                "label": f"⚠ High {mk} undermines {drug_name}",
                                "detail": profile_entry["interaction_effect"],
                                "weight": penalty,
                                "trigger": f"Macro: {mk}={mv} ↔ {drug_name} protocol",
                            })
                elif macro_target == "saturated_fat":
                    sat_fat = macros.get("Saturated_Fat", "Low").lower()
                    if sat_fat in ("high", "medium"):
                        score += penalty
                        reasoning.append({
                            "level": 2,
                            "type": "disease_macro_conflict",
                            "label": f"⚠ Saturated fat undermines {drug_name}",
                            "detail": profile_entry["interaction_effect"],
                            "weight": penalty,
                            "trigger": f"Saturated_Fat={sat_fat} ↔ {drug_name}",
                        })

        # ── Level 3: Ayurvedic Wellness (W_WELLNESS = +1.5) ──
        # Pacification = negative dosha_effect on dominant dosha (reduces it)
        dominant_effect = dosha_effect.get(dominant_lower, 0)
        if dominant_effect < 0:
            # Pacifies dominant dosha → beneficial
            score += W_WELLNESS
            reasoning.append({
                "level": 3,
                "type": "dosha_pacification",
                "label": f"✦ Pacifies {req.dominant_dosha}",
                "detail": f"Dosha effect on {req.dominant_dosha}: {dominant_effect} (reduces excess)",
                "weight": W_WELLNESS,
                "trigger": f"{req.dominant_dosha} effect = {dominant_effect}",
            })
        elif dominant_effect > 0:
            # Aggravates dominant dosha → mild penalty
            score += -0.5
            reasoning.append({
                "level": 3,
                "type": "dosha_aggravation",
                "label": f"↑ Aggravates {req.dominant_dosha}",
                "detail": f"Dosha effect on {req.dominant_dosha}: +{dominant_effect} (increases excess)",
                "weight": -0.5,
                "trigger": f"{req.dominant_dosha} effect = +{dominant_effect}",
            })

        # Bonus if it also pacifies suppressed (balancing)
        suppressed_effect = dosha_effect.get(suppressed_lower, 0)
        if suppressed_effect < 0:
            score += 0.3
            reasoning.append({
                "level": 3,
                "type": "suppressed_balance",
                "label": f"↓ Also calms {req.suppressed_dosha}",
                "detail": f"Maintains balance by not over-stimulating suppressed dosha",
                "weight": 0.3,
                "trigger": f"{req.suppressed_dosha} effect = {suppressed_effect}",
            })

        # ── Level 4: Ritu Alignment (W_RITU = +0.5) ──
        if ritu_key and ritu_key in ritu_compat:
            compat_val = ritu_compat[ritu_key]
            if compat_val >= 2:
                score += W_RITU
                reasoning.append({
                    "level": 4,
                    "type": "ritu_alignment",
                    "label": f"❊ Excellent {req.current_ritu} food",
                    "detail": f"Ritu compatibility score: {compat_val}/2 — ideal seasonal match",
                    "weight": W_RITU,
                    "trigger": f"ritu_compatibility.{ritu_key} = {compat_val}",
                })
            elif compat_val == 1:
                score += 0.25
                reasoning.append({
                    "level": 4,
                    "type": "ritu_partial",
                    "label": f"~ Moderate {req.current_ritu} fit",
                    "detail": f"Ritu compatibility score: {compat_val}/2 — acceptable seasonal match",
                    "weight": 0.25,
                    "trigger": f"ritu_compatibility.{ritu_key} = {compat_val}",
                })
            elif compat_val == 0:
                score += -0.25
                reasoning.append({
                    "level": 4,
                    "type": "ritu_mismatch",
                    "label": f"↓ Not ideal for {req.current_ritu}",
                    "detail": f"Ritu compatibility score: {compat_val}/2 — seasonally mismatched",
                    "weight": -0.25,
                    "trigger": f"ritu_compatibility.{ritu_key} = {compat_val}",
                })

        # If no reasoning was added, note neutral status
        if not reasoning:
            reasoning.append({
                "level": 3,
                "type": "neutral",
                "label": "Neutral food",
                "detail": "No specific conflicts or benefits detected for your profile",
                "weight": 0.0,
                "trigger": "No graph edges activated",
            })

        # ── Classify ──
        score_rounded = round(score, 2)
        if score_rounded < 0.0:
            status = "Avoid"
        elif score_rounded <= 1.0:
            status = "Moderate"
        else:
            status = "Consume"

        categories = normalise_categories(food.get("category", ""))
        food_tags = food.get("metadata", {}).get("dietary_tags", {})

        result = FoodResult(
            node_id=fid,
            food_name=food["name_english"],
            local_name=food.get("name_local", ""),
            image_url=food.get("metadata", {}).get("image_url", ""),
            category=categories[0],  # primary display label on the card
            is_veg=food_tags.get("is_veg", True),
            is_vegan=food_tags.get("is_vegan", False),
            status=status,
            score=score_rounded,
            reasoning_stack=reasoning,
        )

        # Add to every matching bucket (a fish curry appears in both
        # 'Seafood & Meat' and 'Lunch & Dinner')
        for cat in categories:
            results_by_category.setdefault(cat, []).append(result)

    # Sort each category: Consume first, then Moderate, then Avoid; by score desc
    status_order = {"Consume": 0, "Moderate": 1, "Avoid": 2}
    for cat in results_by_category:
        results_by_category[cat].sort(
            key=lambda r: (status_order.get(r.status, 3), -r.score)
        )

    return GNNRecommendationResponse(
        total_foods=len(FOOD_DB),
        filtered_out=filtered_count,
        results=results_by_category,
        graph_stats={
            "total_nodes": G.number_of_nodes(),
            "total_edges": G.number_of_edges(),
            "food_nodes": len(surviving_foods),
            "disease_nodes": len(user_disease_tags),
            "drug_nodes": len(matched_meds),
        },
    )
