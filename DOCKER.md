# Docker Deployment Guide

This guide explains how to run the Strava Activity Browser using Docker.

## Prerequisites

- Docker installed (https://docs.docker.com/get-docker/)
- Docker Compose installed (usually comes with Docker Desktop)
- Strava API credentials (https://www.strava.com/settings/api)

## Initial Setup

### 1. Configure Environment Variables

Create the backend `.env` file:

```bash
cp .env.docker.example backend/.env
```

Edit `backend/.env` and add your Strava credentials:

```env
STRAVA_CLIENT_ID=your_actual_client_id
STRAVA_CLIENT_SECRET=your_actual_client_secret
STRAVA_REDIRECT_URI=http://localhost/auth/callback
SESSION_SECRET=your_generated_secret_here
```

**Generate a secure session secret:**
```bash
openssl rand -hex 32
```

### 2. Update Strava API Settings

Go to https://www.strava.com/settings/api and update your application:
- **Authorization Callback Domain**: `localhost`

### 3. Build and Start

```bash
docker-compose up -d
```

This will:
- Build the backend Node.js application
- Build and serve the frontend with nginx
- Create a persistent volume for the SQLite database
- Start both services

### 4. Access the Application

Open your browser and go to:
**http://localhost**

## Docker Commands

### View Logs
```bash
# All services
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend
```

### Check Status
```bash
docker-compose ps
```

### Stop Application
```bash
docker-compose down
```

### Restart Services
```bash
docker-compose restart
```

### Stop and Remove Everything (except database)
```bash
docker-compose down
```

### Stop and Remove Everything (including database)
```bash
docker-compose down -v
```

## Updating the Application

When you want to update to the latest version from GitHub:

```bash
./update.sh
```

This script will:
1. Stop the running containers
2. Pull the latest code from GitHub
3. Rebuild the containers
4. Start the services
5. **Preserve your database** (it's stored in a Docker volume)

### Manual Update Process

If you prefer to update manually:

```bash
# Stop containers
docker-compose down

# Pull latest code
git pull origin main

# Rebuild containers
docker-compose build --no-cache

# Start containers
docker-compose up -d
```

## Database Persistence

The SQLite database is stored in a Docker volume named `strava-data`. This means:

✅ **Database persists** when you:
- Stop containers (`docker-compose down`)
- Rebuild containers (`docker-compose build`)
- Update the application (`./update.sh`)
- Restart your computer

❌ **Database is deleted** when you:
- Remove volumes (`docker-compose down -v`)
- Manually delete the volume (`docker volume rm stravabrowser_strava-data`)

### Backup Database

To backup your database:

```bash
docker run --rm -v stravabrowser_strava-data:/data -v $(pwd):/backup alpine tar czf /backup/strava-backup.tar.gz -C /data .
```

### Restore Database

To restore from backup:

```bash
docker run --rm -v stravabrowser_strava-data:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/strava-backup.tar.gz"
```

## Troubleshooting

### Port Already in Use

If port 80 or 3000 is already in use, edit `docker-compose.yml`:

```yaml
services:
  backend:
    ports:
      - "3001:3000"  # Change 3000 to another port

  frontend:
    ports:
      - "8080:80"    # Change 80 to another port
```

Then update your Strava redirect URI to match the new port.

### Cannot Connect to Backend

Check if both services are running:
```bash
docker-compose ps
```

Check logs for errors:
```bash
docker-compose logs backend
```

### Database Issues

View database location:
```bash
docker volume inspect stravabrowser_strava-data
```

Check database file inside container:
```bash
docker exec stravabrowser-backend ls -lah /app/data
```

### Rebuild from Scratch

```bash
# Stop and remove everything
docker-compose down -v

# Remove images
docker-compose rm -f
docker rmi stravabrowser-backend stravabrowser-frontend

# Rebuild
docker-compose up -d --build
```

## Production Deployment

For production deployment:

1. **Use HTTPS**: Put the app behind a reverse proxy (nginx, Caddy, Traefik)
2. **Update environment variables**:
   ```env
   NODE_ENV=production
   FRONTEND_URL=https://yourdomain.com
   STRAVA_REDIRECT_URI=https://yourdomain.com/auth/callback
   ```
3. **Update Strava settings** with your production domain
4. **Set up automatic backups** of the database volume
5. **Use Docker secrets** instead of .env files for sensitive data
6. **Monitor logs** and set up health checks

## Architecture

```
┌─────────────────────────────────────────┐
│           Docker Host                    │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  Frontend (nginx:alpine)           │ │
│  │  Port 80                           │ │
│  │  - Serves Vue.js app               │ │
│  │  - Proxies /api to backend         │ │
│  └────────────────────────────────────┘ │
│               ↓ HTTP                     │
│  ┌────────────────────────────────────┐ │
│  │  Backend (node:18-alpine)          │ │
│  │  Port 3000                         │ │
│  │  - Express server                  │ │
│  │  - OAuth flow                      │ │
│  │  - Strava API proxy                │ │
│  └────────────────────────────────────┘ │
│               ↓                          │
│  ┌────────────────────────────────────┐ │
│  │  Volume: strava-data               │ │
│  │  /app/data/strava_cache.db         │ │
│  │  - Persistent SQLite database      │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## Support

If you encounter issues:

1. Check the logs: `docker-compose logs -f`
2. Verify environment variables in `backend/.env`
3. Ensure Strava API settings match your configuration
4. Check Docker and Docker Compose are up to date
