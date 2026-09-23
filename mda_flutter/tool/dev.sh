#!/usr/bin/env bash
# Quick launcher for auto-watching Flutter app during development and AI agent edits
cd "$(dirname "$0")/.." || exit 1
dart run tool/dev_watch.dart "$@"
