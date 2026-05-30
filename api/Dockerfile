FROM node:24.12.0-slim

# Install tini for proper signal handling (PID 1 process manager)
# Ensures graceful shutdown and correct zombie process reaping
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
    
WORKDIR /app

# Copy only package files first to leverage Docker layer caching
# npm ci will only re-run when package.json or package-lock.json changes
COPY package*.json ./
RUN npm ci --only=production

# Copy source code with correct ownership (non-root node user)
COPY --chown=node:node src ./src

# Security: run as non-root user
USER node

EXPOSE 3001

#tini as entrypoint ensures signals (SIGTERM/SIGINT) are forwarded correctly to node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]