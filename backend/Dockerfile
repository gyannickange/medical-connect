# Build context is the repo root (see docker-compose.prod.yml): backend's
# vite.config.js builds the frontend by pointing its Vite root at ../frontend,
# so both workspaces need to be present side by side for the build.

FROM node:22-bookworm-slim AS deps
WORKDIR /workspace
COPY frontend/package.json frontend/package-lock.json frontend/
COPY backend/package.json backend/package-lock.json backend/
RUN npm ci --prefix frontend && npm ci --prefix backend

FROM deps AS build
COPY frontend frontend
COPY backend backend
WORKDIR /workspace/backend
# nest-cli.json sets deleteOutDir:true, so `nest build` wipes ./dist before
# recompiling - it must run before the Vite client build, or the client
# build's output (dist/public) would be deleted right after.
RUN npm run build && npm run build:client

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 1001 nestjs \
  && useradd --system --uid 1001 --gid nestjs nestjs
# vite.service.ts imports "vite" unconditionally at module scope (it's only
# used on the dev branch), so it must still resolve at runtime - keep the
# full node_modules (incl. devDependencies) rather than a pruned prod install.
COPY --from=build /workspace/backend/node_modules ./node_modules
COPY --from=build /workspace/backend/dist ./dist
COPY --from=build /workspace/backend/package.json ./package.json
USER nestjs
EXPOSE 5200
CMD ["node", "dist/main"]
