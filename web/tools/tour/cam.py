# tour_route.json (A* polyline + stops) -> tour_cam.json: one camera pose per video frame (x, z, yaw, look-target weight),
# a smoothed path, 3 m/s cruise easing into each stop, a dwell at each stop facing its structure, 24 fps.
import json, math
FPS, CRUISE, EASE, DWELL = 24, 3.0, 7.0, 3.0
r = json.load(open("tour_route.json"))
P = r["pts"]
# resample every 0.25 m
def resample(P, step):
    out = [P[0]]; acc = 0.0
    for (ax, az), (bx, bz) in zip(P, P[1:]):
        L = math.hypot(bx - ax, bz - az); t = step - acc
        while t <= L: out.append([ax + (bx - ax) * t / L, az + (bz - az) * t / L]); t += step
        acc = L - (t - step)
    return out
stop_pts = [P[s["at"]] for s in r["stops"]]
R = resample(P, 0.25)
# stops: nearest resampled index
def nearest(p): return min(range(len(R)), key=lambda i: (R[i][0] - p[0]) ** 2 + (R[i][1] - p[1]) ** 2)
stop_idx = [nearest(p) for p in stop_pts]
# smooth: gaussian over +-3 m, but a stop stays exactly where it is (weights pinned near stops)
K = 12; w = [math.exp(-(k / 6.0) ** 2) for k in range(-K, K + 1)]
S = []
for i in range(len(R)):
    sx = sz = sw = 0.0
    for k in range(-K, K + 1):
        j = min(len(R) - 1, max(0, i + k)); sx += R[j][0] * w[k + K]; sz += R[j][1] * w[k + K]; sw += w[k + K]
    S.append([sx / sw, sz / sw])
for _ in range(2):
    S = [S[0]] + [[(S[i - 1][0] + 2 * S[i][0] + S[i + 1][0]) / 4, (S[i - 1][1] + 2 * S[i][1] + S[i + 1][1]) / 4] for i in range(1, len(S) - 1)] + [S[-1]]
# arc length
s = [0.0]
for a, b in zip(S, S[1:]): s.append(s[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
stop_s = [s[i] for i in stop_idx]
def at(d):   # position at arc length d
    lo, hi = 0, len(s) - 1
    while hi - lo > 1:
        m = (lo + hi) // 2
        if s[m] <= d: lo = m
        else: hi = m
    t = (d - s[lo]) / max(1e-9, s[hi] - s[lo]); return [S[lo][0] + (S[hi][0] - S[lo][0]) * t, S[lo][1] + (S[hi][1] - S[lo][1]) * t]
# speed as a function of arc length: cruise, eased (sqrt profile = constant decel) to a crawl at each stop
def speed(d):
    v = CRUISE
    for ss in stop_s:
        g = abs(d - ss)
        if g < EASE: v = min(v, 0.35 + (CRUISE - 0.35) * math.sin(0.5 * math.pi * g / EASE))
    if d < EASE: v = min(v, 0.6 + (CRUISE - 0.6) * d / EASE)   # start gently
    return v
frames, stops_out = [], []
d, si, end = 0.0, 0, s[-1]
def yaw_to(px, pz, tx, tz): return math.atan2(-(tx - px), -(tz - pz))
def lerp_ang(a, b, t):
    dlt = (b - a + math.pi) % (2 * math.pi) - math.pi; return a + dlt * t
look = r["stops"]
yaw_prev = None
while si < len(stop_s) or d < end - 0.05:
    d = min(d, end)
    if d >= end and si < len(stop_s): stop_s[si] = min(stop_s[si], end)   # the last stop sits at the very end of the path
    p = at(d); q = at(min(end, d + 5.0)); yaw = yaw_to(p[0], p[1], q[0], q[1]) if math.hypot(q[0] - p[0], q[1] - p[1]) > 0.3 else yaw_prev
    # turn towards the next structure as we near it
    wt = 0.0; tgt = None
    for k, ss in enumerate(stop_s):
        g = ss - d
        if -3.0 < g < 12.0:
            wt = max(wt, 1 - min(1, max(0, g) / 12.0) if g >= 0 else 1 - min(1, -g / 3.0)); tgt = look[k]["look"]
    if tgt: yaw = lerp_ang(yaw, yaw_to(p[0], p[1], tgt[0], tgt[1]), (wt * wt * (3 - 2 * wt)) * 0.85)
    if yaw_prev is not None: yaw = lerp_ang(yaw_prev, yaw, 0.12)   # damp: no snap turns
    yaw_prev = yaw
    frames.append([round(p[0], 3), round(p[1], 3), round(yaw, 4), round(wt, 3)])
    if si < len(stop_s) and d >= stop_s[si]:
        # dwell: face the structure, a slow few-degree drift so the frame stays alive
        tg = look[si]["look"]; y0 = yaw; y1 = yaw_to(p[0], p[1], tg[0], tg[1]); f0 = len(frames)
        n = int(DWELL * FPS)
        for k in range(n):
            t = k / n; e = min(1, t * 2.2); e = e * e * (3 - 2 * e)
            yaw = lerp_ang(y0, y1, e) + math.radians(3.0) * math.sin(t * math.pi) * 0.5
            frames.append([round(p[0], 3), round(p[1], 3), round(yaw, 4), 1.0])
        yaw_prev = yaw
        stops_out.append({"key": look[si]["key"], "f0": f0, "f1": len(frames) - 1}); si += 1
    d += speed(d) / FPS
json.dump({"fps": FPS, "frames": frames, "stops": stops_out, "looks": {x["key"]: x["look"] for x in look}}, open("tour_cam.json", "w"))
print(len(frames), "frames,", round(len(frames) / FPS, 1), "s; stops", [(x["key"], round(x["f0"] / FPS, 1)) for x in stops_out])
