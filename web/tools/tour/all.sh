#!/bin/bash
# Render every tour frame in 500-frame chunks, a fresh browser each (resumable: existing frames are skipped).
# Run from a work directory holding tour_cam.json, with the dev server on :5181. Frames go to g5/tour_frames/.
D=$(cd "$(dirname "$0")" && pwd)
PY=${PY:-python}
N=$($PY -I -c "import json; print(len(json.load(open('tour_cam.json'))['frames']))")
for s in $(seq 0 500 $((N-1))); do
  e=$((s+499 < N-1 ? s+499 : N-1))
  for try in 1 2 3; do
    $PY -I -u "$D/render.py" g5/tour_frames 1 $s $e 1 60 -1 2>&1 | grep -v "^ " | tail -2
    [ $(ls g5/tour_frames | awk -v a=$s -v b=$e '{n=substr($0,2,5)+0; if(n>=a&&n<=b)c++} END{print c+0}') -ge $((e - s + 1)) ] && break
  done
done
echo ALL DONE $(ls g5/tour_frames | wc -l) frames
