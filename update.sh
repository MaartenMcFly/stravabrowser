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

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    echo "❌ Error: docker is not installed"
    exit 1
fi

# Stop containers
echo "⏸️  Stopping containers..."
docker compose down

# Pull latest code from git
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Rebuild if requested
if [ "$MODE" != "none" ]; then
    case "$MODE" in
        frontend)
            echo "🔨 Rebuilding frontend container..."
            docker compose build --no-cache frontend
            ;;
        backend)
            echo "🔨 Rebuilding backend container..."
            docker compose build --no-cache backend
            ;;
        all)
            echo "🔨 Rebuilding all containers..."
            docker compose build --no-cache
            ;;
    esac
fi

# Start containers
echo "🚀 Starting containers..."
docker compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check health
echo "🏥 Checking service health..."
docker compose ps

# Show logs
echo ""
echo "✅ Update complete! Database has been preserved in the 'strava-data' volume."
echo ""
echo "📊 View logs with: docker compose logs -f"
echo "🔍 Check status with: docker compose ps"
echo "🛑 Stop with: docker compose down"
echo ""
echo "Access the app at: http://localhost:180"
