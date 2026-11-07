#!/bin/bash
# QA contact sheet: grid.sh out.jpg in1.jpg in2.jpg ...
out=$1; shift; n=$#; i=0; f=""; labels=""
for x in "$@"; do f="$f -i $x"; labels="$labels[$i]scale=960:540[s$i];"; i=$((i+1)); done
rows=$(( (n+1)/2 )); fc="$labels"; r=""
for ((k=0;k<rows;k++)); do a=$((2*k)); b=$((2*k+1)); if [ $b -lt $n ]; then fc="$fc[s$a][s$b]hstack[r$k];"; else fc="$fc[s$a]pad=1920:540[r$k];"; fi; r="$r[r$k]"; done
if [ $rows -gt 1 ]; then fc="$fc${r}vstack=inputs=$rows"; else fc="$fc${r}null"; fi
ffmpeg -loglevel error -y $f -filter_complex "$fc" -q:v 3 $out
