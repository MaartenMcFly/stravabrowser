# syntax=docker/dockerfile:1
FROM node:18-alpine

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies.
# The BuildKit cache mount persists the npm download cache across builds so
# better-sqlite3's pre-built binary is reused and never recompiled from source,
# even when --no-cache is passed to docker build.
RUN --mount=type=cache,target=/root/.npm \
    npm install --only=production

# Copy source code
COPY . .

# Create data directory for SQLite database
RUN mkdir -p data

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
