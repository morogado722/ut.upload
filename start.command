#!/bin/bash
# Local-only launcher for macOS / Linux. An internet connection is needed once
# to install the pinned Python packages. No API call is made by this script.
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.11 이상을 설치한 뒤 다시 실행해 주세요."
  exit 1
fi
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -r requirements.txt
if [ ! -e .env ]; then cp .env.example .env; fi
echo ""
echo "모로가도 — 브라우저에서 http://127.0.0.1:8000 을 열어 주세요."
echo "AI 키가 없어도 파일 기본 정보 분석은 사용할 수 있어요."
echo "종료하려면 이 창에서 Ctrl+C 를 누르세요."
echo ""
exec .venv/bin/python server.py
