#!/bin/bash
# Poora Episode 1 render: 3 parallel workers → parts → concat
cd "$(dirname "$0")"; mkdir -p renders/_parts logs
w(){ for s in "$@"; do node render.js --seqs $s --out renders/_parts/$s.mp4 > logs/$s.log 2>&1; done; }
w I A B & w C K D & w F L E & wait
echo ALL_DONE
