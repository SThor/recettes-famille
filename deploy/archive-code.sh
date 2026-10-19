#!/usr/bin/env bash
# Écrit sur la sortie standard l'archive du code à déployer (utilisée par deploy.sh et par GitHub Actions).
set -euo pipefail
cd "$(dirname "$0")/.."
tar -czf - package.json package-lock.json Dockerfile .dockerignore docker-compose.yml .env.example src public deploy
