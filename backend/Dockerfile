# syntax=docker/dockerfile:1
#
# Uses node:18-slim (Debian/glibc) rather than Alpine so that better-sqlite3
# can download its pre-built glibc x64 binary instead of compiling from C++
# source. This cuts the npm install step from ~3 minutes to ~30 seconds.
# Build tools are kept as a fallback in case any other native module lacks a
# pre-built binary.
FROM node:18-slim

# Build tools — only needed as fallback; skipped automatically when pre-built
# binaries are available (which is the case for better-sqlite3 on glibc x64).
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifest first so the npm install layer is only invalidated
# when dependencies actually change.
COPY package.json ./

# Install production dependencies.
# The BuildKit cache mount persists the npm download cache across builds.
RUN --mount=type=cache,target=/root/.npm \
    npm install --only=production

# Copy source code (node_modules is excluded via .dockerignore)
COPY src ./src

# Create data directory for SQLite database
RUN mkdir -p data

EXPOSE 3000

CMD ["npm", "start"]
