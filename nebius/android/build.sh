#!/usr/bin/env bash
# Builds the NEBIUS Android APK without Gradle (same toolchain as the Approx AI app):
#   sudo apt-get install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23
#
#   ./build.sh debug                      → build/NEBIUS-<ver>-debug.apk   (local debug key, cleartext to localhost/10.0.2.2 only)
#   KEYSTORE=/secure/release.jks KEYSTORE_PASS=… KEY_ALIAS=… NEBIUS_SERVER_URL=https://… ./build.sh release
#                                         → build/NEBIUS-<ver>-release.apk (REFUSES to build without a supplied keystore)
set -euo pipefail
cd "$(dirname "$0")"
TYPE=${1:-debug}
[[ "$TYPE" == debug || "$TYPE" == release ]] || { echo "usage: $0 debug|release"; exit 2; }
VERSION_NAME=$(grep -o 'versionName="[^"]*"' AndroidManifest.xml | cut -d'"' -f2)
ANDROID_JAR=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
SERVER_URL=${NEBIUS_SERVER_URL:-}
OUT=build/$TYPE
APK="NEBIUS-${VERSION_NAME}-${TYPE}.apk"
[ -f "$ANDROID_JAR" ] || { echo "android.jar not found: $ANDROID_JAR"; exit 1; }
if [ "$TYPE" = release ]; then
  [ -n "${KEYSTORE:-}" ] && [ -f "$KEYSTORE" ] || { echo "Release builds require KEYSTORE (+ KEYSTORE_PASS, KEY_ALIAS). No key is generated for releases."; exit 1; }
  [ -n "$SERVER_URL" ] && [[ "$SERVER_URL" != https://* ]] && { echo "NEBIUS_SERVER_URL must be https:// for release"; exit 1; }
fi

rm -rf "$OUT"; mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/res"
cp -r res/. "$OUT/res/"
# Release: usesCleartextTraffic=false (HTTPS only; targetSdk 33 trusts system CAs only by default).
# Debug: cleartext allowed so the emulator can reach http://10.0.2.2 (the app still rejects other http hosts).
cp AndroidManifest.xml "$OUT/AndroidManifest.xml"
[ "$TYPE" = debug ] && sed -i 's#android:usesCleartextTraffic="false"#android:usesCleartextTraffic="true"#' "$OUT/AndroidManifest.xml"
python3 - "$OUT/res" "$SERVER_URL" "$TYPE" <<'PY'
import sys, html, pathlib
res, url, typ = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
s = res / 'values/strings.xml'; s.write_text(s.read_text().replace('<string name="default_server_url"></string>', f'<string name="default_server_url">{html.escape(url)}</string>'))
b = res / 'values/bools.xml'; b.write_text(b.read_text().replace('>false<', '>true<' if typ == 'debug' else '>false<'))
if typ == 'debug':
    a = res / 'values/strings.xml'; a.write_text(a.read_text().replace('>NEBIUS<', '>NEBIUS (debug)<'))
PY

echo "[1/6] aapt: R.java";  aapt package -f -m -J "$OUT/gen" -M "$OUT/AndroidManifest.xml" -S "$OUT/res" -I "$ANDROID_JAR"
echo "[2/6] javac";         find src "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" -d "$OUT/classes" @"$OUT/sources.txt"
echo "[3/6] dx";            dalvik-exchange --dex --min-sdk-version=26 --output="$OUT/classes.dex" "$OUT/classes"
echo "[4/6] aapt: package"; aapt package -f $([ "$TYPE" = debug ] && echo --debug-mode) -M "$OUT/AndroidManifest.xml" -S "$OUT/res" -I "$ANDROID_JAR" -F "$OUT/unaligned.apk"
(cd "$OUT" && aapt add unaligned.apk classes.dex >/dev/null)
echo "[5/6] zipalign";      zipalign -f -p 4 "$OUT/unaligned.apk" "$OUT/aligned.apk"
echo "[6/6] apksigner"
if [ "$TYPE" = debug ]; then
  KS=keystore/debug.jks
  if [ ! -f "$KS" ]; then
    mkdir -p keystore
    keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 3650 \
      -dname "CN=NEBIUS Debug - local only - not for distribution" >/dev/null 2>&1
  fi
  apksigner sign --ks "$KS" --ks-pass pass:android --ks-key-alias androiddebugkey --out "build/$APK" "$OUT/aligned.apk"
else
  apksigner sign --ks "$KEYSTORE" --ks-pass "pass:${KEYSTORE_PASS:?}" --ks-key-alias "${KEY_ALIAS:?}" --out "build/$APK" "$OUT/aligned.apk"
fi
apksigner verify --verbose "build/$APK" | head -4
rm -f "build/$APK.idsig"
(cd build && sha256sum "$APK" | tee "$APK.sha256")
echo "Built build/$APK"
