#!/bin/bash

# Strava Activity Browser - Update Script
# This script updates the Docker containers while preserving the database
#
# Usage:
#   ./update.sh           - Pull code and restart (no rebuild)
#   ./update.sh frontend  - Pull code and rebuild frontend container
#   ./update.sh backend   - Pull code and rebuild backend container
#   ./update.sh all       - Pull code and rebuild all containers

set -e

# Parse argument
MODE="${1:-none}"

case "$MODE" in
    none)
        echo "🔄 Updating Strava Activity Browser (no rebuild)..."
        ;;
    frontend)
        echo "🔄 Updating Strava Activity Browser (rebuild frontend)..."
        ;;
    backend)
        echo "🔄 Updating Strava Activity Browser (rebuild backend)..."
        ;;
    all)
        echo "🔄 Updating Strava Activity Browser (rebuild all)..."
        ;;
    *)
        echo "❌ Invalid argument: $MODE"
        echo ""
        echo "Usage:"
        echo "  ./update.sh           - Pull code and restart (no rebuild)"
        echo "  ./update.sh frontend  - Pull code and rebuild frontend"
        echo "  ./update.sh backend   - Pull code and rebuild backend"
        echo "  ./update.sh all       - Pull code and rebuild all containers"
        exit 1
        ;;
esac

# Detect docker compose command (V2 plugin vs V1 standalone)
if docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ Error: neither 'docker compose' nor 'docker-compose' is available"
    exit 1
fi

echo "ℹ️  Using: $DOCKER_COMPOSE"

# Enable BuildKit so --mount=type=cache in the backend Dockerfile is honoured.
# This keeps the npm download cache across builds, meaning better-sqlite3's
# pre-built binary is reused and never recompiled from source.
export DOCKER_BUILDKIT=1

# Stop containers
echo "⏸️  Stopping containers..."
$DOCKER_COMPOSE down

# Pull latest code from git
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Rebuild if requested
if [ "$MODE" != "none" ]; then
    case "$MODE" in
        frontend)
            echo "🔨 Rebuilding frontend container..."
            $DOCKER_COMPOSE build --no-cache frontend
            ;;
        backend)
            echo "🔨 Rebuilding backend container..."
            $DOCKER_COMPOSE build --no-cache backend
            ;;
        all)
            echo "🔨 Rebuilding all containers..."
            # Frontend: always clean (no native compilation, fast)
            # Backend: use layer cache to avoid recompiling better-sqlite3 from source
            $DOCKER_COMPOSE build --no-cache frontend
            $DOCKER_COMPOSE build backend
            ;;
    esac
fi

# Start containers
echo "🚀 Starting containers..."
$DOCKER_COMPOSE up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check health
echo "🏥 Checking service health..."
$DOCKER_COMPOSE ps

# Show logs
echo ""
echo "✅ Update complete! Database has been preserved in the 'strava-data' volume."
echo ""
echo "📊 View logs with: $DOCKER_COMPOSE logs -f"
echo "🔍 Check status with: $DOCKER_COMPOSE ps"
echo "🛑 Stop with: $DOCKER_COMPOSE down"
echo ""
echo "Access the app at: http://localhost:180"
