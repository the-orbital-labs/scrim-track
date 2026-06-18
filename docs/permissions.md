# Permissions

Scrimba Learning Tracker requests the minimum permissions needed for the MVP.

## Requested Permissions

- `storage`: Saves daily activity, sessions, streaks, settings, and path projection data locally with `chrome.storage.local`.
- `https://scrimba.com/*`: Allows the extension to run its content script on Scrimba pages so it can track active learning time.
- `https://v2.scrimba.com/*`: Allows the same tracking on Scrimba's v2 site.

## Permissions Not Requested

The extension does not request browsing history, tabs, bookmarks, cookies, `webRequest`, `browsingData`, or `<all_urls>` access.

The MVP does not create accounts, use a backend server, or send learning activity to external analytics by default.
