# NEBIUS Android App — Plan, Build, Install, Compatibility

## Decision: native client, not Capacitor
Capacitor needs Gradle and the Android SDK from `dl.google.com` (blocked in the build environment) and would wrap a WebView. The existing
Approx AI app is a native Java client built without Gradle; NEBIUS follows the same approach: a separate management client on the same
backend API. **The APK manages the platform — no GPU computation ever runs on the phone.**

## Features
Splash · server setup (validates it is a NEBIUS server) · login · registration · email verification · password reset · dashboard ·
three-button bottom navigation (Dashboard · Projects · Compute) + module menu · project list/create/detail/archive · file manager
(browse, nested folders, create folder, upload via the system picker, download via signed URL, integrity verify, trash) · Compute
Engine (GPU availability incl. NO FREE GPU AVAILABLE, provider free-only status, instances create/start/stop/restart/delete) · notebooks
(list; open in the web console editor) · AI Training (Nick 4.8 status, import, preflight, start, jobs, verified models) · jobs (list,
detail with log, cancel/pause/resume/retry) · logs · notifications (in-app + system notifications while the app is open; runtime
`POST_NOTIFICATIONS` request on Android 13+) · settings (server, change password, sign out) · profile · version info.

Security: session token encrypted with a non-exportable Android Keystore AES-256-GCM key; `allowBackup=false`; release builds accept
only `https://` servers and set `usesCleartextTraffic=false` (targetSdk 33 trusts system CAs only); session expiry and 401 → sign-in;
offline state with Retry. Debug builds additionally allow `http://localhost`, `http://127.0.0.1` and `http://10.0.2.2` (emulator).

## Build
```bash
sudo apt-get install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 openjdk-17-jdk
cd nebius/android
./build.sh debug                    # → build/NEBIUS-0.1.0-debug.apk (signed with a local debug key in keystore/, gitignored)
KEYSTORE=/secure/nebius-release.jks KEYSTORE_PASS=… KEY_ALIAS=… NEBIUS_SERVER_URL=https://your.server ./build.sh release
```
Release builds **refuse** to run without a supplied keystore — no signing key is ever generated or committed for releases.

## Install (debug APK)
1. Copy `nebius/release/NEBIUS-0.1.0-debug.apk` to the phone (or `adb install -r NEBIUS-0.1.0-debug.apk`).
2. Allow "Install unknown apps" for your file manager/browser.
3. Open NEBIUS (debug) → enter your server URL (`https://…`; emulator: `http://10.0.2.2:8090`) → sign in.
4. Verify the checksum first: `sha256sum NEBIUS-0.1.0-debug.apk` must equal `nebius/release/SHA256SUMS`.

## Artifact
| File | SHA-256 | Signature |
|---|---|---|
| `release/NEBIUS-0.1.0-debug.apk` (66 KB) | `f18c7843b810f45729c9e1bcecdbaa770b30bc8026ea9560729510cc6646eb18` | v2 + v3 (debug key; `application-debuggable`) |

## Compatibility report
| Item | Value |
|---|---|
| Package | `com.approxtech.nebius`, versionCode 1, versionName 0.1.0 |
| minSdk / targetSdk | 26 (Android 8.0) / 33 (Android 13) |
| Compiled against | `android-23` platform (Ubuntu package); newer APIs (NotificationChannel, POST_NOTIFICATIONS) used via runtime checks/reflection |
| ABI | none (pure Dalvik bytecode) — any architecture |
| Permissions | `INTERNET`, `POST_NOTIFICATIONS` (runtime, 13+) — no storage permission (system document picker + browser download) |
| Third-party libraries | none |

## Verification performed
- `aapt dump badging`: package, sdk 26/33, permissions, label confirmed. `apksigner verify`: v2/v3 signatures valid.
- **Network layer tested**: `jvmtest/run.sh` compiles the exact `Api.java` shipped in the APK and runs 22 checks against a live NEBIUS
  backend (login, dashboard, create project, PATCH/DELETE override, streamed upload with SHA-256 match, signed download, integrity, browse,
  GPU availability, providers, training status, jobs, logs, notifications, logout → 401 path, offline detection) — **22/22 pass**.
- **Not performed**: install/run on a device or emulator (none available in the build environment). UI code is compiled and dex'ed but
  not exercised on Android. This must be done before any distribution.
