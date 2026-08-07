# iOS App Store builds via Xcode Cloud

## Why

Local Macs on **macOS beta** stamp binaries with `BuildMachineOSBuild` from the beta OS. App Store Connect then rejects the upload as **ITMS-90111** (often worded as “Unsupported SDK or Xcode version”), even when using a **release** Xcode.

**Policy for this repo:**

| Work | Where |
| --- | --- |
| Day-to-day coding, Simulator, device debug | **Local Mac** (beta OS OK) |
| Archive / TestFlight / App Store binary | **Xcode Cloud only** (manual start) |

Xcode Cloud is billed as **25 compute hours per month** with the Apple Developer Program. Start workflows **manually** so hours go only to real store submissions.

Native store target: **`apps/ios`** (SwiftUI). Expo `apps/mobile` is not the iOS store path.

## One-time setup (Xcode UI)

Do this once on any Mac that can open the project (beta Mac is fine for *configuring* Cloud; Cloud still builds on Apple’s release OS images).

1. Open the project:
   ```sh
   cd apps/ios
   xcodegen generate   # if needed
   open EdgeEver.xcodeproj
   ```
2. **Xcode → Product → Xcode Cloud → Create Workflow…** (or Report navigator → Cloud).
3. Product: **EdgeEver** (`org.edgeever.mobile`), repository `tianma-if/edgeever`.
4. When asked for the project path in a monorepo, select **`apps/ios/EdgeEver.xcodeproj`** (or the `apps/ios` workspace root Xcode shows).
5. **Workflow settings (important):**
   - **Start condition:** **Manual** only — do **not** start on every git push / PR (saves the 25h quota).
   - **Actions:** **Archive** (App Store / TestFlight distribution).
   - **Deployment:** App Store Connect (upload the archive).
   - **Xcode version:** latest **release** (or RC when Apple requires it) — not a beta toolchain.
6. Signing: prefer **Xcode Cloud managed signing** for Distribution, or ensure the App Store profiles already used by `ExportOptions.plist` / `project.yml` are available to the team. First Cloud run may ask the Account Holder to confirm certificates in App Store Connect.
7. Grant GitHub access if Xcode prompts (read the monorepo so `ci_post_clone` can see `apps/ios` + `EditorSource`).

### What the repo already provides

After clone, Xcode Cloud runs:

`apps/ios/ci_scripts/ci_post_clone.sh`

That script:

1. Installs **bun** (if missing) and **XcodeGen** (via Homebrew if needed)
2. Builds the TipTap **EditorBundle** (`Scripts/build-editor-bundle.sh`)
3. Runs **`xcodegen generate`**

You should not need to commit a machine-local `DerivedData` tree. SPM packages (GRDB, Pow) resolve during the Cloud build.

## Routine: submit a build (uses Cloud hours)

1. Land the code you want on the branch Xcode Cloud tracks (usually `main`).
2. Bump versions if this is a store upload:
   - `apps/ios/Config/Version.xcconfig` → `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`
   - Keep monorepo release rules in `AGENTS.md` when cutting a formal GitHub Release.
3. In Xcode (or App Store Connect → Xcode Cloud): **Start Build** on the **manual** Archive workflow only.
4. Wait for Archive + upload to succeed.
5. In App Store Connect → TestFlight / version page: select the new build, complete compliance, **Submit for Review**.
6. Optional: submit metadata-only steps with Fastlane from any machine (does not re-archive):

   ```sh
   cd apps/ios
   APP_STORE_VERSION=X.Y.Z APP_STORE_BUILD_NUMBER=N \
   APP_STORE_CONNECT_API_KEY_ID=... \
   APP_STORE_CONNECT_API_ISSUER_ID=... \
   APP_STORE_CONNECT_API_KEY_P8_BASE64=... \
   fastlane ios submit_review
   ```

   (`skip_binary_upload: true` in the lane — binary must already be on ASC from Cloud.)

## Local archive (release macOS only)

`Scripts/archive-app-store.sh` remains for machines on a **non-beta** macOS:

```sh
cd apps/ios
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer bash Scripts/archive-app-store.sh
```

On **macOS beta**, do **not** upload that IPA; use Xcode Cloud instead. The script prints a warning when it detects a beta host OS build.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| ITMS-90111 after **local** upload | Host macOS is beta (`BuildMachineOSBuild`) |
| Cloud fails in post-clone on bun/xcodegen | Network / Homebrew on Cloud; re-run; check script logs |
| Editor blank in app | EditorBundle not built — confirm `ci_post_clone` log shows bundle build |
| Signing errors on Cloud | Confirm Distribution cert/profile for `org.edgeever.mobile` + share extension; or enable Cloud-managed signing |
| Hours running out | Workflow not Manual — disable push/PR start conditions |

## Related

- `apps/ios/README.md` — generate / test / Fastlane submit
- `apps/ios/Scripts/archive-app-store.sh` — local archive
- `apps/ios/ci_scripts/ci_post_clone.sh` — Cloud prepare step
