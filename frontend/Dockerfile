# ============================================================
# PFS Frontend — Docker Image
# Node 18 Alpine: small, fast, production-ready
# ============================================================

FROM node:18-alpine AS base
WORKDIR /app

# ── Install dependencies ──────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm install --omit=dev

# ── Final image ───────────────────────────────────────────────
FROM base AS runner

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S nodeuser -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=nodeuser:nodejs . .

USER nodeuser

EXPOSE 8080

ENV NODE_ENV=production \
    PORT=8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "server.js"]
