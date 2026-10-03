FROM node:24-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm build:core && pnpm --filter @modexa/runner exec tsc -p tsconfig.json
CMD ["pnpm","--filter","@modexa/runner","start"]
