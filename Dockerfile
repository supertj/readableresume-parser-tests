# Pinned environment for reproducing ReadableResume's parser results.
# OpenResume is pinned by the git submodule commit; everything else by version here.
FROM node:20.18.1-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git make ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# uv installs the exact Python and packages recorded in uv.lock
COPY --from=ghcr.io/astral-sh/uv:0.12.21 /uv /usr/local/bin/uv

WORKDIR /work
COPY parser/package.json parser/package-lock.json parser/
RUN cd parser && npm ci --no-audit --no-fund
COPY pyproject.toml uv.lock .python-version* ./
RUN uv sync --frozen --python 3.12

COPY . .
CMD ["make", "check"]
