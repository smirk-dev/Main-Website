#!/bin/bash
# frames (g5/tour_frames/f00000.jpg...) -> the two scrub films tour.ts picks between. Run from the work directory.
# The foliage is expensive in any codec: H.264 1600 crf 26 would be ~460 MB, AV1 1280 crf 42 ~196 MB. These are what shipped:
#   tour_av1.mp4  AV1 1280x720 crf 46, keyframe every 24   (~140 MB; sharper, where the browser decodes AV1)
#   tour.mp4      H.264 960x540 crf 30, keyframe every 24, no B-frames (~61 MB; plays everywhere)
# Seeks measured 6-9 ms median for both in Chrome (tour_test.py). usage: encode.sh [outdir]
OUT=${1:-.}
IN="-framerate 24 -start_number 0 -i g5/tour_frames/f%05d.jpg"
ffmpeg -hide_banner -loglevel error -y $IN -vf "scale=1280:-2:flags=lanczos" -c:v libsvtav1 -preset 8 -crf 46 -g 24 -svtav1-params tune=0 \
  -pix_fmt yuv420p -movflags +faststart -an "$OUT/tour_av1.mp4"
ffmpeg -hide_banner -loglevel error -y $IN -vf "scale=960:-2:flags=lanczos" -c:v libx264 -preset medium -crf 30 -g 24 -keyint_min 24 -sc_threshold 0 -bf 0 \
  -pix_fmt yuv420p -movflags +faststart -an "$OUT/tour.mp4"
ls -l "$OUT"/tour_av1.mp4 "$OUT"/tour.mp4 | awk '{printf "%s  %.0f MB\n", $9, $5/1048576}'
