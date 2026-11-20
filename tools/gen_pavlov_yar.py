#!/usr/bin/env python3
"""Generator for the "Pavlov Yar" level based on the city map (assets/city-map.png).

Large features (river, bridges, checkpoints, main roads, park) are traced by hand from the map;
the street grid and buildings are placed deterministically (seed).
Game scale: 1 map pixel = 2 m (the original 1:25000 would make the district ~4 km wide; compressed).
Real-world proportions: human 1.8 m, floor 2.8 m, panel slabs 12 m deep.
Anchor points are in zoomed-crop coordinates (cx, cy); c() converts them to metres.
Run: python3 tools/gen_pavlov_yar.py  -> data/levels/pavlov_yar.json (+ preview PNG with --preview)
"""
import json, math, random, sys

SEED = 96
SIZE = [440, 370]


def c(p):  # map crop (cx, cy) -> metres
    return [round(p[0] / 2 - 50, 1), round(p[1] / 2 - 50, 1)]


def cs(pts):
    return [c(p) for p in pts]


# ---- hand-traced from the map ----
WATER = cs([(545, 90), (560, 150), (640, 230), (740, 320), (800, 420), (815, 520), (790, 620),
            (720, 700), (680, 760), (685, 845), (770, 845), (790, 760), (850, 680), (920, 590),
            (925, 500), (910, 390), (850, 290), (750, 190), (665, 110), (650, 90)])
DISTRICT = cs([(195, 255), (340, 285), (420, 235), (525, 160), (640, 250), (740, 340), (790, 430),
               (800, 520), (780, 610), (710, 690), (655, 760), (560, 715), (450, 645), (300, 555),
               (185, 490), (175, 400), (180, 300)])
PARKS = [cs([(200, 180), (330, 170), (420, 230), (400, 270), (340, 290), (250, 260), (190, 250)]),
         cs([(230, 590), (420, 640), (430, 800), (300, 830), (170, 720), (150, 610)])]
ROADS = [
    {"type": "main", "w": 16, "pts": cs([(100, 440), (120, 460), (300, 560), (450, 650), (560, 720), (655, 768)])},
    {"type": "street", "w": 10, "pts": cs([(190, 90), (180, 250), (175, 400), (185, 470), (205, 497)])},
    {"type": "street", "w": 10, "pts": cs([(520, 150), (430, 240), (330, 320), (250, 380), (185, 440)])},
    {"type": "street", "w": 8, "pts": cs([(520, 160), (610, 250), (700, 340), (765, 430), (780, 520), (760, 610), (690, 690), (655, 765)])},
    {"type": "street", "w": 8, "pts": cs([(930, 250), (940, 450), (950, 580), (960, 720), (965, 845)])},
    {"type": "street", "w": 8, "pts": cs([(690, 92), (780, 70), (900, 60), (940, 55)])},
]
BRIDGES = [
    {"w": 10, "pts": cs([(540, 138), (700, 92)])},           # north bridge with checkpoint
    {"w": 14, "pts": cs([(640, 762), (800, 835)])},          # main road bridge
]
BLOCKPOSTS = [
    {"id": "bridge_pavlov_yar_north", "pos": c((607, 115)), "dir": [0.96, -0.28]},
    {"id": "bridge_kazanskaya_east", "pos": c((955, 580)), "dir": [0.0, 1.0]},
]
RAILWAYS = [cs([(100, 705), (260, 668), (410, 628)])]
SPAWN = c((520, 520))


MICRO = [165.0, 118.0, 322.0, 238.0]  # microdistrict of panel blocks (x0, y0, x1, y1)
FLOOR_H = 2.8


def pip(pt, poly):
    x, y = pt
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def dist_seg(p, a, b):
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def dist_line(p, pts):
    return min(dist_seg(p, pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def in_micro(p, margin=0.0):
    return MICRO[0] - margin <= p[0] <= MICRO[2] + margin and MICRO[1] - margin <= p[1] <= MICRO[3] + margin


class SegIndex:
    """Spatial hash of road/street segments with their half-widths."""
    def __init__(self, cell=24.0):
        self.cell = cell
        self.cells = {}

    def add_line(self, pts, hw):
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            x0, x1 = sorted((a[0], b[0])); y0, y1 = sorted((a[1], b[1]))
            for cx in range(int((x0 - hw) // self.cell), int((x1 + hw) // self.cell) + 1):
                for cy in range(int((y0 - hw) // self.cell), int((y1 + hw) // self.cell) + 1):
                    self.cells.setdefault((cx, cy), []).append((a, b, hw))

    def clearance(self, p):
        """Smallest (distance - half-width) to any indexed segment, or large."""
        cx, cy = int(p[0] // self.cell), int(p[1] // self.cell)
        best = 1e9
        for (a, b, hw) in self.cells.get((cx, cy), []):
            best = min(best, dist_seg(p, a, b) - hw)
        return best


ROAD_INDEX = SegIndex()
for r_ in ROADS:
    ROAD_INDEX.add_line(r_["pts"], r_["w"] / 2)
for b_ in BRIDGES:
    ROAD_INDEX.add_line(b_["pts"], b_["w"] / 2)


def near_road(p, margin):
    return ROAD_INDEX.clearance(p) < margin


def free(p, margin=1.5):
    return (0 < p[0] < SIZE[0] and 0 < p[1] < SIZE[1] and not pip(p, WATER)
            and not any(pip(p, pk) for pk in PARKS) and not near_road(p, margin))


def corners(cx, cy, w, d, ang_deg):
    a = math.radians(ang_deg)
    ux, uy = math.cos(a), math.sin(a)
    vx, vy = -uy, ux
    return [(cx - ux * w / 2 - vx * d / 2, cy - uy * w / 2 - vy * d / 2),
            (cx + ux * w / 2 - vx * d / 2, cy + uy * w / 2 - vy * d / 2),
            (cx + ux * w / 2 + vx * d / 2, cy + uy * w / 2 + vy * d / 2),
            (cx - ux * w / 2 + vx * d / 2, cy - uy * w / 2 + vy * d / 2)]


def sat_overlap(A, B):
    for poly in (A, B):
        for i in range(4):
            x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % 4]
            nx, ny = y1 - y2, x2 - x1
            pa = [nx * p[0] + ny * p[1] for p in A]
            pb = [nx * p[0] + ny * p[1] for p in B]
            if max(pa) < min(pb) or max(pb) < min(pa):
                return False
    return True


def bend(x, y, amp=6.0):
    return (x + amp * (math.sin(x / 37 + 1.3) + 0.6 * math.sin(y / 23 + 0.4)),
            y + amp * (math.cos(y / 41 + 2.1) + 0.6 * math.cos(x / 29)))


def resample(pts, step=3.0):
    out = [pts[0]]
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) // step))
        for k in range(1, n + 1):
            out.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
    return out


def hides(b, q):
    """True if building b would cover point q on the isometric screen (q standing behind it)."""
    pts = corners(b[0], b[1], b[2], b[3], b[6])
    scr = [((x - y) * 32.0, (x + y) * 16.0) for x, y in pts]
    qs = ((q[0] - q[1]) * 32.0, (q[0] + q[1]) * 16.0 - 1.25 * 39.19)
    if not (min(p[0] for p in scr) <= qs[0] <= max(p[0] for p in scr)
            and min(p[1] for p in scr) - b[4] * 39.19 <= qs[1] <= max(p[1] for p in scr)):
        return False
    cx, cy = b[0], b[1]
    for i in range(4):
        p0, p1 = pts[i], pts[(i + 1) % 4]
        ex, ey = p1[0] - p0[0], p1[1] - p0[1]
        L = math.hypot(ex, ey)
        ux, uy = ex / L, ey / L
        nx, ny = uy, -ux
        if nx * ((p0[0] + p1[0]) / 2 - cx) + ny * ((p0[1] + p1[1]) / 2 - cy) < 0:
            nx, ny = -nx, -ny
        if nx + ny <= 0.05:
            continue
        along = (q[0] - p0[0]) * ux + (q[1] - p0[1]) * uy
        if -0.5 <= along <= L + 0.5 and (q[0] - p0[0]) * nx + (q[1] - p0[1]) * ny >= 0:
            return False  # in front of a visible face
    return True


def generate():
    rnd = random.Random(SEED)
    buildings = []   # [cx, cy, w, d, h, kind, angle_deg]
    polys = []       # footprints for overlap tests

    def place(cx, cy, w, d, h, kind, ang, margin=1.0, check=True):
        pts = corners(cx, cy, w, d, ang)
        if check:
            bigger = corners(cx, cy, w + 2 * margin, d + 2 * margin, ang)
            samples = pts + [(cx, cy)]
            if not all(pip(q, DISTRICT) or kind in ("barrier", "booth") for q in samples):
                return False
            if not all(free(q, 0.8) and ROAD_INDEX.clearance(q) > 0.8 for q in samples):
                return False
            if any(sat_overlap(bigger, o) for o in polys):
                return False
        polys.append(pts)
        buildings.append([round(cx, 1), round(cy, 1), round(w, 1), round(d, 1), round(h, 1), kind, round(ang, 1)])
        return True

    # ---- microdistrict of panel high-rises (CIS, 2000s): slabs of 5/9 floors, 9-floor point towers (max height in the game is 9 floors) ----
    slabs = [  # cx, cy, w, d, floors, angle
        (205, 134, 72, 12, 9, 0), (276, 134, 48, 12, 5, 0),
        (188, 178, 20, 20, 9, 0), (247, 172, 60, 12, 9, 0), (301, 178, 20, 20, 9, 0),
        (203, 216, 60, 12, 5, 29), (272, 214, 48, 12, 9, 0),
    ]
    for cx, cy, w, d, fl, ang in slabs:
        place(cx, cy, w, d, fl * FLOOR_H, "panel", ang, margin=6.0, check=True)

    # ---- street network: bent grids at two orientations + diagonal connectors ----
    streets = []

    def street_ok(p):
        return (pip(p, DISTRICT) and not pip(p, PARKS[0]) and not pip(p, WATER)
                and not in_micro(p, 2.0) and not near_road(p, -2.0))

    def add_runs(points, w):
        run = []
        for p in points:
            if street_ok(p):
                run.append(p)
            else:
                if len(run) > 3:
                    streets.append({"w": w, "pts": [[round(q[0], 1), round(q[1], 1)] for q in run]})
                run = []
        if len(run) > 3:
            streets.append({"w": w, "pts": [[round(q[0], 1), round(q[1], 1)] for q in run]})

    def region_south(p):
        return p[1] > 0.35 * p[0] + 110

    for ang_deg, su, sv, origin, south in ((29.0, 38.0, 31.0, (120.0, 225.0), True), (0.0, 36.0, 32.0, (14.0, 6.0), False)):
        a = math.radians(ang_deg)
        u = (math.cos(a), math.sin(a)); v = (-u[1], u[0])
        for fam in (0, 1):
            for k in range(-14, 15):
                pts = []
                for i in range(-110, 111):
                    t = i * 3.0
                    if fam == 0:
                        x = origin[0] + u[0] * t + v[0] * k * sv; y = origin[1] + u[1] * t + v[1] * k * sv
                    else:
                        x = origin[0] + v[0] * t + u[0] * k * su; y = origin[1] + v[1] * t + u[1] * k * su
                    q = bend(x, y)
                    pts.append(q if region_south(q) == south else (-999, -999))
                add_runs(pts, 7.0)
    for _ in range(7):  # diagonal connectors, slightly bowed
        for _try in range(40):
            a = (rnd.uniform(40, 340), rnd.uniform(20, 300))
            ang = rnd.uniform(0, math.tau); L = rnd.uniform(55, 100)
            b = (a[0] + math.cos(ang) * L, a[1] + math.sin(ang) * L)
            if pip(a, DISTRICT) and pip(b, DISTRICT):
                mid = ((a[0] + b[0]) / 2 - math.sin(ang) * rnd.uniform(-8, 8), (a[1] + b[1]) / 2 + math.cos(ang) * rnd.uniform(-8, 8))
                curve = resample([a, mid, b], 3.0)
                add_runs(curve, 6.0)
                break
    for y0, x0, x1 in ((150.0, 160.0, 326.0), (192.0, 160.0, 326.0)):  # courtyard drives between the slab rows
        drive = [bend(x, y0, 1.5) for x in [x0 + i * 3.0 for i in range(int((x1 - x0) / 3.0) + 1)]]
        streets.append({"w": 6.0, "pts": [[round(q[0], 1), round(q[1], 1)] for q in drive]})
    street_index = SegIndex()
    for st in streets:
        street_index.add_line(st["pts"], st["w"] / 2)
        ROAD_INDEX.add_line(st["pts"], st["w"] / 2)

    # ---- lots along streets: buildings follow the street direction ----
    for st in streets:
        pts = st["pts"]; hw = st["w"] / 2
        dist_acc = 0.0
        next_at = rnd.uniform(2, 8)
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            seg = math.hypot(b[0] - a[0], b[1] - a[1])
            if seg == 0:
                continue
            tx, ty = (b[0] - a[0]) / seg, (b[1] - a[1]) / seg
            nx, ny = -ty, tx
            ang = math.degrees(math.atan2(ty, tx))
            while next_at <= dist_acc + seg:
                f = next_at - dist_acc
                px, py = a[0] + tx * f, a[1] + ty * f
                kindroll = rnd.random()
                for side in (-1, 1):
                    if rnd.random() < 0.2:
                        continue
                    if kindroll < 0.12:
                        w, d, h, kind = rnd.uniform(18, 26), 5.5, 2.8, "garage_row"
                    elif kindroll < 0.16:
                        w, d, h, kind = 36.0, 12.0, 5 * FLOOR_H, "panel"
                    else:
                        w, d, h, kind = rnd.uniform(8, 12), rnd.uniform(7, 10), rnd.choice([3.2, 3.2, 3.2, 6.0, 6.0, 9.0]), "house"
                    off = hw + 2.5 + d / 2
                    cx, cy = px + nx * side * off, py + ny * side * off
                    ok = place(cx, cy, w, d, h, kind, ang + rnd.uniform(-3, 3))
                    if kind == "house" and rnd.random() < 0.6:  # second row behind the first (backyard houses)
                        w2, d2 = rnd.uniform(7, 10), rnd.uniform(6, 9)
                        place(px + nx * side * (hw + 2.5 + d + 5 + d2 / 2), py + ny * side * (hw + 2.5 + d + 5 + d2 / 2),
                              w2, d2, rnd.choice([3.2, 3.2, 6.0]), "house", ang + rnd.uniform(-6, 6))
                    if ok and kind == "house" and rnd.random() < 0.5:
                        place(cx + tx * (w / 2 + 2.5), cy + ty * (w / 2 + 2.5) + side * 0, 3.0, 3.0, 2.4, "shed", ang, margin=0.5)
                next_at += rnd.uniform(9, 13)
            dist_acc += seg

    # ---- checkpoints: two concrete barriers flanking the passage + a booth ----
    for bp in BLOCKPOSTS:
        px, py = bp["pos"]; dx, dy = bp["dir"]
        nx, ny = -dy, dx
        ang = math.degrees(math.atan2(ny, nx))
        for s in (-1, 1):
            place(px + nx * s * 4.0, py + ny * s * 4.0, 3.0, 0.8, 1.1, "barrier", ang, check=False)
        place(px + nx * 9.0, py + ny * 9.0, 3.0, 3.0, 2.7, "booth", math.degrees(math.atan2(dy, dx)), check=False)

    def blocked(pt):
        return any(pip(pt, o) or min(dist_seg(pt, o[i], o[(i + 1) % 4]) for i in range(4)) < 3.0 for o in polys)

    spawn = SPAWN
    for r in range(0, 90, 2):
        found = None
        for a in range(0, 360, 20):
            q = (SPAWN[0] + r * math.cos(math.radians(a)), SPAWN[1] + r * math.sin(math.radians(a)))
            # do not spawn right behind a high-rise (in the isometric view it would hide the player)
            covered = any(hides(b, q) for b in buildings if b[5] in ("panel", "house") and b[4] > 5)
            if free(q, 0.0) and not blocked(q) and not covered:
                found = q
                break
        if found:
            spawn = list(found)
            break
    return {
        "name": "Pavlov Yar (from the map: river, bridges, roads, park; buildings are generated)",
        "scale_note": "1 map pixel = 2 m; district compressed relative to 1:25000",
        "size": SIZE, "spawn": [round(spawn[0], 1), round(spawn[1], 1)],
        "water": [WATER], "district": DISTRICT, "parks": PARKS,
        "roads": ROADS, "streets": streets, "bridges": BRIDGES, "railways": RAILWAYS,
        "blockposts": BLOCKPOSTS, "buildings": buildings,
    }


if __name__ == "__main__":
    d = generate()
    assert free(d["spawn"], 0.0), "spawn is not on free ground: " + str(d["spawn"])
    with open("data/levels/pavlov_yar.json", "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print("buildings:", len(d["buildings"]), "street pieces:", len(d["streets"]))
    if "--preview" in sys.argv:
        from PIL import Image, ImageDraw
        S = 4
        im = Image.new("RGB", (SIZE[0] * S, SIZE[1] * S), (27, 31, 42))
        dr = ImageDraw.Draw(im)
        P = lambda pts: [(p[0] * S, p[1] * S) for p in pts]
        for pk in d["parks"]: dr.polygon(P(pk), fill=(36, 60, 44))
        for w in d["water"]: dr.polygon(P(w), fill=(40, 70, 110))
        for r in d["roads"]: dr.line(P(r["pts"]), fill=(80, 80, 90), width=int(r["w"] * S), joint="curve")
        for st in d["streets"]: dr.line(P(st["pts"]), fill=(66, 66, 76), width=int(st["w"] * S), joint="curve")
        for b in d["bridges"]: dr.line(P(b["pts"]), fill=(120, 110, 100), width=int(b["w"] * S))
        for b in d["buildings"]:
            col = {"house": (150, 150, 180), "garage_row": (120, 120, 140), "panel": (210, 210, 230), "shed": (110, 100, 100)}.get(b[5], (200, 80, 80))
            dr.polygon(P(corners(b[0], b[1], b[2], b[3], b[6])), fill=col)
        for bp in d["blockposts"]:
            x, y = bp["pos"]; dr.ellipse([(x - 4) * S, (y - 4) * S, (x + 4) * S, (y + 4) * S], outline=(255, 60, 60), width=3)
        sx, sy = d["spawn"]; dr.ellipse([(sx - 2) * S, (sy - 2) * S, (sx + 2) * S, (sy + 2) * S], fill=(255, 61, 129))
        im.save("/tmp/claude-0/preview.png")
