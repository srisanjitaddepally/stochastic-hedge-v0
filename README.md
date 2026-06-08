# Stochastic Hedge MVP

Practice-first manual paper trading terminal for multi-event hedging with realistic fee assumptions.

## Stack
- Frontend: Next.js + Tailwind
- Backend: FastAPI + SQLite

## Run backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

On startup the API runs a small SQLite migration so existing `stochastic_hedge.db` files gain new leg columns (opponent + contract prices). Restart the server after pulling updates.

## Run frontend
```bash
cd frontend
npm install
npm run dev
```

Set frontend API base URL if needed:
```bash
export NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Included MVP features
- Multi-event active/settled lifecycle
- Manual leg entry with net-payout or odds mode
- Fee-aware hedge guidance (conservative/moderate/aggressive)
- Minimum feasible odds and best-odds suggestion
- Portfolio summary for active risk and realized outcomes
