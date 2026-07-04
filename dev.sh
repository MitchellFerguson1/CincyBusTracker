#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "Stopping servers…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "Starting CincyBusTrackr dev servers…"

# Backend
cd "$ROOT/backend"
echo "  Installing backend dependencies…"
python3 -m pip install -q -r requirements.txt
python3 -m uvicorn app.main:app --port 8000 &
BACKEND_PID=$!

# Wait for backend to be ready before starting frontend
echo "  Waiting for backend…"
until curl -sf http://localhost:8000/api/health > /dev/null 2>&1; do
  sleep 1
done
echo "  Backend ready."

# Frontend
cd "$ROOT/frontend"
echo "  Installing frontend dependencies…"
npm install --silent
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:8000/api/health"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl-C to stop."

wait
