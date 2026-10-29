#!/bin/sh
set -eu
output_path="${1:-var/local-media/sample.mp4}"
mkdir -p "$(dirname "$output_path")"
voice="$(say -v '?' | awk 'BEGIN { FS = "  +" } $2 ~ /en_US/ { print $1; exit }')"
if [ -z "$voice" ]; then
  voice="Samantha"
fi
say -v "$voice" -o /tmp/video-translate-sample.aiff "Hello. This short authorized video explains how local translation works. The original audio stays in English. In the middle, remember that subtitles must keep the correct timing. At the end, accents in the translated captions should remain readable."
ffmpeg -y -f lavfi -i "color=c=0x1c1917:s=640x360:r=25" -i /tmp/video-translate-sample.aiff -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k "$output_path"
echo "$output_path"
