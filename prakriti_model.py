"""
AyuRithm — Prakriti Prediction Backend
RandomForestClassifier trained on synthetic Ayurvedic assessment data.
Run: pip install fastapi uvicorn scikit-learn numpy pydantic
Start: uvicorn prakriti_model:app --host 0.0.0.0 --port 8000 --reload
"""

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from sklearn.ensemble import RandomForestClassifier

from gnn_engine import (
    GNNRecommendationRequest,
    GNNRecommendationResponse,
    run_gnn_scoring,
)
# ─── SYNTHETIC TRAINING DATA ────────────────────────────────
# Each row = 15 features (Q1–Q15), values in {0=Vata, 1=Pitta, 2=Kapha}
# Labels: 0=Vata, 1=Pitta, 2=Kapha
#
# We generate training data that captures real Ayurvedic heuristics:
#   - A predominantly-0 feature vector → Vata
#   - A predominantly-1 feature vector → Pitta
#   - A predominantly-2 feature vector → Kapha
#   - Mixed vectors produce mixed predict_proba outputs (dual-dosha)

rng = np.random.RandomState(42)

def generate_samples(dominant: int, n: int = 200) -> np.ndarray:
    """Generate n synthetic samples where ~70% of features match `dominant`."""
    samples = []
    for _ in range(n):
        row = []
        for _ in range(15):
            if rng.random() < 0.70:
                row.append(dominant)
            else:
                row.append(rng.choice([v for v in [0, 1, 2] if v != dominant]))
        samples.append(row)
    return np.array(samples)

X_vata = generate_samples(0, 200)
X_pitta = generate_samples(1, 200)
X_kapha = generate_samples(2, 200)

X_train = np.vstack([X_vata, X_pitta, X_kapha])
y_train = np.array([0]*200 + [1]*200 + [2]*200)

# ─── MODEL TRAINING ─────────────────────────────────────────
model = RandomForestClassifier(
    n_estimators=100,
    max_depth=10,
    random_state=42,
    class_weight="balanced",
)
model.fit(X_train, y_train)

DOSHA_NAMES = ["Vata", "Pitta", "Kapha"]

# ─── FASTAPI APP ─────────────────────────────────────────────
app = FastAPI(title="AyuRithm Prakriti Engine", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

class PrakritiRequest(BaseModel):
    answers: list[int]

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, v: list[int]) -> list[int]:
        if len(v) != 15:
            raise ValueError("Exactly 15 answers required")
        if not all(a in (0, 1, 2) for a in v):
            raise ValueError("Each answer must be 0, 1, or 2")
        return v

class PrakritiResponse(BaseModel):
    dominant: str
    secondary: str
    suppressed: str
    dual_dosha: str
    scores: dict[str, float]
    feature_importances: list[float]

@app.post("/predict", response_model=PrakritiResponse)
def predict_prakriti(req: PrakritiRequest):
    X = np.array(req.answers).reshape(1, -1)

    # predict_proba returns [P(Vata), P(Pitta), P(Kapha)]
    proba = model.predict_proba(X)[0]
    ranked = np.argsort(proba)[::-1]  # descending

    dominant = DOSHA_NAMES[ranked[0]]
    secondary = DOSHA_NAMES[ranked[1]]
    suppressed = DOSHA_NAMES[ranked[2]]

    scores = {DOSHA_NAMES[i]: round(float(proba[i]), 4) for i in range(3)}
    importances = [round(float(v), 4) for v in model.feature_importances_]

    return PrakritiResponse(
        dominant=dominant,
        secondary=secondary,
        suppressed=suppressed,
        dual_dosha=f"{dominant}-{secondary}",
        scores=scores,
        feature_importances=importances,
    )

@app.get("/health")
def health():
    return {"status": "ok", "model": "RandomForestClassifier", "n_estimators": 100}


# ─── GNN DIET RECOMMENDATION ENDPOINT ───────────────────────
@app.post("/recommend", response_model=GNNRecommendationResponse)
def recommend_diet(req: GNNRecommendationRequest):
    """Run the GNN knowledge-graph scoring engine and return categorised food recommendations."""
    return run_gnn_scoring(req)



