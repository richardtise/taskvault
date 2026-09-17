FROM node:20-alpine

WORKDIR /app

# Install production dependencies only (--omit=dev; --only=production is
# deprecated in npm 7+).
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src ./src

# logs/ must be writable by the unprivileged runtime user.
RUN mkdir -p logs && chown -R node:node /app

USER node

EXPOSE 3001

# Backend exposes GET /health; this mirrors the compose healthcheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "src/index.js"]
