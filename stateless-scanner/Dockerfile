FROM node:22-alpine

WORKDIR /app

# Copy package files first to leverage Docker layer caching
# npm install will only re-run when package.json or package-lock.json changes
COPY package*.json ./

# Install only production dependencies (omit devDependencies)
RUN npm install --omit=dev

# Copy source code with correct ownership (non-root node user)
COPY --chown=node:node src ./src

# Security: run as non-root user
USER node

EXPOSE 8080

CMD ["node", "src/index.js"]