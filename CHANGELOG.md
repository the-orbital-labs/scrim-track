# Changelog

All notable changes to ScrimTrack will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-08-03

### Added

- Added a ScrimTrack tab alongside Scrimba's dashboard tabs.
- Embedded the complete ScrimTrack dashboard directly in Scrimba's main content area.
- Added a draggable floating tracking widget in both its expanded and collapsed states.
- Saved the floating widget's position locally across page reloads.

### Changed

- Constrained the floating widget to the visible viewport after dragging, resizing,
  collapsing, or expanding it.
- Updated the extension screenshots and README gallery to show the latest Scrimba
  integration.

### Fixed

- Made the embedded dashboard replace Scrimba's main dashboard content instead of
  appearing as an overlay.
- Prevented storage reads and writes after the extension context is invalidated.
- Suppressed expected context-invalidation warnings while preserving genuine
  storage error reporting.

## [0.1.1] - 2026-07-28

### Fixed

- Corrected activity heatmap tooltip positioning and stacking.

## [0.1.0] - 2026-06-10

### Added

- Added local-first active learning-time tracking for supported Scrimba pages.
- Added daily, weekly, monthly, streak, and all-time learning statistics.
- Added the activity heatmap, daily goals, manual path setup, and finish-date
  projection.
- Added local JSON export and reset controls.
- Limited extension host access to `https://scrimba.com/*` and
  `https://v2.scrimba.com/*`.

