# backend/api.py

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional

app = FastAPI(title="NBA Stats API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://nba-angular.netlify.app",
        "http://localhost:4200"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"


# ─── Helpers ────────────────────────────────────────────────────────────────

def load_simple(filename: str) -> pd.DataFrame:
    """CSV à en-tête simple (players_stats, advanced_stats)."""
    df = pd.read_csv(DATA_DIR / filename)
    df = df.dropna(subset=[df.columns[1]])          # supprime lignes sans joueur
    df = df[df.iloc[:, 1].astype(str).str.strip() != ""]
    df = df.replace({np.nan: None})
    return df


def load_multiheader(filename: str) -> pd.DataFrame:
    """CSV à double en-tête (shootings, adjusted_shooting)."""
    df = pd.read_csv(DATA_DIR / filename, header=[0, 1])
    # Aplatit : "% of FGA by Distance" + "Unnamed: 10_level_1" → "% of FGA by Distance"
    # Si le niveau 1 est un vrai label (pas Unnamed), on concatène avec " | "
    new_cols = []
    for top, sub in df.columns:
        top = str(top).strip()
        sub = str(sub).strip()
        if sub.startswith("Unnamed"):
            new_cols.append(top)
        else:
            new_cols.append(f"{top} | {sub}")
    df.columns = new_cols
    player_col = df.columns[1]
    df = df.dropna(subset=[player_col])
    df = df[df[player_col].astype(str).str.strip() != ""]
    df = df.replace({np.nan: None})
    return df


def slug_col(df: pd.DataFrame) -> str:
    """Retourne le nom de la 2e colonne (identifiant joueur)."""
    return df.columns[1]


def find_player(df: pd.DataFrame, slug: str) -> dict:
    col = slug_col(df)
    row = df[df[col] == slug]
    if row.empty:
        return {}
    return row.iloc[0].to_dict()


# ─── Chargement au démarrage ─────────────────────────────────────────────────

@app.on_event("startup")
async def load_data():
    try:
        print("Chargement players_stats...")
        app.state.players_stats = load_simple("players_stats.csv")
        print(f"OK — {len(app.state.players_stats)} lignes")

        print("Chargement advanced_stats...")
        app.state.advanced_stats = load_simple("advanced_stats.csv")
        print(f"OK — {len(app.state.advanced_stats)} lignes")

        print("Chargement shooting...")
        app.state.shooting = load_multiheader("shootings.csv")
        print(f"OK — {len(app.state.shooting)} lignes")

        print("Chargement adjusted_shooting...")
        app.state.adjusted_shooting = load_multiheader("adjusted_shooting.csv")
        print(f"OK — {len(app.state.adjusted_shooting)} lignes")

        print("Chargement team_stats...")
        app.state.team_stats = load_simple("team_stats.csv")
        print(f"OK — {len(app.state.team_stats)} lignes")

        print("Tous les CSV chargés.")

    except Exception as e:
        print(f"ERREUR au chargement : {e}")
        import traceback
        traceback.print_exc()

# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/players")
def get_players(
    search:   Optional[str]   = Query(None, description="Recherche par nom"),
    pos:      Optional[str]   = Query(None, description="Filtrer par poste"),
    team:     Optional[str]   = Query(None, description="Filtrer par équipe"),
    per_min:  Optional[float] = Query(None, description="PER minimum"),
    per_max:  Optional[float] = Query(None, description="PER maximum"),
    bpm_min:  Optional[float] = Query(None, description="BPM minimum"),
    vorp_min: Optional[float] = Query(None, description="VORP minimum"),
):
    """
    Retourne la liste des joueurs (advanced_stats) avec filtres optionnels.
    Utilisé par la page Scouting.
    """
    df = app.state.advanced_stats.copy()

    if search:
        # Recherche dans la colonne Player (supposée col index 1)
        player_name_col = df.columns[1]
        df = df[df[player_name_col].str.contains(search, case=False, na=False)]

    if pos and "Pos" in df.columns:
        df = df[df["Pos"].str.contains(pos, case=False, na=False)]

    if team and "Team" in df.columns:
        df = df[df["Team"].str.contains(team, case=False, na=False)]

    if per_min is not None and "PER" in df.columns:
        df = df[pd.to_numeric(df["PER"], errors="coerce") >= per_min]

    if per_max is not None and "PER" in df.columns:
        df = df[pd.to_numeric(df["PER"], errors="coerce") <= per_max]

    if bpm_min is not None and "BPM" in df.columns:
        df = df[pd.to_numeric(df["BPM"], errors="coerce") >= bpm_min]

    if vorp_min is not None and "VORP" in df.columns:
        df = df[pd.to_numeric(df["VORP"], errors="coerce") >= vorp_min]

    return {
        "count": len(df),
        "columns": list(df.columns),
        "players": df.to_dict(orient="records"),
    }



@app.get("/players/{slug}")
def get_player_profile(slug: str):
    try:
        result = {}

        sources = {
            "players_stats":     app.state.players_stats,
            "advanced_stats":    app.state.advanced_stats,
            "shooting":          app.state.shooting,
            "adjusted_shooting": app.state.adjusted_shooting,
        }

        found_in_any = False

        for source_name, df in sources.items():
            row = find_player(df, slug)
            if row:
                found_in_any = True

            result[source_name] = {
                "columns": list(df.columns),
                "data": row if row else {},
            }

        if not found_in_any:
            raise HTTPException(status_code=404, detail=f"Joueur '{slug}' introuvable.")

        return {
            "slug": slug,
            "sources": result,
        }

    except Exception as e:
        return {"error": str(e)}

@app.get("/team/scatter")
def get_scatter_data(
    x: str = Query(..., description="Colonne pour l'axe X"),
    y: str = Query(..., description="Colonne pour l'axe Y"),
):
    df = app.state.team_stats

    # Colonnes numériques
    numeric_cols = [
        col for col in df.columns
        if pd.to_numeric(df[col], errors="coerce").notna().sum() > 0
    ]

    print(df.columns)
    print(numeric_cols)

    if x not in df.columns:
        raise HTTPException(status_code=400, detail=f"Colonne X '{x}' inexistante.")
    if y not in df.columns:
        raise HTTPException(status_code=400, detail=f"Colonne Y '{y}' inexistante.")

    # Colonnes importantes
    team_column = "Team" if "Team" in df.columns else None
    if not team_column:
        raise HTTPException(status_code=400, detail="Colonne 'Team' introuvable.")

    # Conversion en numérique
    df[x] = pd.to_numeric(df[x], errors="coerce")
    df[y] = pd.to_numeric(df[y], errors="coerce")

    # Drop NaN
    df = df[df[team_column] != "League Average"]
    df_clean = df.dropna(subset=[x, y, team_column])
    print(len(df_clean))
    # 🔥 GROUP BY TEAM
    grouped = (
        df_clean
        .groupby(team_column)
        .agg({
            x: "sum",   # ou "mean"
            y: "sum"
        })
        .reset_index()
    )

    print("group")
    # Format pour frontend
    grouped = grouped.rename(columns={
        team_column: "team"
    })

    return {
        "numeric_columns": numeric_cols,
        "x": x,
        "y": y,
        "points": grouped.to_dict(orient="records"),
    }

    # Ajoute cet endpoint dans api.py

@app.get("/players/percentiles/{slug}")
def get_player_percentiles(slug: str):
    """
    Retourne les stats clés d'un joueur + ses percentiles
    calculés parmi les 200 joueurs avec le plus de minutes.
    """
    df = app.state.players_stats.copy()
    adv = app.state.advanced_stats.copy()

    slug_col_ps  = df.columns[1]
    slug_col_adv = adv.columns[1]

    # Top 200 par minutes jouées
    mp_col = "MP▼" if "MP▼" in df.columns else "MP"
    df[mp_col] = pd.to_numeric(df[mp_col], errors="coerce")
    top200 = df.nlargest(200, mp_col)

    # Merge avec advanced_stats
    top200_adv = adv[adv[slug_col_adv].isin(top200[slug_col_ps])]

    # Stats choisies par catégorie
    CATEGORIES = {
        "players_stats": ["PTS", "AST", "TRB", "STL", "BLK", "FG%"],
        "advanced_stats": ["PER", "TS%", "USG%", "WS", "BPM", "VORP"],
        "shooting": ["% of FGA by Distance | 2P", "% of FGA by Distance | 3P",
                     "FG% by Distance | 2P", "FG% by Distance | 3P",
                     "Corner 3s | 3P%", "% of FG Ast'd | 3P"],
        "adjusted_shooting": ["Shooting % | FG%", "Shooting % | 3P%",
                              "Shooting % | 2P%", "Shooting % | FT%",
                              "League-Adjusted | FG%", "League-Adjusted | 3P%"],
    }

    sources = {
        "players_stats":     (df,                  CATEGORIES["players_stats"]),
        "advanced_stats":    (adv,                 CATEGORIES["advanced_stats"]),
        "shooting":          (app.state.shooting,  CATEGORIES["shooting"]),
        "adjusted_shooting": (app.state.adjusted_shooting, CATEGORIES["adjusted_shooting"]),
    }

    top200_by_source = {
        "players_stats":     top200,
        "advanced_stats":    top200_adv,
        "shooting":          app.state.shooting[app.state.shooting[app.state.shooting.columns[1]].isin(top200[slug_col_ps])],
        "adjusted_shooting": app.state.adjusted_shooting[app.state.adjusted_shooting[app.state.adjusted_shooting.columns[1]].isin(top200[slug_col_ps])],
    }

    result = {}

    for source_name, (source_df, stats) in sources.items():
        slug_col_src = source_df.columns[1]
        player_row   = source_df[source_df[slug_col_src] == slug]
        top_df       = top200_by_source[source_name]

        category_result = {}
        for stat in stats:
            if stat not in source_df.columns:
                continue

            col_data = pd.to_numeric(top_df[stat], errors="coerce").dropna()
            if col_data.empty or player_row.empty:
                continue

            player_val = pd.to_numeric(player_row[stat].iloc[0], errors="coerce")
            if pd.isna(player_val):
                continue

            percentile = float((col_data < player_val).sum() / len(col_data) * 100)

            category_result[stat] = {
                "value":      round(float(player_val), 3),
                "percentile": round(percentile, 1),
                "min":        round(float(col_data.min()), 3),
                "max":        round(float(col_data.max()), 3),
            }

        result[source_name] = category_result

    return {
        "slug":    slug,
        "sources": result,
    }

# ─── Lancement ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)