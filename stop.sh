#!/usr/bin/env bash

echo "Stopping DailyLogs application..."

# 1. Terminate backend processes on port 5080
backend_pids=$(lsof -t -i :5080)
if [ -n "$backend_pids" ]; then
  echo "Killing backend processes on port 5080..."
  echo "$backend_pids" | xargs kill -9 2>/dev/null
fi

# 2. Terminate frontend processes on port 3080
frontend_pids=$(lsof -t -i :3080)
if [ -n "$frontend_pids" ]; then
  echo "Killing frontend processes on port 3080..."
  echo "$frontend_pids" | xargs kill -9 2>/dev/null
fi

# 3. Stop Docker containers
echo "Stopping Docker containers via docker compose..."
docker compose down

echo "All services stopped successfully."
