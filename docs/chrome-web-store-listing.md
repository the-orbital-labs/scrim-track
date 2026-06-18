# Chrome Web Store Listing Draft

## Summary

Track active Scrimba learning time locally in your browser.

## Description

Scrimba Learning Tracker helps you understand your learning pace while keeping your data on your device. It tracks active study time on Scrimba, shows daily, weekly, and monthly totals, builds streaks, displays a contribution-style heatmap, and estimates a finish date based on your current pace.

Privacy-first MVP:

- Learning activity is stored locally with `chrome.storage.local`.
- No account is required.
- No backend server is used.
- No learning data is sent to a server.
- No external analytics are enabled by default.
- The extension only runs on `https://scrimba.com/*` and `https://v2.scrimba.com/*`.

You can export your local data as JSON or reset it from the extension settings.

## Permissions

- `storage`: Saves activity, sessions, streaks, settings, and path projection data locally on the user's device.
- `https://scrimba.com/*` and `https://v2.scrimba.com/*`: Runs the tracker only on Scrimba pages.

The extension does not request browsing history, tabs, bookmarks, cookies, `webRequest`, `browsingData`, or `<all_urls>` access.

## Data Practices

Scrimba Learning Tracker stores learning activity, sessions, streaks, settings, and path projection data locally on the user's device. The extension does not sell, transfer, or remotely process learning data.
