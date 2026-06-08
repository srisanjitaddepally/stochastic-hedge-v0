from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./stochastic_hedge.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_sqlite_schema() -> None:
    """Add columns introduced after first deploy (SQLite has no ALTER IF NOT EXISTS)."""
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.connect() as conn:
        rows = conn.execute(text("PRAGMA table_info(legs)")).fetchall()
        existing = {r[1] for r in rows}
        alters = []
        if "opponent_side" not in existing:
            alters.append("ALTER TABLE legs ADD COLUMN opponent_side VARCHAR")
        if "contract_bet_side" not in existing:
            alters.append("ALTER TABLE legs ADD COLUMN contract_bet_side FLOAT")
        if "contract_opponent_side" not in existing:
            alters.append("ALTER TABLE legs ADD COLUMN contract_opponent_side FLOAT")
        if "fee_model_version" not in existing:
            alters.append("ALTER TABLE legs ADD COLUMN fee_model_version INTEGER NOT NULL DEFAULT 1")
        if "rh_fee_per_contract" not in existing:
            alters.append("ALTER TABLE legs ADD COLUMN rh_fee_per_contract FLOAT")
        if "kalshi_fee_per_contract" not in existing:
            alters.append("ALTER TABLE legs ADD COLUMN kalshi_fee_per_contract FLOAT")
        if "edge_haircut_pct" not in existing:
            alters.append("ALTER TABLE legs ADD COLUMN edge_haircut_pct FLOAT")
        for stmt in alters:
            conn.execute(text(stmt))
        if alters:
            conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
