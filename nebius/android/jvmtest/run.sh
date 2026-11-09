#!/usr/bin/env bash
# Usage: jvmtest/run.sh <baseUrl> <email> <password>
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=build/jvmtest; rm -rf "$OUT"; mkdir -p "$OUT"
javac -nowarn -encoding UTF-8 -cp jvmtest/lib/json-20240303.jar -d "$OUT" src/com/approxtech/nebius/Api.java jvmtest/ApiJvmTest.java
java -cp "$OUT:jvmtest/lib/json-20240303.jar" ApiJvmTest "$@"
