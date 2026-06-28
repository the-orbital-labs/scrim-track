# ScrimTrack

ScrimTrack is an unofficial open-source Chrome extension for Scrimba learners.

It tracks your active learning time on Scrimba, shows daily/weekly/monthly progress, builds streaks, displays a GitHub-style learning heatmap, and estimates your finish date based on your pace.

## Install

Install ScrimTrack from the Chrome Web Store:

https://chromewebstore.google.com/detail/scrimtrack/akjmadgnfokenilllgienlgedemaaidh

## Features

* Track active Scrimba learning time
* View daily, weekly, and monthly progress
* Build learning streaks
* See your activity in a GitHub-style heatmap
* Estimate your finish date based on your current pace
* Store learning data locally in your browser

## Privacy

ScrimTrack is privacy-friendly by default.

* Learning data stays on your device in `chrome.storage.local`.
* ScrimTrack does not require accounts or authentication.
* ScrimTrack does not send learning data to a backend server.
* External analytics are not enabled by default.
* ScrimTrack only tracks activity on supported Scrimba URLs.

## Permissions

ScrimTrack requests limited permissions:

* `storage` is used to save activity, sessions, streaks, settings, and path projection data locally.
* Scrimba host access is limited to:

  * `https://scrimba.com/*`
  * `https://v2.scrimba.com/*`

ScrimTrack does **not** request access to:

* browsing history
* tabs
* bookmarks
* cookies
* `webRequest`
* `browsingData`
* `<all_urls>`

## Disclaimer

ScrimTrack is an unofficial project and is not affiliated with, endorsed by, or sponsored by Scrimba.

## License

MIT
