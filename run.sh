#!/usr/bin/env bash

set -e

echo "=== Cogent-X ==="

# Python command
PYTHON_CMD=$(command -v python3 || command -v python)
if [ -z "$PYTHON_CMD" ]; then
    echo "Error: Python not found"
    exit 1
fi

echo "Using Python: $($PYTHON_CMD --version)"

# Virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    $PYTHON_CMD -m venv venv
fi

echo "Activating virtual environment..."
if [ -f "venv/Scripts/activate" ]; then
    source venv/Scripts/activate
else
    source venv/bin/activate
fi

# Install UV and dependencies
echo "Installing UV..."
pip install -q --upgrade uv

echo "Installing backend dependencies..."
cd backend && uv pip install -q -r requirements.txt && cd ..

echo "Installing frontend dependencies..."
if command -v bun &> /dev/null; then
    bun install
else
    npm install
fi

# Clear ports
echo "Clearing ports..."
lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:8080 2>/dev/null | xargs kill -9 2>/dev/null || true

# Start services
echo "Starting backend..."
(cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000 --log-level warning) &
BACKEND_PID=$!

sleep 2

echo "Starting frontend..."
if command -v bun &> /dev/null; then
    bun run dev &
else
    npm run dev &
fi
FRONTEND_PID=$!

sleep 2

echo ""
echo "=== Services Running ==="
echo "Frontend: http://localhost:8080"
echo "Backend:  http://localhost:8000"
echo "API Docs: http://localhost:8000/api/docs"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Cleanup
cleanup() {
    echo "Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    echo "Services stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

wait
