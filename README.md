# Scrimba Learning Tracker

A Chrome extension that tracks active learning time on Scrimba, shows daily/weekly/monthly progress, builds streaks, displays a heatmap, and estimates finish date based on pace.

MVP:
- Track active Scrimba time
- Store data locally
- Show popup stats
- Build streaks
- Show heatmap
- Add dashboard

Privacy:
- Learning data stays on the user's device in `chrome.storage.local`.
- The MVP does not require accounts or authentication.
- The MVP does not send learning data to a backend server.
- External analytics are not enabled by default.

Permissions:
- `storage` saves activity, sessions, streaks, settings, and path projection data locally.
- Scrimba host access is limited to `https://scrimba.com/*` and `https://v2.scrimba.com/*`.
- The extension does not request browsing history, tabs, bookmarks, cookies, `webRequest`, `browsingData`, or `<all_urls>` access.
