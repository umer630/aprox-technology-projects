# NEBIUS backend + web console. Runs as an unprivileged user. Needs access to a Docker engine for sandboxes
# (mount the socket or point DOCKER_HOST at a dedicated engine) — see docs/DEPLOYMENT.md for the security implications.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends docker.io git python3 ca-certificates && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 10001 nebius
WORKDIR /app
COPY backend ./backend
COPY web ./web
ENV NEBIUS_ENV=production NEBIUS_DATA_DIR=/data PORT=8090
RUN mkdir -p /data && chown nebius /data
USER nebius
EXPOSE 8090
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8090/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "backend/src/server.js"]
