FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@10.17.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/platform/package.json apps/platform/package.json
COPY apps/marketing/package.json apps/marketing/package.json
COPY apps/private-document-scanner/package.json apps/private-document-scanner/package.json
RUN pnpm install --frozen-lockfile
COPY apps apps
COPY packages packages
COPY tsconfig.json ./
RUN PROINSPECT_RUNTIME=node-proof pnpm --dir apps/platform exec react-router build

FROM node:22.23.2-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 FOUNDATION_PROOF=true
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/platform/build ./apps/platform/build
COPY --from=build --chown=node:node /app/apps/platform/node/server.mjs ./apps/platform/node/server.mjs
USER node
EXPOSE 8080
CMD ["node", "apps/platform/node/server.mjs"]
