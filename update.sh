#!/bin/bash

# Strava Activity Browser - Update Script
# This script updates the Docker containers while preserving the database

set -e

echo "🔄 Updating Strava Activity Browser..."

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: docker-compose is not installed"
    exit 1
fi

# Stop containers
echo "⏸️  Stopping containers..."
docker-compose down

# Pull latest code from git
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Rebuild containers
echo "🔨 Rebuilding containers..."
docker-compose build --no-cache

# Start containers
echo "🚀 Starting containers..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 5

# Check health
echo "🏥 Checking service health..."
docker-compose ps

# Show logs
echo ""
echo "✅ Update complete! Database has been preserved in the 'strava-data' volume."
echo ""
echo "📊 View logs with: docker-compose logs -f"
echo "🔍 Check status with: docker-compose ps"
echo "🛑 Stop with: docker-compose down"
echo ""
echo "Access the app at: http://localhost:180"
