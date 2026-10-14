# The scroll tour (`/tour.html`)

The forest walk as a film the scroll scrubs: smooth on any machine, no WebGL, a fixed path. It is rendered offline in the game's own
engine (MSAA, full shadows every frame, no frame-time fallback), so it looks exactly like the game at its best.

Run from a scratch work directory (outputs land there), with the dev server on :5181 and Python + Playwright:

1. `python -I path.py` — A* over the game's own collision (1.25 m clearance, trail cheaper) from the spawn through every place →
   `tour_route.json`, plot `g5/tour_route.png`. Needs `?debug` (`window.game`).
2. `python -I cam.py` — one pose per frame at 24 fps: smoothed path, 3 m/s, easing into each stop, a 3 s dwell facing the place → `tour_cam.json`.
3. `PY=python ./all.sh` — renders `g5/tour_frames/f00000.jpg…` (1920×1080, drawn at 2× and box-filtered down, full trees to 60 m; ~0.7 s a frame on Iris Xe; a lost context, a dropped pixel ratio or a black frame exits 3 and all.sh retries). It sets `game.film.hold`, so the
   loop draws once per pose; a free-running loop in headless Chrome queued seconds of draws ahead of every screenshot (5 s a frame).
   Don't edit anything `main.ts` imports while it runs: Vite hot-reloads the page and the run dies.
4. `./encode.sh [outdir]` — `tour_av1.mp4` (AV1 900p, 143 MB) and `tour.mp4` (H.264 720p, 132 MB), each ~2 min; `tour.ts` streams AV1 where it decodes.

Then copy both films to `public/assets/tour/`, frame 0 at 1280 wide to `poster.jpg`, and write `tour.json`
(`{fps, frames, stops: [{key, f0, f1}]}` from `tour_cam.json`). `public/assets/` is not in git.
