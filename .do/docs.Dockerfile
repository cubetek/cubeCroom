FROM node:22-bookworm-slim AS build
WORKDIR /workspace
ENV CI=true NEXT_TELEMETRY_DISABLED=1

# Read the existing package-manager pin without making the root a workspace importer.
# pnpm installs root dependencies even with --filter; those include desktop packaging.
COPY package.json /tmp/cubecroom-package.json
RUN corepack enable && corepack prepare "$(node -p "require('/tmp/cubecroom-package.json').packageManager")" --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/docs/package.json ./apps/docs/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
# The hoisted linker traverses unrelated lockfile entries; isolate the selected graph.
# Shared contracts use ambient platform types, so expose only @types at the root.
RUN pnpm --filter @cubecroom/docs... install --frozen-lockfile --ignore-scripts --config.node-linker=isolated --public-hoist-pattern='@types/*'

COPY . .
RUN node -e "if (process.versions.node.split('.')[0] !== require('node:fs').readFileSync('.nvmrc', 'utf8').trim()) throw new Error('Update the Docker base to match .nvmrc')"
# The subset is already installed; pnpm 11 must not auto-install the restored root.
RUN pnpm --config.verify-deps-before-run=false --filter @cubecroom/docs run postinstall
RUN pnpm --config.verify-deps-before-run=false --filter @cubecroom/docs... --recursive run build
RUN node scripts/deploy-docs-check.mjs

# App Platform extracts static assets. No Node server, process, or port is deployed.
FROM scratch AS static
COPY --from=build /workspace/apps/docs/out /apps/docs/out
