#!/bin/sh
# Container entrypoint: migrate, run the background worker, serve the API.
# Set RUN_WORKER_IN_API=0 when a separate worker service runs
# `arq app.workers.main.WorkerSettings` instead.
set -e
alembic upgrade head
if [ "${RUN_WORKER_IN_API:-1}" = "1" ]; then
  (
    while true; do
      arq app.workers.main.WorkerSettings || true
      echo "worker exited; restarting in 5s" >&2
      sleep 5
    done
  ) &
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}"
