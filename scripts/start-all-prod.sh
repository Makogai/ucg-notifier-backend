#!/bin/sh
# Run API + BullMQ worker + posts-only scheduler in one container (e.g. single Coolify service).
# Tradeoff: shared logs, one crash policy; for clearer ops use 3 services instead.
set -eu

trap 'kill 0' INT TERM

node dist/index.js &
node dist/workers/scraperWorker.js &
node dist/jobs/schedulerPostsOnly.js &

wait
