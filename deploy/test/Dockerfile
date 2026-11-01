# Build on a separate Linux builder, NEVER on the production VPS.
# Use --platform matching the owner's read-only uname report.
FROM node:20.20.2-bookworm-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp/blabla-test-build
COPY package.json package-lock.json ./
COPY scripts/copy-pdf-worker.mjs scripts/copy-pdf-worker.mjs
RUN mkdir public
# The official Node image already includes matching headers. Native fallback must
# not depend on an extra download from nodejs.org when prebuild hosting is flaky.
RUN test -f /usr/local/include/node/node.h
RUN --mount=type=cache,target=/root/.npm npm_config_nodedir=/usr/local npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN node deploy/test/build-info.cjs
RUN node --import tsx scripts/test-instance.ts /tmp/blabla-test-build /tmp/blabla-test-build/test-books

FROM dependencies AS build
# Optional for arm64 builders using QEMU user emulation; not a runtime setting.
# Native amd64 builders leave it unset. Keeps the unchanged SWC binary usable.
ARG QEMU_GUEST_BASE
RUN npm test && npx tsc --noEmit && npm run lint
RUN DATABASE_PATH=/tmp/blabla-test-build/data/app.db NODE_OPTIONS=--max-old-space-size=3072 npm run build
RUN node tests/test-environment-runtime.cjs
# Export source, Linux dependencies and build; no build-time DB, passwords or uploads.
RUN mkdir /export && cp data/runtime-smoke.json /export/linux-runtime-smoke.json && cp build-info.json /export/build-info.json && tar -czf /export/blabla-test-linux.tar.gz --exclude='./data' --exclude='./public/uploads' --exclude='./.next/cache' . && cd /export && sha256sum blabla-test-linux.tar.gz > blabla-test-linux.tar.gz.sha256
FROM scratch AS artifact
COPY --from=build /export/ /
