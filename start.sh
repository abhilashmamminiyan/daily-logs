#!/usr/bin/env bash

# Load environment variables from root .env if it exists
if [ -f .env ]; then
  echo "Loading environment variables from .env..."
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip comments and empty lines
    if [[ ! "$line" =~ ^# ]] && [[ "$line" =~ = ]]; then
      # Extract key and value
      key=$(echo "$line" | cut -d'=' -f1 | xargs)
      value=$(echo "$line" | cut -d'=' -f2- | xargs)
      # Remove quotes if present
      value="${value%\"}"
      value="${value#\"}"
      value="${value%\'}"
      value="${value#\'}"
      export "$key=$value"
    fi
  done < .env
fi

# Set default ports to prevent conflicts
export PORT=5080
export BACKEND_URL=http://localhost:5080

# 1. Check if Docker daemon is running
if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Starting Docker Desktop..."
  open -a Docker
  
  TIMEOUT=60
  COUNTER=0
  while ! docker info >/dev/null 2>&1; do
    if [ $COUNTER -ge $TIMEOUT ]; then
      echo "Error: Docker daemon failed to start within $TIMEOUT seconds."
      exit 1
    fi
    echo "Waiting for Docker daemon to become ready... ($((TIMEOUT - COUNTER))s remaining)"
    sleep 3
    COUNTER=$((COUNTER + 3))
  done
  echo "Docker daemon is ready."
fi

# 2. Start MongoDB docker container
echo "Starting MongoDB container..."
docker compose up -d

# 3. Wait for MongoDB to accept connections
MONGO_USER=${MONGO_INITDB_ROOT_USERNAME:-admin}
MONGO_PASS=${MONGO_INITDB_ROOT_PASSWORD:-supersecretpassword}

echo "Waiting for MongoDB to be ready to accept connections..."
DB_TIMEOUT=45
DB_COUNTER=0
until docker exec daily_logs_mongodb mongosh -u "$MONGO_USER" -p "$MONGO_PASS" --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1; do
  if [ $DB_COUNTER -ge $DB_TIMEOUT ]; then
    echo "Error: MongoDB container failed to become ready within $DB_TIMEOUT seconds."
    exit 1
  fi
  echo "MongoDB is starting... ($((DB_TIMEOUT - DB_COUNTER))s remaining)"
  sleep 2
  DB_COUNTER=$((DB_COUNTER + 2))
done
echo "MongoDB is ready and accepting connections!"

# 4. Verify node_modules in both subdirectories
if [ ! -d "daily-logs-backend/node_modules" ]; then
  echo "daily-logs-backend/node_modules not found. Installing backend dependencies..."
  (cd daily-logs-backend && npm install)
fi

if [ ! -d "daily-logs-frontend/node_modules" ]; then
  echo "daily-logs-frontend/node_modules not found. Installing frontend dependencies..."
  (cd daily-logs-frontend && npm install)
fi

# 5. Start Backend and Frontend in parallel with colorized log prefixes
echo "Starting backend and frontend services..."
echo "Frontend URL: http://localhost:3080"
echo "Backend URL:  http://localhost:5080"
echo "Press Ctrl+C to stop all services"
echo "--------------------------------------------------"

# Start Backend on port 5080
(cd daily-logs-backend && exec npm run start:dev) 2>&1 | awk '{print "\033[32m[backend]\033[0m  " $0; fflush()}' &
BACKEND_PID=$!

# Start Frontend on port 3080 proxying to backend on port 5080
(cd daily-logs-frontend && PORT=3080 exec npm run dev) 2>&1 | awk '{print "\033[36m[frontend]\033[0m " $0; fflush()}' &
FRONTEND_PID=$!

# Cleanup function to kill processes and release ports on script termination
cleanup() {
  echo -e "\nStopping backend and frontend services..."
  
  # Terminate processes on ports 3080 and 5080
  local backend_pids=$(lsof -t -i :5080)
  if [ -n "$backend_pids" ]; then
    echo "Stopping backend processes on port 5080..."
    echo "$backend_pids" | xargs kill -9 2>/dev/null
  fi
  
  local frontend_pids=$(lsof -t -i :3080)
  if [ -n "$frontend_pids" ]; then
    echo "Stopping frontend processes on port 3080..."
    echo "$frontend_pids" | xargs kill -9 2>/dev/null
  fi
  
  # Kill background pipeline processes (awk)
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  
  echo "Services stopped successfully."
  exit 0
}

# Trap terminal signals
trap cleanup SIGINT SIGTERM EXIT

# Wait for background services to complete
wait $BACKEND_PID $FRONTEND_PID
