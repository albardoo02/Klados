# Multi-stage Dockerfile for Klados Next.js Web Frontend
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm matching project packageManager
RUN npm install -g pnpm@12.4.2

# Copy package dependency manifests
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@12.4.2

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL=/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG INTERNAL_API_URL=http://klados-api:8080/v1
ENV INTERNAL_API_URL=$INTERNAL_API_URL

RUN pnpm build

# Production image, copy standalone output and run
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server output and static assets (supporting both monorepo and standalone layouts)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/public ./apps/web/public

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "TARGET_BACKEND=$(echo \"${INTERNAL_API_URL:-http://klados-api:8080/v1}\" | sed -e 's|/v1/\\?$||'); find /app -name routes-manifest.json -exec sed -i \"s|http://127.0.0.1:8080|${TARGET_BACKEND}|g; s|http://klados-api:8080|${TARGET_BACKEND}|g\" {} +; ENTRY=$(find /app -name server.js | head -n 1); if [ -n \"$ENTRY\" ]; then DIR=$(dirname \"$ENTRY\"); mkdir -p \"$DIR/.next\"; cp -rn /app/.next/static \"$DIR/.next/\" 2>/dev/null || true; cp -rn /app/public \"$DIR/\" 2>/dev/null || true; echo \"Starting Next.js server from $DIR\"; cd \"$DIR\" && exec node server.js; else echo \"server.js not found under /app:\"; ls -laR /app; exit 1; fi"]
