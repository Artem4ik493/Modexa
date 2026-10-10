FROM node:24-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY localization ./localization
COPY scripts ./scripts

# The API launches the Runner from TypeScript via tsx, so the workspace
# development tools are intentionally installed in this test-deployment image.
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm build:core && pnpm build:api

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]
