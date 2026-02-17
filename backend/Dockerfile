FROM node:18-alpine

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --only=production

# Copy source code
COPY . .

# Create data directory for SQLite database
RUN mkdir -p data

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
