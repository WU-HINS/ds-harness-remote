FROM node:22-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/package.json
COPY server/package.json server/package.json
RUN pnpm --filter @dsh-remote/server... install --frozen-lockfile --ignore-scripts

COPY packages/protocol/src packages/protocol/src
COPY packages/protocol/tsconfig.json packages/protocol/tsconfig.json
COPY server/src server/src
COPY server/tsconfig.json server/tsconfig.json
RUN pnpm --filter @dsh-remote/protocol build \
    && pnpm --filter @dsh-remote/server build \
    && pnpm --filter @dsh-remote/server deploy --prod /out

# Copy the compiled protocol package explicitly: the deploy snapshot is taken
# before protocol/dist exists, and COPY preserves source modes (including 000).
RUN rm -rf /out/node_modules/@dsh-remote/protocol \
    && mkdir -p /out/node_modules/@dsh-remote/protocol \
    && cp packages/protocol/package.json /out/node_modules/@dsh-remote/protocol/ \
    && cp -R packages/protocol/dist /out/node_modules/@dsh-remote/protocol/dist \
    && chmod -R a+rX /out

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    DSH_SERVER_HOST=0.0.0.0 \
    DSH_SERVER_PORT=8080

WORKDIR /app
COPY --from=build --chown=node:node /out/ ./
USER node
# Validate the module graph without booting the server (main.ts connects to Postgres).
RUN node --input-type=module -e "await import('./dist/app.js')"

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.DSH_SERVER_PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
