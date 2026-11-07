#!/bin/bash
# Parts ko episode order mein jorna + silent stereo track (platform compatibility)
cd "$(dirname "$0")"
ORDER="I A B C K G D F L M E"
: > renders/_parts/list.txt
for s in $ORDER; do echo "file '$s.mp4'" >> renders/_parts/list.txt; done
ffmpeg -y -loglevel error -f concat -safe 0 -i renders/_parts/list.txt -f lavfi -i anullsrc=r=48000:cl=stereo \
  -c:v copy -c:a aac -b:a 128k -shortest -movflags +faststart renders/AbTravelSplash_EP1_Karachi_to_Islamabad_1080p24.mp4
ffprobe -v error -show_entries format=duration,size -of default=nw=1 renders/AbTravelSplash_EP1_Karachi_to_Islamabad_1080p24.mp4
