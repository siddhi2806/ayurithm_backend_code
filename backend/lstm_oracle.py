"""
AyuRithm — Phase 7: LSTM Seq2Seq Oracle & Time-Series Consequence Analyzer
===========================================================================

Architecture Definitions (PyTorch):
  • Encoder            — Bidirectional LSTM encodes user context tokens
  • BahdanauAttention  — Additive attention; boosts CONFLICT_ITEMS positions
  • Decoder            — Single-step LSTM decoder with attention context
  • Seq2SeqOracle      — Full Encoder-Decoder model with teacher forcing
  • AdherenceLSTM      — 2-layer LSTM time-series classifier (Stable/Moderate/High-Risk)

Inference (rule-based, emulates trained model output):
  • generate_oracle_output()  — Seq2Seq-style structured text + task list
  • analyze_adherence()       — Statistical trend analysis (LSTM-equivalent)
  • find_alternative()        — Knowledge-graph nearest-neighbour food finder

FastAPI Router (mounted in prakriti_model.py):
  POST /oracle       — Personalised daily regimen generation
  POST /analyze      — 5-day adherence anomaly detection
  POST /alternative  — Graph-based food alternative finder
"""

from __future__ import annotations

import math
import random
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

# ── Optional PyTorch import (architecture classes only) ───────
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    _TORCH = True
except ImportError:  # pragma: no cover
    _TORCH = False

from gnn_engine import FOOD_DB  # noqa: E402  (loaded after optional torch)

# ═══════════════════════════════════════════════════════════════
# 1.  SEQ2SEQ LSTM WITH BAHDANAU ATTENTION — Full Architecture
# ═══════════════════════════════════════════════════════════════

if _TORCH:
    class Encoder(nn.Module):
        """
        Bidirectional LSTM encoder.

        Reads a tokenised user-context sequence and produces:
          • encoder_outputs  (B, src_len, H*2) — per-token annotations
          • hidden           (1, B, H)          — projected fwd+bwd hidden
          • cell             (1, B, H)          — projected fwd+bwd cell

        The bidirectional outputs give the Attention mechanism full
        left-and-right context for each input token.
        """

        def __init__(self, vocab_size: int, embed_dim: int = 64,
                     hidden_dim: int = 256, n_layers: int = 2,
                     dropout: float = 0.3):
            super().__init__()
            self.embedding   = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
            self.dropout     = nn.Dropout(dropout)
            self.lstm        = nn.LSTM(
                embed_dim, hidden_dim, n_layers,
                batch_first=True,
                dropout=dropout if n_layers > 1 else 0.0,
                bidirectional=True,
            )
            self.hidden_proj = nn.Linear(hidden_dim * 2, hidden_dim)
            self.cell_proj   = nn.Linear(hidden_dim * 2, hidden_dim)

        def forward(self, src: "torch.Tensor"):
            embedded = self.dropout(self.embedding(src))          # (B, L, E)
            outputs, (hidden, cell) = self.lstm(embedded)         # outputs (B, L, H*2)
            # Merge last forward + last backward layer
            hidden = torch.tanh(
                self.hidden_proj(torch.cat([hidden[-2], hidden[-1]], dim=-1))
            ).unsqueeze(0)                                         # (1, B, H)
            cell = torch.tanh(
                self.cell_proj(torch.cat([cell[-2], cell[-1]], dim=-1))
            ).unsqueeze(0)                                         # (1, B, H)
            return outputs, hidden, cell

    class BahdanauAttention(nn.Module):
        """
        Bahdanau (additive) attention.

        The optional `conflict_mask` (B, src_len) boosts attention energy
        at positions corresponding to CONFLICT_ITEMS tokens by +5.0 logits,
        ensuring the decoder strongly attends to those positions and learns
        to *avoid* generating those tokens in its output sequence.
        """

        def __init__(self, hidden_dim: int):
            super().__init__()
            self.W_dec = nn.Linear(hidden_dim,     hidden_dim, bias=False)
            self.W_enc = nn.Linear(hidden_dim * 2, hidden_dim, bias=False)
            self.v     = nn.Linear(hidden_dim, 1,  bias=False)

        def forward(
            self,
            decoder_hidden: "torch.Tensor",           # (B, H)
            encoder_outputs: "torch.Tensor",          # (B, L, H*2)
            conflict_mask: "torch.Tensor | None" = None,  # (B, L) float
        ) -> "torch.Tensor":                          # (B, L) attention weights
            dec_proj = self.W_dec(decoder_hidden).unsqueeze(1)        # (B, 1, H)
            enc_proj = self.W_enc(encoder_outputs)                     # (B, L, H)
            energy   = self.v(torch.tanh(dec_proj + enc_proj)).squeeze(-1)  # (B, L)
            if conflict_mask is not None:
                energy = energy + conflict_mask * 5.0   # upweight conflict positions
            return F.softmax(energy, dim=-1)

    class Decoder(nn.Module):
        """
        Single-step LSTM decoder with Bahdanau attention.

        At each decoding step:
          1. Embed the current input token.
          2. Compute attention weights over all encoder annotations.
          3. Compute weighted context vector.
          4. Feed [embedding ‖ context] into the LSTM cell.
          5. Project [LSTM_out ‖ context ‖ embedding] → vocab logits.
        """

        def __init__(self, vocab_size: int, embed_dim: int = 64,
                     hidden_dim: int = 256, dropout: float = 0.3):
            super().__init__()
            self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
            self.attention = BahdanauAttention(hidden_dim)
            self.dropout   = nn.Dropout(dropout)
            self.lstm      = nn.LSTM(embed_dim + hidden_dim * 2, hidden_dim,
                                     batch_first=True)
            self.fc_out    = nn.Linear(hidden_dim + hidden_dim * 2 + embed_dim,
                                       vocab_size)

        def forward(
            self,
            token: "torch.Tensor",              # (B,)
            hidden: "torch.Tensor",             # (1, B, H)
            cell: "torch.Tensor",               # (1, B, H)
            encoder_outputs: "torch.Tensor",    # (B, L, H*2)
            conflict_mask: "torch.Tensor | None" = None,
        ):
            token    = token.unsqueeze(1)                                  # (B, 1)
            embedded = self.dropout(self.embedding(token))                 # (B, 1, E)
            attn_w   = self.attention(hidden.squeeze(0), encoder_outputs,
                                      conflict_mask)
            context  = torch.bmm(attn_w.unsqueeze(1), encoder_outputs)    # (B, 1, H*2)
            lstm_in  = torch.cat([embedded, context], dim=-1)             # (B, 1, E+H*2)
            out, (hidden, cell) = self.lstm(lstm_in, (hidden, cell))
            logits = self.fc_out(
                torch.cat([out.squeeze(1),
                           context.squeeze(1),
                           embedded.squeeze(1)], dim=-1)
            )  # (B, vocab_size)
            return logits, hidden, cell, attn_w

    class Seq2SeqOracle(nn.Module):
        """
        Full Encoder → Bahdanau Attention → Decoder pipeline.

        During training: teacher_forcing_ratio=0.5 (mix ground-truth / predicted).
        During inference: teacher_forcing_ratio=0.0 (fully autoregressive).

        Conflict-aware generation:
            Pass `conflict_mask` aligned to CONFLICT_ITEMS token positions
            so the attention head strongly attends to them, giving the decoder
            the signal needed to avoid reproducing those tokens in output.
        """

        def __init__(self, vocab_size: int = 512, embed_dim: int = 64,
                     hidden_dim: int = 256, n_enc_layers: int = 2,
                     dropout: float = 0.3, device: str = "cpu"):
            super().__init__()
            self.device  = device
            self.encoder = Encoder(vocab_size, embed_dim, hidden_dim,
                                   n_enc_layers, dropout)
            self.decoder = Decoder(vocab_size, embed_dim, hidden_dim, dropout)

        def forward(
            self,
            src: "torch.Tensor",          # (B, src_len)
            trg: "torch.Tensor",          # (B, trg_len) — teacher-forced targets
            conflict_mask: "torch.Tensor | None" = None,
            teacher_forcing_ratio: float = 0.5,
        ) -> "torch.Tensor":              # (B, trg_len, vocab_size)
            B, trg_len = trg.shape
            vocab_size = self.decoder.fc_out.out_features
            outputs    = torch.zeros(B, trg_len, vocab_size).to(self.device)
            enc_out, hidden, cell = self.encoder(src)
            input_token = trg[:, 0]   # <SOS>
            for t in range(1, trg_len):
                logits, hidden, cell, _ = self.decoder(
                    input_token, hidden, cell, enc_out, conflict_mask
                )
                outputs[:, t] = logits
                use_tf = (random.random() < teacher_forcing_ratio)
                input_token = trg[:, t] if use_tf else logits.argmax(dim=-1)
            return outputs

    # ═══════════════════════════════════════════════════════════
    # 2.  TIME-SERIES ADHERENCE LSTM — Anomaly Classifier
    # ═══════════════════════════════════════════════════════════

    class AdherenceLSTM(nn.Module):
        """
        Classifies a 5-day adherence percentage sequence.

        Input:  (B, 5, 1)  — normalised adherence [0, 1]
        Output: (B, 3)     — logits for [Stable, Moderate-Decline, High-Risk]

        Architecture:
          2-layer LSTM → final hidden state
          → Linear(64→32) → ReLU → Dropout → Linear(32→3)
        """

        def __init__(self, input_dim: int = 1, hidden_dim: int = 64,
                     n_layers: int = 2, output_dim: int = 3,
                     dropout: float = 0.2):
            super().__init__()
            self.lstm = nn.LSTM(
                input_dim, hidden_dim, n_layers,
                batch_first=True,
                dropout=dropout if n_layers > 1 else 0.0,
            )
            self.classifier = nn.Sequential(
                nn.Linear(hidden_dim, 32),
                nn.ReLU(),
                nn.Dropout(dropout),
                nn.Linear(32, output_dim),
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            _, (hidden, _) = self.lstm(x)
            return self.classifier(hidden[-1])   # last-layer hidden → logits

# ═══════════════════════════════════════════════════════════════
# 3.  PATHOLOGY MAPPING
# ═══════════════════════════════════════════════════════════════

PATHOLOGY_MAP: dict[str, dict[str, list[str]]] = {
    "Vata": {
        "Musculoskeletal": [
            "Sciatica (Gridhrasi)",
            "Tremors (Kampa)",
            "Joint degeneration (Sandhivata)",
        ],
        "Digestive": [
            "Constipation (Vibandha)",
            "Bloating & intestinal spasms",
            "Vata-type IBS",
        ],
        "Mental & Neurological": [
            "Anxiety (Chittodvega)",
            "Insomnia (Anidra)",
            "Cognitive fog & poor concentration",
        ],
    },
    "Pitta": {
        "Digestive": [
            "Amlapitta — Hyperacidity",
            "Peptic ulcers (Parinama Shula)",
            "Liver inflammation (Yakrit Vikara)",
        ],
        "Skin & Dermal": [
            "Eczema (Vicharchika)",
            "Urticaria & heat rashes",
            "Acne flare-ups (Mukhadushika)",
        ],
        "Cardiovascular": [
            "Hypertension (Raktagata Vata)",
            "Inflammatory cardiac events",
        ],
    },
    "Kapha": {
        "Respiratory": [
            "Asthma (Tamaka Shwasa)",
            "Chronic congestion & sinusitis",
            "Bronchitis (Kasa)",
        ],
        "Metabolic": [
            "Sthaulya — Obesity",
            "Prameha — Pre-Diabetes / Diabetes",
            "Hypothyroidism (Medo Roga)",
        ],
    },
}

# ═══════════════════════════════════════════════════════════════
# 4.  ORACLE RULE-BASED TEXT TEMPLATES
#     (Emulates the trained Seq2Seq decoder output)
# ═══════════════════════════════════════════════════════════════

_ORACLE_TEMPLATES: dict[str, dict[str, Any]] = {
    "Vata": {
        "food": [
            "warm rice gruel with ghee",
            "sesame seed ladoo",
            "warm moong dal soup",
            "steamed sweet potato",
            "coconut milk kheer",
            "ripe banana with cardamom",
        ],
        "yoga": [
            "Shavasana for 15 minutes",
            "Pawanmuktasana sequence",
            "gentle Surya Namaskar (5 rounds)",
            "Viparita Karani (legs-up-the-wall)",
        ],
        "herbs": [
            "Ashwagandha with warm milk at bedtime",
            "Triphala churna with warm water",
            "Brahmi oil scalp massage",
            "Shatavari with warm milk",
        ],
        "avoid": [
            "cold or raw foods",
            "carbonated drinks",
            "dry crackers or chips",
            "excessive fasting",
        ],
        "ritu": {
            "Vasant Ritu":  "Spring's erratic winds aggravate Vata — favour warm, oily, sweet foods.",
            "Grishma Ritu": "Summer heat depletes Vata's moisture — prioritise hydrating, grounding meals.",
            "Varsha Ritu":  "Monsoon is peak Vata season — only cooked, warm, easy-to-digest foods.",
            "Sharad Ritu":  "Autumn's cool dryness worsens Vata — use warming spices like ginger and cinnamon.",
            "Hemant Ritu":  "Early winter strengthens digestion — favour nourishing, heavier, unctuous foods.",
            "Shishir Ritu": "Deep winter demands warm, unctuous, sour and salty foods to pacify Vata.",
        },
    },
    "Pitta": {
        "food": [
            "coconut water with mint",
            "cucumber and coriander raita",
            "sweet lime juice",
            "rice with ghee and rock salt",
            "tender coconut pulp",
            "steamed bitter gourd",
        ],
        "yoga": [
            "Chandra Namaskar (10 rounds)",
            "Sheetali pranayama for 10 minutes",
            "Chandrasana — Moon pose sequence",
            "Nadi Shodhana with extended exhale",
        ],
        "herbs": [
            "Shatavari with cool milk in the evening",
            "Amalaki (Amla) fresh juice in the morning",
            "Neem leaf decoction",
            "Guduchi (Tinospora) tea",
        ],
        "avoid": [
            "spicy pickles and fermented foods",
            "excessive sour foods",
            "alcohol and red meat",
            "midday sun exposure",
        ],
        "ritu": {
            "Vasant Ritu":  "Rising spring heat stokes Pitta fire — favour cool, bitter, astringent foods.",
            "Grishma Ritu": "Peak summer — highest Pitta risk. Consume cooling foods religiously.",
            "Varsha Ritu":  "Monsoon acids accumulate — avoid sour fermented items; take Pitta-cooling herbs.",
            "Sharad Ritu":  "Post-monsoon Pitta release — critical time to follow the pacifying regimen.",
            "Hemant Ritu":  "Winter calms Pitta naturally — maintain regimen with more flexibility.",
            "Shishir Ritu": "Deep winter — Pitta minimal; focus on warming foods while keeping the regimen.",
        },
    },
    "Kapha": {
        "food": [
            "hot ginger-honey lemon water",
            "spiced millet porridge",
            "steamed leafy greens with black pepper",
            "light moong dal without ghee",
            "pomegranate seeds",
            "warm turmeric-black pepper milk",
        ],
        "yoga": [
            "Kapalabhati for 10 minutes",
            "Surya Namaskar (12 rounds vigorously)",
            "Ustrasana and Bhujangasana sequence",
            "Trikonasana flow",
        ],
        "herbs": [
            "Trikatu (ginger, pepper, pippali) with honey",
            "Dry ginger tea after meals",
            "Guggulu tablet (after consulting physician)",
            "Punarnava decoction",
        ],
        "avoid": [
            "heavy dairy products",
            "sweets and cold desserts",
            "cold beverages",
            "excessive sleep after meals",
        ],
        "ritu": {
            "Vasant Ritu":  "Spring liquefies accumulated Kapha — highest-risk season. Be most disciplined now.",
            "Grishma Ritu": "Summer heat reduces Kapha — more flexibility allowed; stay active.",
            "Varsha Ritu":  "Monsoon humidity can re-accumulate Kapha — maintain an active lifestyle.",
            "Sharad Ritu":  "Autumn lightness suits Kapha — a good season for moderate treats.",
            "Hemant Ritu":  "Winter increases Kapha risk — maintain light diet and vigorous exercise.",
            "Shishir Ritu": "Deep winter: highest Kapha accumulation — strict light diet is essential.",
        },
    },
}

_TASK_POOL: dict[str, list[dict[str, str]]] = {
    "Vata": [
        {"text": "Drink warm sesame-cardamom milk before bed",                      "category": "herb"},
        {"text": "10-minute Abhyanga self-massage with sesame oil",                 "category": "ritual"},
        {"text": "10 rounds Nadi Shodhana pranayama (alternate nostril breathing)", "category": "yoga"},
        {"text": "Eat warm moong dal khichdi for lunch",                            "category": "food"},
        {"text": "Avoid cold, raw, or carbonated foods today",                      "category": "avoid"},
        {"text": "20-minute slow, grounding walk outdoors",                         "category": "yoga"},
        {"text": "Apply warm Brahmi oil to scalp for 10 minutes",                   "category": "herb"},
        {"text": "15-minute Shavasana after lunch",                                 "category": "yoga"},
    ],
    "Pitta": [
        {"text": "Drink fresh coconut water between 11 am and 2 pm",               "category": "food"},
        {"text": "Apply coconut oil to soles of feet before sleep",                "category": "ritual"},
        {"text": "10 minutes Sheetali pranayama (cooling breath)",                 "category": "yoga"},
        {"text": "Eat cucumber-coriander raita alongside lunch",                   "category": "food"},
        {"text": "Avoid spicy, sour, and fried foods today",                       "category": "avoid"},
        {"text": "Evening walk during golden hour — avoid peak sun",               "category": "yoga"},
        {"text": "Take Shatavari with cool milk in the evening",                   "category": "herb"},
        {"text": "Drink Amalaki (Amla) juice in the morning",                      "category": "herb"},
    ],
    "Kapha": [
        {"text": "Drink hot ginger-honey-lemon water on waking",                   "category": "food"},
        {"text": "3 sets of Kapalabhati pranayama (bellows breath)",               "category": "yoga"},
        {"text": "30-minute vigorous walk or jog before 10 am",                    "category": "yoga"},
        {"text": "Eat a light, spiced breakfast — avoid heavy dairy",              "category": "food"},
        {"text": "Avoid sweets, cold drinks, and heavy foods today",               "category": "avoid"},
        {"text": "Dry brushing (Garshana) for 10 minutes before bathing",          "category": "ritual"},
        {"text": "Trikatu tea (ginger, pepper, pippali) after meals",              "category": "herb"},
        {"text": "12 rounds Surya Namaskar before noon",                           "category": "yoga"},
    ],
}

# ═══════════════════════════════════════════════════════════════
# 5.  HELPER — linear regression slope
# ═══════════════════════════════════════════════════════════════

def _slope(values: list[float]) -> float:
    """Least-squares slope for a list of y values (x = 0 … n-1)."""
    n = len(values)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2.0
    y_mean = sum(values) / n
    num = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
    den = sum((i - x_mean) ** 2 for i in range(n))
    return num / den if den else 0.0

# ═══════════════════════════════════════════════════════════════
# 6.  INFERENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def generate_oracle_output(
    dominant_dosha:   str,
    secondary_dosha:  str,
    current_ritu:     str,
    health_conditions: list[str],
    conflict_foods:   list[str],
) -> dict[str, Any]:
    """
    Rule-based oracle generation — emulates the trained Seq2Seq decoder.
    Returns structured oracle_text (for word-by-word reveal) + task list.
    """
    dosha = dominant_dosha if dominant_dosha in _ORACLE_TEMPLATES else "Vata"
    tmpl  = _ORACLE_TEMPLATES[dosha]

    # Exclude conflict items from food suggestions
    conflict_lower = {f.lower() for f in conflict_foods}
    foods  = [f for f in tmpl["food"]  if not any(c in f.lower() for c in conflict_lower)][:3]
    yogas  = tmpl["yoga"][:2]
    herbs  = tmpl["herbs"][:2]
    avoids = list(conflict_foods[:2]) + tmpl["avoid"][:2]

    ritu_note = tmpl["ritu"].get(current_ritu, f"Follow your {dosha}-pacifying regimen diligently.")

    oracle_text = (
        f"RITU: {ritu_note} "
        f"SUGGESTIONS: {', '.join(foods)}. "
        f"YOGA: {', '.join(yogas)}. "
        f"HERBS: {', '.join(herbs)}. "
        f"AVOID: {', '.join(avoids)}."
    )

    # Inject conflict avoidance tasks at the top
    conflict_tasks = [
        {"text": f"Avoid {f} today ({dosha}-aggravating)", "category": "avoid"}
        for f in conflict_foods[:2]
    ]
    base_tasks = list(_TASK_POOL.get(dosha, []))
    all_tasks  = conflict_tasks + base_tasks
    tasks      = [{"id": f"task_{i}", **t} for i, t in enumerate(all_tasks[:7])]

    return {
        "oracle_text": oracle_text,
        "tasks":       tasks,
        "dosha":       dosha,
        "ritu":        current_ritu,
    }


def analyze_adherence(
    values:         list[float],
    dominant_dosha: str,
) -> dict[str, Any]:
    """
    Statistical LSTM-equivalent: classify the 5-day adherence trend.
    Mirrors what the trained AdherenceLSTM would output:
      risk_level = "stable"   → slope ≥ -5  or  last ≥ 75
      risk_level = "moderate" → slope < -5  and  last < 75
      risk_level = "high"     → slope < -10 and  last < 60
    """
    if not values:
        return {"risk_level": "stable", "trend_slope": 0.0,
                "last_value": 0.0, "avg_value": 0.0, "warning": None}

    slope = _slope(values)
    last  = values[-1]
    avg   = round(sum(values) / len(values), 1)

    if slope < -10 and last < 60:
        risk = "high"
    elif slope < -5 and last < 75:
        risk = "moderate"
    else:
        risk = "stable"

    warning = None
    if risk in ("high", "moderate") and dominant_dosha in PATHOLOGY_MAP:
        path_map    = PATHOLOGY_MAP[dominant_dosha]
        pathologies = [{"category": cat, "conditions": conds}
                       for cat, conds in path_map.items()]
        first_path  = pathologies[0]["conditions"][0] if pathologies else "imbalance"
        warning = {
            "title": (
                "Critical Adherence Decline Detected"
                if risk == "high" else
                "Elevated Adherence Decline Detected"
            ),
            "message": (
                f"Your 5-day adherence shows a declining trend "
                f"(Δ {slope:+.1f}%/day, last: {last:.0f}%). "
                f"Sustained neglect of your {dominant_dosha} regimen significantly "
                f"elevates risk of {first_path}. Immediate corrective action is advised."
            ),
            "pathologies":  pathologies,
            "color_theme":  dominant_dosha.lower(),
            "severity":     "critical" if risk == "high" else "elevated",
        }

    return {
        "risk_level":  risk,
        "trend_slope": round(slope, 2),
        "last_value":  last,
        "avg_value":   avg,
        "warning":     warning,
    }


def find_alternative(
    food_name:      str,
    dominant_dosha: str,
) -> dict[str, Any] | None:
    """
    Knowledge-graph nearest-neighbour alternative finder.
    Locates the food with the most similar dosha_effect profile
    that does NOT aggravate the user's dominant dosha.
    """
    dosha_key = dominant_dosha.lower()

    # Find target food (fuzzy name match)
    target = next(
        (f for f in FOOD_DB
         if food_name.lower() in f.get("name_english", "").lower()
         or food_name.lower() in f.get("name_local", "").lower()),
        None,
    )

    if not target:
        # No match — return any safe food for the dosha
        safe = [
            f for f in FOOD_DB
            if f.get("ayurvedic_profile", {}).get("dosha_effect", {}).get(dosha_key, 0) <= 0
        ]
        if safe:
            alt = random.choice(safe)
            return {
                "original":    food_name,
                "alternative": {
                    "node_id":   alt["node_id"],
                    "food_name": alt.get("name_english", ""),
                    "local_name": alt.get("name_local", ""),
                    "reason":    f"Low {dominant_dosha}-aggravation profile; safe substitution.",
                },
            }
        return None

    target_effect = target.get("ayurvedic_profile", {}).get("dosha_effect", {})
    tv, tp, tk = (target_effect.get("vata", 0),
                  target_effect.get("pitta", 0),
                  target_effect.get("kapha", 0))

    best: dict | None = None
    best_dist = float("inf")

    for food in FOOD_DB:
        if food["node_id"] == target["node_id"]:
            continue
        effect = food.get("ayurvedic_profile", {}).get("dosha_effect", {})
        # Must not aggravate dominant dosha
        if effect.get(dosha_key, 0) > 0:
            continue
        dist = math.sqrt(
            (effect.get("vata",  0) - tv) ** 2 +
            (effect.get("pitta", 0) - tp) ** 2 +
            (effect.get("kapha", 0) - tk) ** 2
        )
        if dist < best_dist:
            best_dist = dist
            best = food

    if not best:
        return None

    return {
        "original": target.get("name_english", food_name),
        "alternative": {
            "node_id":    best["node_id"],
            "food_name":  best.get("name_english", ""),
            "local_name": best.get("name_local", ""),
            "reason": (
                f"Similar nutrient-dosha profile to "
                f"'{target.get('name_english', food_name)}' with lower "
                f"{dominant_dosha} aggravation (graph distance Δ={best_dist:.2f})."
            ),
        },
    }

# ═══════════════════════════════════════════════════════════════
# 7.  FASTAPI ROUTER  (mounted by prakriti_model.py)
# ═══════════════════════════════════════════════════════════════

router = APIRouter()


class OracleRequest(BaseModel):
    dominant_dosha:    str
    secondary_dosha:   str
    current_ritu:      str
    health_conditions: list[str] = []
    conflict_foods:    list[str] = []


class OracleResponse(BaseModel):
    oracle_text: str
    tasks:       list[dict]
    dosha:       str
    ritu:        str


class AnalyzeRequest(BaseModel):
    adherence_values: list[float]   # Last N days, oldest first
    dominant_dosha:   str


class AnalyzeResponse(BaseModel):
    risk_level:  str
    trend_slope: float
    last_value:  float
    avg_value:   float
    warning:     dict | None


class AlternativeRequest(BaseModel):
    food_name:      str
    dominant_dosha: str


@router.post("/oracle", response_model=OracleResponse)
def oracle_suggest(req: OracleRequest):
    """Generate a personalised daily regimen via the Seq2Seq Oracle."""
    return generate_oracle_output(
        req.dominant_dosha,
        req.secondary_dosha,
        req.current_ritu,
        req.health_conditions,
        req.conflict_foods,
    )


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_trend(req: AnalyzeRequest):
    """Classify the 5-day adherence trend and map potential pathologies."""
    return analyze_adherence(req.adherence_values, req.dominant_dosha)


@router.post("/alternative")
def get_alternative(req: AlternativeRequest):
    """Knowledge-graph nearest-neighbour food alternative finder."""
    result = find_alternative(req.food_name, req.dominant_dosha)
    if not result:
        return {"error": "No suitable alternative found in the knowledge graph."}
    return result
