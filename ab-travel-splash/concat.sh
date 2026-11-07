#!/bin/bash
# Saare chunks jor kar Urdu voice-over + ambience + music ke saath final MP4
cd "$(dirname "$0")"
OUT=renders/AbTravelSplash_EP1_Karachi_to_Islamabad_11min_1080p24.mp4
ffmpeg -y -loglevel error -f concat -safe 0 -i renders/_parts/list.txt -i renders/AbTravelSplash_EP1_audio.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $OUT
ffprobe -v error -show_entries format=duration,size -of default=nw=1 $OUT
