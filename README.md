# AyuRithm Backend

An Ayurvedic AI recommendation engine that combines a Graph Neural Network (GNN) for food safety scoring with a Random Forest model for Prakriti (dosha) prediction. The backend is served as a FastAPI application.

---

## Project Structure

```
backend/
├── prakriti_model.py   # FastAPI app — Prakriti prediction & diet recommendation endpoints
├── gnn_engine.py       # GNN knowledge-graph scoring engine
├── evaluate_gnn.py     # Evaluation harness (50-case ground truth + 1,000 synthetic runs)
└── requirements.txt    # Python dependencies
```

---

## File Details

### 1. `prakriti_model.py` — FastAPI Application Entry Point

The main application server. Trains a `RandomForestClassifier` on startup and exposes REST endpoints.

#### Model Training
- **Algorithm:** `RandomForestClassifier` (100 estimators, max_depth=10, balanced class weights)
- **Training data:** 600 synthetic samples — 200 per dosha class (Vata=0, Pitta=1, Kapha=2)
- **Features:** 15 questionnaire answers (`Q1`–`Q15`), each in `{0, 1, 2}`
- **Label generation:** ~70% of features match the dominant dosha, 30% random (adds noise)

#### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/predict` | Predict Prakriti from 15 questionnaire answers |
| `GET` | `/health` | Health check — returns model info |
| `POST` | `/recommend` | Run the GNN engine and return food recommendations |

#### Request / Response Models

**`POST /predict`**
```json
// Request — PrakritiRequest
{ "answers": [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2] }

// Response — PrakritiResponse
{
  "dominant": "Vata",
  "secondary": "Pitta",
  "suppressed": "Kapha",
  "dual_dosha": "Vata-Pitta",
  "scores": { "Vata": 0.62, "Pitta": 0.25, "Kapha": 0.13 },
  "feature_importances": [0.07, 0.06, ...]
}
```

**`POST /recommend`** — accepts `GNNRecommendationRequest` (see `gnn_engine.py`), returns categorised food list.

#### Validation
- Exactly 15 answers required; each must be `0`, `1`, or `2` (enforced via `field_validator`).

#### Other Details
- **CORS:** Enabled for all origins (`allow_origins=["*"]`) — tighten in production.
- **LSTM Oracle:** Additional adherence/oracle endpoints are mounted via `lstm_oracle.router`.

---

### 2. `gnn_engine.py` — GNN Knowledge-Graph Scoring Engine

Builds a heterogeneous directed knowledge graph using **NetworkX** and performs weighted message-passing to score every food item for a given user profile.

#### Data Sources (loaded at module level)
| File | Description |
|------|-------------|
| `goan_food.json` | Food database — Ayurvedic profiles, biochemical data, dietary tags |
| `medicines.json` | Medicine database — drug–food interaction rules, disease-aggravating profiles |

Both files are resolved relative to the repository root (`BASE_DIR = Path(__file__).resolve().parent.parent`).

#### Scoring Weights

| Constant | Value | Meaning |
|----------|-------|---------|
| `W_SAFETY` | `-3.0` | Level 1 — Pharmacological drug–food conflict |
| `W_DISEASE` | `-2.0` | Level 2 — Disease aggravation contraindication |
| `W_WELLNESS` | `+1.5` | Level 3 — Ayurvedic dosha pacification (dominant) |
| `W_RITU` | `+0.5` | Level 4 — Seasonal (Ritu) alignment |

Additional bonus: `+0.3` if the suppressed dosha is also pacified by the food.

**Classification thresholds:**

| Score range | Status |
|-------------|--------|
| `score > 1.0` | **Consume** |
| `0.0 ≤ score ≤ 1.0` | **Moderate** |
| `score < 0.0` | **Avoid** |

**Mathematical safety guarantee:**  
Drug conflict floor = `W_SAFETY + max_wellness` = `-3.0 + 2.3` = **-0.7** → always `Avoid`.

#### Pydantic Models

**`GNNRecommendationRequest`**

| Field | Type | Description |
|-------|------|-------------|
| `dominant_dosha` | `str` | Primary dosha (Vata / Pitta / Kapha) |
| `secondary_dosha` | `str` | Secondary dosha |
| `suppressed_dosha` | `str` | Suppressed dosha |
| `current_ritu` | `str` | Current Ayurvedic season |
| `dietary_preference` | `str \| None` | e.g. vegan, vegetarian, non-vegetarian |
| `allergies` | `list[str]` | User allergens |
| `health_conditions` | `list[str]` | User health conditions |
| `medications` | `list[str]` | Current medications |
| `doctor_restrictions` | `str \| None` | Free-text doctor notes |

**`FoodResult`** — per-food scoring output

| Field | Description |
|-------|-------------|
| `node_id` | Unique food identifier |
| `food_name` | English name |
| `local_name` | Local/Goan name |
| `image_url` | Image URL |
| `category` | Meal category (Breakfast, Lunch & Dinner, Snacks, etc.) |
| `is_veg` / `is_vegan` | Dietary flags |
| `status` | Consume / Moderate / Avoid |
| `score` | Computed safety score |
| `reasoning_stack` | Ordered list of scoring decisions with levels, weights, and details |

**`GNNRecommendationResponse`**

| Field | Description |
|-------|-------------|
| `total_foods` | Total foods evaluated after hard filters |
| `filtered_out` | Foods removed by diet/allergen hard filters |
| `results` | `dict[category → list[FoodResult]]` |
| `graph_stats` | Node/edge counts from the knowledge graph |

#### Ritu (Season) Mapping

| UI Name | Internal Key |
|---------|--------------|
| Vasant Ritu | `vasant` |
| Grishma Ritu | `grishma` |
| Varsha Ritu | `varsha` |
| Sharad Ritu | `sharad` |
| Hemant Ritu | `hemant` |
| Shishir Ritu | `shishir` |

#### Supported Health Conditions (`DISEASE_MAP`)

`high blood pressure`, `high cholesterol / dyslipidemia`, `heart disease`, `stroke`, `diabetes (type 1)`, `diabetes (type 2)`, `thyroid imbalance`, `pcod / pcos`, `obesity`, `acid reflux / gerd`, `ibs`, `ibd`, `nafld`, `chronic constipation`, `arthritis`, `gout / high uric acid`, `osteoporosis`

#### GNN Pipeline (`run_gnn_scoring`)
1. Resolve user disease tags and match medications from the database.
2. Build a `NetworkX` directed graph with `USER`, `DISEASE_*`, `DRUG_*`, and `FOOD_*` nodes.
3. Add edges: `food → disease` (aggravates), `food → drug` (conflicts_drug), `food → user` (dosha_effect).
4. Hard-filter foods by dietary preference and allergens.
5. Message-passing: for each surviving food compute `score` across all four levels.
6. Classify each food and group results by meal category.

#### Key Helper Functions

| Function | Purpose |
|----------|---------|
| `normalise_categories(raw)` | Maps raw food category strings to UI meal buckets |
| `_diet_blocks_food(pref, food)` | Hard-filter for dietary preference |
| `_allergen_blocks_food(allergies, food)` | Hard-filter for allergens (partial match) |
| `_match_user_meds(user_meds)` | Fuzzy match user medication names against the medicine DB |
| `_user_disease_tags(health_conditions)` | Expand conditions to all matchable disease tags |

---

### 3. `evaluate_gnn.py` — Evaluation Harness

Validates the GNN engine correctness and analyzes population-level distribution.

#### Two Evaluation Modes
1. **50-case ground-truth set** — clinically derived, deterministic labels.
2. **1,000 synthetic patient runs** — distribution analysis across random profiles.

#### Ground Truth Sections

| Section | Cases | Expected Label | Rationale |
|---------|-------|----------------|-----------|
| **A** — Drug conflicts (L1) | ~20 | Avoid | `W_SAFETY (-3.0) + max_wellness (+2.3)` = `-0.7 < 0` |
| **B** — Dual disease conflicts | ~10 | Avoid | Two disease penalties `-4.0 + 2.3` = `-1.7 < 0` |
| **C** — Clean profile, dosha-pacifying food | ~10 | Consume | `W_WELLNESS (+1.5) + W_RITU (+0.5)` = `+2.0 > 1.0` |
| **D** — Clean profile, neutral dosha food | ~10 | Moderate | Score ≈ `0–0.5`, within `[0, 1.0]` |

**Section A sub-groups:**
- **A-K:** RAAS drugs (Spironolactone, Ramipril, Telmisartan) + high-potassium foods → hyperkalemia risk.
- **A-S:** Statins (Atorvastatin, Rosuvastatin) + dyslipidemia condition + contraindicated foods.
- **A-C:** Cardiovascular drugs (Nitroglycerin, Metoprolol, Clopidogrel, Ticagrelor) + heart disease.
- **A-D:** Hydrochlorothiazide + diabetes + diabetes-contraindicated foods.

#### Metrics (when `scikit-learn` is installed)
- Accuracy, Precision, Recall, F1-score (per class and macro)
- Confusion matrix

#### Key Functions

| Function | Purpose |
|----------|---------|
| `_score_food(req, food_id)` | Run GNN and extract `(status, score)` for one specific food |
| `_foods_with_compound(compound)` | Find foods containing a specific active compound |
| `_foods_with_contraindication(tag)` | Find foods with a matching contraindication tag |
| `_foods_pacifying_dosha(dosha, ritu_key)` | Find foods that pacify a dosha and are ritu-compatible |
| `_foods_neutral_dosha(dosha)` | Find foods with zero dosha effect |
| `build_ground_truth()` | Build the 50-case labeled test set |
| `generate_synthetic_patients(n)` | Generate `n` random patient profiles for distribution analysis |

#### Running the Evaluator
```bash
# From the backend/ directory:
python evaluate_gnn.py

# From the repository root:
python backend/evaluate_gnn.py
```

---

### 4. `requirements.txt` — Python Dependencies

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework for the REST API |
| `uvicorn[standard]` | ASGI server |
| `scikit-learn` | RandomForestClassifier + evaluation metrics |
| `numpy` | Numerical operations |
| `pydantic` | Request/response data validation |
| `networkx` | Knowledge graph construction and traversal |

---

## Setup & Running

### Install dependencies
```bash
pip install -r requirements.txt
```

### Start the API server
```bash
# From the backend/ directory:
python -m uvicorn prakriti_model:app --host 0.0.0.0 --port 8000 --reload

# Or with --app-dir (run from anywhere):
python -m uvicorn prakriti_model:app --app-dir "path/to/backend" --host 0.0.0.0 --port 8000 --reload
```

The server will be available at `http://localhost:8000`.  
Interactive API docs: `http://localhost:8000/docs`.

### Run the GNN evaluation
```bash
python backend/evaluate_gnn.py
```

---

## Architecture Overview

```
Client Request
      │
      ▼
prakriti_model.py  (FastAPI)
  ├── POST /predict  ──►  RandomForestClassifier  ──►  Dosha prediction
  ├── POST /recommend ──►  gnn_engine.run_gnn_scoring()
  │                            │
  │                   ┌────────▼────────┐
  │                   │  NetworkX Graph  │
  │                   │  USER ↔ FOOD    │
  │                   │  FOOD ↔ DISEASE │
  │                   │  FOOD ↔ DRUG    │
  │                   └────────┬────────┘
  │                            │  Message Passing
  │                            ▼
  │                   Score: W_SAFETY + W_DISEASE
  │                         + W_WELLNESS + W_RITU
  │                            │
  │                   Classify: Consume / Moderate / Avoid
  │                            │
  └───────────────────◄────────┘  GNNRecommendationResponse
  └── LSTM Oracle endpoints  (via lstm_oracle.router)
```

---

## Notes

- The `goan_food.json` and `medicines.json` data files must exist at the **repository root** (one level above `backend/`).
- The `lstm_oracle` module (providing adherence tracking endpoints) is expected alongside `prakriti_model.py` but is not included in the listed files.
- CORS is open (`*`) by default — restrict `allow_origins` in production deployments.
