# Rtranslate · v0.0.1-alpha.1

Initial public Foxmori alpha, 2026-11-05. Extension manifest version: `0.0.1`.

## Included

- Bilingual webpage translation, engines, document parsers, wordbook and subtitle features.
- Foxmori product artwork and API-engine migration.
- Original-text changes clear stale translations; late responses cannot insert the previous source's output.
- Streaming edits are coalesced; translation-only restore, recycled nodes and progress counters are covered.
- Subtitle injection/routing share one domain inventory; expanded Teams/Zoom coverage.
- Nine-language meeting panel labels and conservative native caption-enabling actions.
- Old target-language responses cannot contaminate a new meeting-caption session.
- Improved main-button text contrast.

## Verification

**54 test files / 828 tests** passed locally; TypeScript and production builds passed. Browser smoke with native IntersectionObserver/MutationObserver verified source updates, stale-result rejection and restoration. Provider responses and meeting DOMs in tests are synthetic, not live services.

## Install / limitations

Extract the extension ZIP, then load its folder in Chrome/Edge Developer mode. Configure your own service key/model if needed; do not post keys in issues. Real API/provider billing, live meeting selectors and browser-store review remain unverified. PDF export reflows extracted text to HTML; no OCR or original PDF layout preservation. YouTube word-card save labels still need full UI localization. No Chrome/Edge store release is claimed.

## Source and artwork

The repository preserves the original license and attribution. `.publication/assets.json` contains only lossless public PNG artwork; `npm install` / `npm ci` restores and verifies it locally. GitHub Actions also commits the materialized PNGs before creating the initial alpha release. Generated dependency/runtime assets and user configuration are not published.

This is a prerelease for testing, not a production-readiness claim.

## Dependency advisories

Known dependency-chain advisories remain, including legacy NAT dependencies (Rdown) and test-tool dependencies (Rtranslate). See [DEPENDENCY_STATUS.md](DEPENDENCY_STATUS.md). This alpha does not claim production security readiness.
