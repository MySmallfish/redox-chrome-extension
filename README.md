# Redox Chrome Extension

Chrome Extension MV3 package for tracking Israeli real-estate listings in Redox.

## Local Setup

```bash
pnpm install
pnpm build
pnpm test
pnpm test:e2e
```

Create a versioned ZIP package:

```bash
pnpm run package
```

The package script builds `dist/`, bumps the packaged `dist/manifest.json` version, writes `artifacts/package-info.json`, and creates `artifacts/redox-property-tracker-<version>.zip`.

By default the package version is `<source major>.<source minor>.<source patch>.<build number>`. In GitHub Actions the build number is `GITHUB_RUN_NUMBER`. For a manual override:

```bash
PACKAGE_VERSION=0.1.1.42 pnpm run package
```

## GitHub Automation

### PR test packages

`.github/workflows/pr-package.yml` runs when a PR is opened, reopened, marked Ready for Review, or receives new commits. Draft PRs are skipped. The workflow runs lint, unit tests, the Playwright E2E track flow, then uploads a ZIP artifact named `redox-extension-pr-<number>`.

### Release packages

`.github/workflows/release.yml` runs when any PR is merged into its base branch. It checks out the target branch, reruns lint/tests/E2E, creates a bumped ZIP package, and publishes a GitHub Release tagged with the packaged version.

When the PR target branch is `main`, a separate deploy job runs in the GitHub Environment named `store` and attempts to upload and publish the package to the Chrome Web Store. If any Chrome Web Store variable or secret is missing, deployment is skipped without failing the release.

## Chrome Web Store Setup

The Chrome Web Store deploy step uses the Chrome Web Store API v2. Google requires the extension package manifest version to increase for each upload. The package workflow handles that by stamping the ZIP with a unique fourth version segment.

Create a GitHub Environment named `store`, then add these environment variables or secrets:

- `CHROME_WEBSTORE_PUBLISHER_ID`: Publisher ID from the Chrome Web Store Developer Dashboard.
- `CHROME_EXTENSION_ID`: Existing Chrome Web Store item ID.

Add these as environment secrets:

- `CHROME_WEBSTORE_CLIENT_ID`: Google OAuth client ID.
- `CHROME_WEBSTORE_CLIENT_SECRET`: Google OAuth client secret.
- `CHROME_WEBSTORE_REFRESH_TOKEN`: Refresh token authorized with `https://www.googleapis.com/auth/chromewebstore`.

Google setup required:

1. Enable the Chrome Web Store API in a Google Cloud project.
2. Configure an OAuth consent screen and OAuth client.
3. Generate a refresh token for the Google account that owns or can manage the Chrome Web Store publisher.
4. Fill the Store Listing and Privacy tabs for the extension in the Chrome Web Store Developer Dashboard before first publish.

Official setup docs: [Use the Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api).

## Repository Remote

This repository is configured to publish to:

```bash
git@github.com:MySmallfish/redox-chrome-extension.git
```
