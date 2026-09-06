# Release operations

The release implementation was prepared on 6 September 2026. The official repository is [cubetek/cubeCroom](https://github.com/cubetek/cubeCroom), as configured in `scripts/release/config.mjs`. Workflows publish only when the settings below are configured; a local build or validation artifact is not a public release. Check the repository's actual Actions and Releases state for what has run or shipped.

## One product and one release pipeline

`package.json#version` is the product version. `.github/release-please-config.json` manages the root product, synchronizes `apps/desktop/package.json`, and prepares CHANGELOG entries. It creates **draft** releases. Internal workspace package versions are not separately published. `scripts/release/config.mjs` owns the official repository, app identity, artifact names, and native build matrix.

The release workflow runs on trusted `main` pushes, or a `workflow_dispatch` that identifies an existing draft's exact tag and 40-character commit. Release Please uses a GitHub App installation token so its PRs trigger ordinary CI. Building continues in the same workflow from Release Please outputs; it does not depend on a token-generated tag starting another workflow. A draft may not have a Git tag until publication.

## Running on a new repository

The manual workflows serve different purposes:

| Workflow | Required setup | Result |
| --- | --- | --- |
| `CI` / `ci.yml` | The workflow is on the selected branch; no release secrets or GitHub App | Source checks, native unpacked application and smoke on all four targets; validation archives and SHA-512 hashes remain Actions artifacts for seven days. |
| `Release` / `release.yml` | `main`, an existing draft with exact tag/SHA, the signing setup below, and the publication environment | All signed target builds, signed release manifest, checksum list, and public GitHub Release under the configured environment policy. No GitHub App or automatic-preparation switch is needed for manual dispatch. |
| `OTA Signing Readiness` / `ota-signing-readiness.yml` | `main`, committed public trust, and the manifest key in `release-publish` | A random signed challenge proves the protected private key matches the committed public key. It creates no release or update payload. |

Start validation with `gh workflow run ci.yml --repo cubetek/cubeCroom --ref main`. Download its `validation-<target>-<sha>` artifacts from that specific Actions run. Each contains a `.tar.gz` of the unpacked application, `validation.json` and `SHA512SUMS`. Extracting the tar archive preserves executable modes and macOS symbolic links. These are development/validation packages: production code signing has not been verified, and they are not installers, OTA updates, or releases for the public download page.

When all four targets pass on the official repository's `main` push or manual dispatch, a separate job checks the downloaded archives against `SHA512SUMS` and signs their GitHub build provenance. Pull requests, forks and other branches do not run this job or receive its OIDC/attestation write permissions. This uses GitHub's short-lived workflow identity through the pinned `actions/attest-build-provenance` action; it needs no stored signing key. GitHub stores the attestations, and the run also retains a `build-provenance-<sha>` verification bundle. [GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

After downloading an archive, verify its workflow identity with the GitHub CLI, replacing the filename and commit placeholders:

```sh
gh attestation verify CubeCroom-<version>-<target>-validation.tar.gz --repo cubetek/cubeCroom --signer-workflow cubetek/cubeCroom/.github/workflows/ci.yml --source-ref refs/heads/main --source-digest <full-commit-sha> --deny-self-hosted-runners
```

The provenance establishes which repository, workflow and commit produced those bytes. It is not Authenticode, Apple Developer ID/notarization, or the OTA Ed25519 manifest signature. `validation.json` therefore retains `productionSigningVerified: false`, and a validation archive still requires the ordinary platform installation/update acceptance before an official release. A configured workflow alone is not evidence that an attestation has already been issued. [GitHub CLI verification options](https://cli.github.com/manual/gh_attestation_verify).

To start an official release without a GitHub App, an authorized maintainer can create a draft for the product version using `gh release create` with `--draft` and `--target` set to the full committed SHA on `main`. Then dispatch `release.yml` from `main`, providing that draft's `tag` and exact `commit`. The resolver checks the draft and both package versions; it does not accept a branch name as the draft target. Manual dispatch skips the App-token and Release Please steps, regardless of `RELEASE_AUTOMATION_ENABLED`. Automatic preparation requires that switch and both App settings; missing App settings produce a skipped-preparation summary rather than failed pushes.

The release workflow has no unsigned-publish mode. A missing platform certificate or missing trusted release key stops the official build; use CI artifacts to continue validation while those credentials are being provisioned.

Every newly packaged application records `updateMode` in `resources/release-config.json`. The central `releaseUpdateMode()` helper selects `signed` only when `CUBECROOM_REQUIRE_SIGNING=1`; ordinary and preview builds use `disabled`, including when public verification keys are present. Combining production signing with `CUBECROOM_PREVIEW_BUILD=1` is rejected. Staging records this mode, and packaging rejects a stage from a different mode. Changing environment variables after packaging cannot enable updates in an installed application.

The runtime requires explicit `signed` mode and configured public trust before scheduling checks or contacting the update service. Missing or unknown modes remain unavailable. Disabled builds also reject manual check, download and install requests without contacting the service. On Windows, signed mode additionally requires a nonempty `publisherName` in `app-update.yml`; production packaging verifies it includes the configured publisher. The manifest signature and native operating-system signature checks remain separate requirements. A preview must be replaced manually with an eligible signed installer before it can receive OTA updates.

### Public preview installers

The existing CI workflow also has an opt-in `build_installers` input. It is effective only for a manual dispatch on the official repository's `main` branch:

```sh
gh workflow run ci.yml --repo cubetek/cubeCroom --ref main -F build_installers=true
```

This runs the ordinary source, build, performance and packaged-application checks on the same four native targets. The packaging step uses `make` with publication disabled, then tests the resulting installers through `preview-install-smoke.mjs`. No operating-system signing credentials are supplied. The tag comes from the synchronized root/desktop product version (`v0.1.0` for product `0.1.0`); GitHub's prerelease flag supplies the preview classification. The exact workflow commit is recorded throughout the build and legal source links.

After every target passes, `preview.mjs` checks the builder checksums, required resources, installer test evidence and matching source identity again. It prepares the `preview-installers-<sha>` Actions artifact with exactly six binaries (Windows EXE, two macOS DMGs, two macOS ZIPs, Linux AppImage), `SHA512SUMS` and `release-metadata.json`. Builder updater feeds, blockmaps and internal test reports stay out of this public set. `SHA512SUMS` covers the six binaries and the metadata JSON. The existing isolated attestation job signs every file in the final set, and retains `preview-provenance-<sha>` containing `attestation.json`.

`release-metadata.json` declares `schemaVersion: 1`, `channel: "preview"`, `prerelease: true`, product version/tag/commit/creation time, the official repository, and each binary's name, size, SHA-512, platform, architecture and download URL. It explicitly records `productionSigningVerified: false`, `osSigning: "unverified"` and `ota: false`. Ad-hoc signing needed to execute a macOS application does not establish Developer ID trust or notarization. GitHub provenance establishes the workflow and bytes; it does not change this signing state.

An authorized maintainer downloads the final artifact and provenance bundle from the successful run, verifies their hashes and attestations, and creates/uploads/publishes the GitHub release with `prerelease: true` and the recorded exact commit. Publish the final binary/metadata set, optionally its `attestation.json` bundle, and explicit installation/signing notes. The CI workflow itself never creates or publishes a release. Use `gh attestation verify <installer> --repo cubetek/cubeCroom --signer-workflow cubetek/cubeCroom/.github/workflows/ci.yml --source-ref refs/heads/main --source-digest <full-commit-sha> --deny-self-hosted-runners` for each installer. A preview does not enable the stable OTA pipeline or replace its signing requirements; a later stable product release needs a new version and the normal signed-release process.

The pinned Action v4.4.0 bundles release-please **17.1.3**, whose configuration schema does not support `force-tag-creation`. That unsupported option is deliberately absent. Before Release Please runs on a push, `pending-draft.mjs` checks for an unfinished product draft and pauses new release preparation until that draft is resumed through `workflow_dispatch`. This prevents a failed, untagged draft from being skipped while release history/changelogs advance. Both the guard and subsequent release work run inside the same serialized workflow.

The resolver verifies that the commit belongs to `origin/main`, matches both product versions, and exactly matches the draft target. Existing tags must also resolve to that commit. Each matrix job checks out that SHA, performs source validation, builds without publishing, validates resources/native SQLite, and checks available platform signatures. All targets must succeed before aggregation.

Four native targets are configured: Windows x64, macOS x64, macOS arm64, Linux x64. The two macOS `latest-mac.yml` (or `beta-mac.yml`) files are merged only after validating every checksum. The published file contains both architectures without overwriting either ZIP. ZIP is mandatory for macOS OTA; DMG alone is insufficient.

The stable release's final job validates the complete asset set, signs a release manifest, uploads and verifies the bytes in the draft, publishes once, and checks every download anonymously. There is no account or token embedded in the app. `downloads.json` is generated beside the signed manifest for documentation consumers. The static docs use one shared public GitHub release catalog for downloads, the product version and release history. It prefers the latest stable release and otherwise displays a published preview, validates installer names, sizes and official URLs, and displays the release notes with safe links. Its build-time server component reads the central configuration and passes only JSON to the browser. No Node code or token is bundled into the client. With no public release, the page explains that the first release is being prepared and links to the guide; refresh/network failures have an explicit retry or stale-cache state. Documentation deployment is configured separately from installer publication.

## External setup, not inferred credentials

Keep `RELEASE_AUTOMATION_ENABLED` unset or `false` until a real Release Please GitHub App is configured. This switch controls automatic PR/draft preparation only. Configure the following GitHub environments with `main` deployment restrictions. Required reviewers on `release-publish` are optional under the maintainer's release policy; unattended publication does not require a new approval service. The other environments organize automation and signing credentials. Protect the default branch and release tags using ordinary repository settings. Committing YAML does not configure those remote settings.

When required reviewers are configured, GitHub waits for their approval before running the environment's job or exposing its secrets. A `main`-only environment without that optional rule supports the owner's requested automated flow. Verify that `release-publish` has the intended branch restrictions before enabling publication. There is no custom approval service, per-release approval variable, or legal-text keyword gate. [GitHub environment configuration](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [reviewing deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments).

| Scope | Variables | Secrets |
| --- | --- | --- |
| Repository | `RELEASE_AUTOMATION_ENABLED=true` when automatic App preparation is ready; otherwise `false` | None |
| `release-automation` | `RELEASE_APP_ID` | `RELEASE_APP_PRIVATE_KEY` |
| `release-signing` | `WINDOWS_PUBLISHER_NAME`, `APPLE_TEAM_ID` | `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD`, `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` |
| `release-publish` | `RELEASE_SIGNING_KEY_ID`, `RELEASE_PUBLIC_PUBLISH_ENABLED=true` | `RELEASE_SIGNING_PRIVATE_KEY` |

The GitHub App is installed only on this repository and needs Contents, Pull requests, and Issues write permissions for Release Please. Its token is never sent to PR jobs. Build jobs receive only their platform's signing credentials, during the signing step. The release-manifest private key is exposed only to the aggregation/signing step or the final step of the manual readiness challenge.

`CSC_LINK` values use electron-builder's supported secure certificate input format, such as a base64-encoded certificate. Do not place production certificate files or passwords in the repository. `WINDOWS_PUBLISHER_NAME` is the exact certificate SimpleName expected in Authenticode and must match the real signing identity. Windows verification requires a valid signature and timestamp. macOS verification mounts the DMG read-only and checks the app's signature, notarization ticket, and Gatekeeper assessment; notarizing an app is not a claim that the DMG itself has been notarized separately.

The pinned `electron-updater@6.8.9` patch removes its Windows verification fallbacks that could accept an update when PowerShell was unavailable or the signed file path was missing. Such failures now reject the download; successful native signature and publisher CN/DN checks use the existing upstream algorithm. Regression tests exercise the installed verifier with controlled process responses. The patch is tracked by pnpm with LF-stable bytes and must be reviewed when updating the dependency. [Pinned upstream Windows verifier](https://github.com/electron-userland/electron-builder/blob/bed3a9c421a8a05c49f36a2af5d7ae3598cb1b95/packages/electron-updater/src/windowsExecutableCodeSignatureVerifier.ts).

These are distinct signing mechanisms. Windows needs a trusted Authenticode code-signing certificate for the configured publisher; macOS needs a Developer ID Application signing identity and Apple notarization credentials. The Ed25519 release key signs the manifest that binds every download's size and SHA-512 digest, including the Linux AppImage. It does not supply Windows/macOS operating-system trust. `SHA512SUMS` detects changed bytes when compared against a trusted reference; a checksum by itself is not a publisher signature. Generating an Ed25519 key, or a self-signed operating-system certificate, cannot replace the required platform signing setup.

Use this short acceptance checklist before enabling a new signed release:

- [ ] The release commit, notes, and expected installers match; all native build jobs and `pnpm verify` passed.
- [ ] Installation and A-to-B update evidence covers every platform/architecture being advertised, including save protection and recovery. Resource/unit checks alone do not establish installed-update acceptance.
- [ ] The chosen LICENSE and shipped third-party notices are included, with normal contribution review completed.
- [ ] Signing identities and the manifest key are correct, and the repository is ready for public downloads.

The publisher requires a present, nonempty `LICENSE`. It does not select a license or require additional CLA, commercial-license, or trademark files. `RELEASE_PUBLIC_PUBLISH_ENABLED` remains the single publish switch. The exact commit, complete artifacts, checksums, signatures, and successful platform jobs remain enforced automatically, with an optional environment review when the maintainer chooses it.

The publish script additionally refuses a private repository. Visibility changes and historical source/secret review are external owner actions; this workflow never makes the repository public.

## Release manifest and key rotation

The shared runtime validator lives in `packages/core/src/updates/release-manifest.ts`; release scripts use the same validator before signing/publishing. `scripts/release/trust.json` contains only reviewed public Ed25519 keys and is shipped with the application. The public preview `v0.1.0` shipped with no keys; it requires a one-time manual installation of a later signed release containing the provisioned trust. Adding a key to the repository cannot modify an already installed preview. Production key custody remains outside the source tree; the workflow never generates a replacement key automatically.

The public key provisioned on 6 September 2026 has ID `cubecroom-ota-2026-09` and public SPKI SHA-256 fingerprint `2cdd51ece4e9ef52bbeb8a94df44ca4c2c75af67c1851523b3cd0c892753b37c`. The matching private key is held in the `release-publish` environment secret. Check the actual readiness run for proof that the secret is usable; public configuration alone does not establish that. Windows and Apple production credentials are still required before the first OTA-capable public release.

After provisioning or rotating the protected key, run:

```sh
gh workflow run ota-signing-readiness.yml --repo cubetek/cubeCroom --ref main
```

The workflow must first exist on the default branch. It checks out that exact run SHA and builds the shared trust schema without signing credentials. Its final step receives `RELEASE_SIGNING_KEY_ID` and `RELEASE_SIGNING_PRIVATE_KEY`, verifies the Ed25519 public/private pair, signs a random domain-separated challenge, and verifies that signature. Only the public proof, source/run identity and SHA-256 fingerprint of the public SPKI appear in logs/summary. It has read-only repository permissions, no upload/publish step, and cannot be triggered by PRs. The challenge is deliberately not a release manifest. A successful run proves manifest-key provisioning; Windows/Apple signing, native installation and an actual A-to-B OTA update require their own evidence. [Manual workflow requirements](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

`cubecroom-release.json` is an envelope:

```json
{
  "schemaVersion": 1,
  "keyId": "an-installed-public-key-id",
  "algorithm": "Ed25519",
  "payload": "base64 of the exact UTF-8 JSON bytes",
  "signature": "base64 Ed25519 signature over those exact bytes"
}
```

The payload binds `version`, `channel`, `tag`, `commit`, `createdAt`, and a `files` array. Each file has a safe basename, size, SHA-512 in base64, platform, architecture, kind, and official GitHub download URL. `createdAt` comes from the draft's creation time, not a claim that publication already happened. Shared macOS metadata uses `arch: universal`; binaries always identify their concrete architecture. The envelope, generated `downloads.json`, and `SHA512SUMS` are ancillary assets and are not recursively included in their own signed file list.

Generate and custody the production key outside the repository using the organization's approved key-management process. Install its public half in `trust.json`, set its ID and private PEM in the protected publish environment, and review that change before distributing clients. For rotation, first release a client that trusts both old and new public keys while signing with the old key; only after the overlap release is adopted start signing with the new key. Revocation/recovery for clients that never received the overlap requires an independently trusted manual installer. A checksum file does not substitute for signature verification.

## Draft recovery and publication behavior

Re-run failed jobs while artifacts remain available, or dispatch the workflow from `main` with the existing draft tag and SHA to rebuild all targets. A draft target that names a branch instead of a full SHA must be corrected before dispatch; the pipeline will not guess its intended commit. Different code requires a new version or a new reviewed draft.

All release workflow runs share one non-cancelling concurrency group. During a draft retry, already uploaded matching bytes are retained. If some files were uploaded before a failure, re-run the original **publish job**, which reuses its original build artifacts while they remain available. Rebuilding can produce different timestamped signatures; a conflicting existing asset stops publication. The workflow never deletes or overwrites assets, because GitHub has no atomic operation that permits replacement only while a release remains a draft. If the original artifacts expired, prepare a new reviewed release or explicitly resolve the draft conflict outside this automation. Unknown extra assets also stop publication. If anonymous checks fail after publication, the workflow reports that the release is already public; investigate availability and ship a newer corrective version if necessary. The pipeline does not claim atomic publication across GitHub and a documentation host.

The release approval gate does not perform a database downgrade or automatically install during an active class. The app's updater and backup gates own that behavior. Initial installations lacking OTA require the documented one-time installer transition.

## Validation performed locally

CI reads the four native targets from `RELEASE_CONFIG`, validates source, packages the existing build without signing credentials, and runs `scripts/test-packaged.mjs` with an isolated profile. Linux uses Xvfb. The smoke checks update IPC/channel persistence, local AGPL/source/notices access, and the student portal/database. It bounds connection and process cleanup waits and records signals from POSIX crashes. Successful runs preserve native validation archives and SHA-512 hashes; failure artifacts contain runtime logs, a settings screenshot and the result, excluding test databases.

Ubuntu runner validation first configures the unpacked `chrome-sandbox` helper as root-owned with mode `4755`, using the bounded `prepare-linux-sandbox.mjs` script. The first native run reached packaging successfully but Chromium refused to launch because those installation permissions were missing. This configures Chromium's SUID sandbox; it does not add a sandbox-disable flag or change host security settings. Extracted Linux validation archives may likewise require their sandbox helper to be installed with these permissions on the test host. [Chromium SUID sandbox installation](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/linux/suid_sandbox_development.md).

Ordinary CI smoke launches the unpacked executable. Preview installer mode adds the real NSIS install/replacement/uninstall path with data-preservation checks, application launch from a mounted/copied DMG with matching ad-hoc DMG/ZIP signatures, and AppImage extraction followed by its actual AppRun launcher. The pinned builder integration removes the upstream AppImage sandbox-disable argument/fallback; its focused test executes the generated launcher and checks failure propagation. The installed-image smoke checks these same properties on the produced AppImage. These checks do not establish Gatekeeper acceptance after browser download, FUSE-mounted execution, or an A-to-B upgrade between different product versions. Consult the native run's `preview-install-checks-<platform>-<arch>.json` for executed checks and limitations.

`node --test scripts/release/test/*.test.mjs` checks complete target aggregation, macOS architecture merging, absent updater ZIP, modified bytes, unsafe/duplicate metadata paths, stale assets, missing package evidence, and workflow credential boundaries. `pnpm exec eslint scripts/release/*.mjs scripts/release/test/*.mjs` checks script quality. Workflow syntax was validated with upstream actionlint 1.7.12, downloaded from its official release and verified against its published SHA-256 checksum.

The build copies the standard root LICENSE and generates the same legal information for the teacher and student UI. Official release builds require a clean `RELEASE_COMMIT`; their source/archive links identify that exact commit. Package validation rejects stale source links, license text or notice copies. Release tests include matching and stale legal-asset cases. Git attributes preserve original license bytes across Windows/macOS/Linux checkouts.

The original local checks ran on Windows without production signing credentials. Subsequent native CI runs have their own Actions logs and artifacts; for example, [run 34034017879](https://github.com/cubetek/cubeCroom/actions/runs/34034017879) passed ordinary unpacked-package validation on all four targets and issued archive provenance. That run predates preview installer mode and is not evidence that the new installer checks passed. Only a successful run with `build_installers=true`, its installer reports and final attestation establish that preview's executed validation. Production OS signing and an installed A-to-B update remain separate acceptance evidence.

## Verified upstream interfaces

- [Release Please Action v4.4.0 inputs and outputs](https://github.com/googleapis/release-please-action/blob/16a9c90856f42705d54a6fda1823352bdc62cf38/README.md)
- [Manifest draft releases and extra files](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)
- [Release Please 17.1.3 configuration schema](https://github.com/googleapis/release-please/blob/v17.1.3/schemas/config.json)
- [GitHub secure workflow guidance](https://docs.github.com/en/actions/reference/security/secure-use)
- [Build provenance Action v4.2.2 inputs and pinned implementation](https://github.com/actions/attest-build-provenance/blob/4d101475d8b20a2381f78447822ac1eab6504dd8/action.yml)
- [electron-builder stable updater targets](https://github.com/electron-userland/electron-builder/blob/512a57ec9bcda593d3e0970bd2b9a33a63beeb57/website/docs/features/auto-update.md)
- [actionlint release used for local syntax validation](https://github.com/rhysd/actionlint/releases/tag/v1.7.12)

Every Action reference is pinned to its verified upstream tag's full commit SHA. Dependabot checks those pinned Actions weekly. Pins must be reviewed and updated; pinning is not a substitute for future security updates.
