#!/bin/zsh
set -e
ROOT="/Users/caiwenbin/OSSA"
if ! curl -sf -m 2 http://127.0.0.1:4399/health >/dev/null; then
  cd "$ROOT/vendor/60s"
  nohup env PORT=4399 bun run bun.ts >> /tmp/ossa-60s.log 2>&1 &
  echo "已启动热榜 4399"
fi
if ! curl -sf -m 2 http://127.0.0.1:4319/ >/dev/null; then
  cd "$ROOT"
  nohup bun run app/server.ts >> /tmp/ossa-app.log 2>&1 &
  echo "已启动工作台 4319"
fi
echo "打开 http://127.0.0.1:4319"
open "http://127.0.0.1:4319"
