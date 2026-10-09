FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.6.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY localization ./localization

RUN pnpm install --frozen-lockfile
RUN pnpm build:core && pnpm build:api

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["pnpm", "--filter", "@modexa/api", "start"]
