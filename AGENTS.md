# AGENTS.md

## Project

Scrimba Learning Tracker is a Chrome Extension Manifest V3 app that tracks active learning time on Scrimba, shows daily/weekly/monthly stats, builds streaks, displays a GitHub-style heatmap, and estimates finish date based on pace.

## Stack

- TypeScript
- React
- Vite
- Tailwind CSS
- Chrome Extension Manifest V3
- chrome.storage.local
- date-fns

## Rules

- Keep the product local-first.
- Do not add a backend unless explicitly asked.
- Track only Scrimba URLs:
  - https://scrimba.com/*
  - https://v2.scrimba.com/*
- Do not request broad browser permissions.
- Keep permissions minimal.
- Prefer simple, readable code.
- Build features milestone by milestone.
- Do not implement unrelated features.
- Do not add AI features.
- Do not add social features.
- Do not add authentication.

## MVP Features

- Active Scrimba time tracking
- Daily, weekly, monthly totals
- Daily learning goal
- Current streak
- Longest streak
- Contribution heatmap
- Manual path setup
- Finish-date projection
- Local data export/reset

## Development

After code changes, run:

```bash
npm run build