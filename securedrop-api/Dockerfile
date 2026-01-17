FROM node:24.12.0-slim

# 1. Install 'tini' for proper signal handling (PID 1)
RUN apt-get update && apt-get install -y tini && rm -rf /var/lib/apt/lists/*

# CHANGED: Tini is located at /usr/bin/tini on Debian (it was /sbin/tini on Alpine)
ENTRYPOINT ["/usr/bin/tini", "--"]

WORKDIR /app

# 2. Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# 3. Copy source code with correct ownership
COPY --chown=node:node src ./src

# 4. Security: Switch to non-root user 'node'
USER node

EXPOSE 3001

# 5. Run Node directly
CMD ["node", "src/index.js"]