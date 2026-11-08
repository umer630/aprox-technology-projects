#!/bin/bash
# Episode 1 (v3, ~14 min, vlog camera grammar): sequences → 360-frame chunks → 3 parallel workers (resume-safe) → concat
cd "$(dirname "$0")"; mkdir -p renders/_parts logs
ORDER="H A B X Y R J C K N G P D F L M Q E S O"
CH=360; : > renders/_parts/jobs.txt
for s in $ORDER; do
  n=$(node render.js --seqs $s --info 2>/dev/null | grep FRAMES | awk '{print $2}')
  for ((a=0; a<n; a+=CH)); do b=$((a+CH)); [ $b -gt $n ] && b=$n; printf "%s %05d %d\n" $s $a $b >> renders/_parts/jobs.txt; done
done
job(){ s=$1; a=$2; b=$3; out=renders/_parts/${s}_${a}.mp4; [ -s $out ] && exit 0
  node render.js --seqs $s --from $((10#$a)) --to $b --out $out.tmp.mp4 > logs/${s}_${a}.log 2>&1 && mv $out.tmp.mp4 $out; }
export -f job
cat renders/_parts/jobs.txt | xargs -P 3 -L 1 bash -c 'job $0 $1 $2'
: > renders/_parts/list.txt
while read s a b; do echo "file '${s}_${a}.mp4'" >> renders/_parts/list.txt; done < renders/_parts/jobs.txt
echo ALL_FRAMES_DONE
