#!/bin/bash
# frames (g5/tour_frames/f00000.jpg..., 1920x1080 supersampled by render.py) -> the two scrub films tour.ts picks between.
# Quality first (the first cut, AV1 720p crf 46 from aliased 1600x900 frames, was "horrible quality"). Clean supersampled
# frames compress far better; AV1 1080p crf 34 was 516 MB for the whole tour, so the AV1 cut is 900p.
#   tour_av1.mp4  AV1 1600x900 crf 42, keyframe every 24, 143 MB              (where the browser decodes AV1)
#   tour.mp4      H.264 1280x720 crf 26, keyframe every 24, no B-frames, 132 MB   (plays everywhere)
# Each takes ~2 min on the laptop. BT.709 tagged: untagged, the first cut came out washed. usage: encode.sh [outdir]
OUT=${1:-.}
IN="-framerate 24 -start_number 0 -i g5/tour_frames/f%05d.jpg"
C="-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv"
ffmpeg -hide_banner -loglevel error -y $IN -vf "scale=1600:900:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libsvtav1 -preset 8 -crf 42 -g 24 -svtav1-params tune=0 $C -movflags +faststart -an "$OUT/tour_av1.mp4"
ffmpeg -hide_banner -loglevel error -y $IN -vf "scale=1280:720:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 26 -g 24 -keyint_min 24 -sc_threshold 0 -bf 0 $C -movflags +faststart -an "$OUT/tour.mp4"
ls -l "$OUT"/tour_av1.mp4 "$OUT"/tour.mp4 | awk '{printf "%s  %.0f MB\n", $9, $5/1048576}'
