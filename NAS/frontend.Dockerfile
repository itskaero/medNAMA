FROM node:22-bookworm-slim AS build

ARG REPO_URL=https://github.com/mhhassaan/medNAMA.git
ARG REPO_REF=main

WORKDIR /src

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch "${REPO_REF}" "${REPO_URL}" .

WORKDIR /src/frontend

# Make browser API calls relative to the current host.
# This changes:
#   http://localhost:8000
# into:
#   ""
RUN sed -i 's#http://localhost:8000##g' src/lib/constants.ts

RUN cat > next.config.ts <<'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // The rewrite proxy drops requests after 30 s by default, which cut off
  // AI chat answers and quiz generation mid-flight ("Failed to fetch").
  experimental: {
    proxyTimeout: 180_000,
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://backend:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
EOF

RUN npm install && npm run build


FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=build /src/frontend/.next/standalone ./
COPY --from=build /src/frontend/.next/static ./.next/static
COPY --from=build /src/frontend/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
