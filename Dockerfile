# Self-hosted VeraFund: one container, SQLite file on a volume.
# Builds for the host architecture (amd64, or arm64 on a Jetson). From a PC you can
# cross-build: docker buildx build --platform linux/arm64 -t verafund:arm64 --load .

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next/font downloads the Google fonts here, so the build (not the runtime) needs internet.
RUN npm run build

FROM node:20-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/verafund.db \
    COOKIE_SECURE=false
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Next's file tracing misses libsql's per-platform native binary (e.g. @libsql/linux-arm64-gnu),
# so copy the whole package family that npm installed for this architecture.
COPY --from=build --chown=node:node /app/node_modules/@libsql ./node_modules/@libsql
COPY --from=build --chown=node:node /app/node_modules/libsql ./node_modules/libsql
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
