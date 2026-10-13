#!/bin/bash
# frames -> the scrub film. H.264 (plays everywhere), no B-frames and a keyframe every GOP frames: a seek decodes at most
# GOP-1 frames forward, which is what keeps scrubbing smooth. usage: tour_encode.sh <out.mp4> [crf] [gop] [width]
OUT=$1; CRF=${2:-26}; GOP=${3:-12}; W=${4:-1600}
ffmpeg -hide_banner -loglevel error -y -framerate 24 -pattern_type sequence -start_number 0 -i g5/tour_frames/f%05d.jpg \
  -vf "scale=$W:-2:flags=lanczos" -c:v libx264 -preset slow -crf $CRF -g $GOP -keyint_min $GOP -sc_threshold 0 -bf 0 \
  -pix_fmt yuv420p -movflags +faststart -an "$OUT"
ls -l "$OUT" | awk '{printf "%s  %.1f MB\n", $9, $5/1048576}'
