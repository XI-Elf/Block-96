#!/usr/bin/env python3
"""Генератор уровня «Павлов Яр» по карте города (assets/city-map.png).

Крупные элементы (река, мосты, блокпосты, главные дороги, парк) обведены вручную
по карте; уличная сетка и здания расставляются детерминированно (seed).
Масштаб игры: 1 пиксель карты = 2 м (в оригинале 1:25000 → район был бы ~4 км; сжато).
Опорные точки заданы в координатах увеличенного фрагмента (cx, cy), перевод в метры в c().
Запуск: python3 tools/gen_pavlov_yar.py  → data/levels/pavlov_yar.json (+ превью PNG при --preview)
"""
import json, math, random, sys

SEED = 96
SIZE = [440, 370]


def c(p):  # фрагмент карты (cx, cy) -> метры
    return [round(p[0] / 2 - 50, 1), round(p[1] / 2 - 50, 1)]


def cs(pts):
    return [c(p) for p in pts]


# ---- ручная трассировка по карте ----
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
    {"w": 10, "pts": cs([(540, 138), (700, 92)])},           # северный мост с блокпостом
    {"w": 14, "pts": cs([(640, 762), (800, 835)])},          # мост главной дороги
]
BLOCKPOSTS = [
    {"id": "bridge_pavlov_yar_north", "pos": c((607, 115)), "dir": [0.96, -0.28]},
    {"id": "bridge_kazanskaya_east", "pos": c((955, 580)), "dir": [0.0, 1.0]},
]
RAILWAYS = [cs([(100, 705), (260, 668), (410, 628)])]
SPAWN = c((520, 520))


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


def near_road(p, margin):
    for r in ROADS:
        if dist_line(p, r["pts"]) < r["w"] / 2 + margin:
            return True
    for b in BRIDGES:
        if dist_line(p, b["pts"]) < b["w"] / 2 + margin:
            return True
    return False


def free(p, margin=1.5):
    return (0 < p[0] < SIZE[0] and 0 < p[1] < SIZE[1] and not pip(p, WATER)
            and not any(pip(p, pk) for pk in PARKS) and not near_road(p, margin))


def generate():
    rnd = random.Random(SEED)
    buildings = []
    streets = []
    GX, GY, OX, OY, SW = 36.0, 32.0, 14.0, 6.0, 6.0

    # уличная сетка внутри района (куски линий, лежащие в районе и вне больших дорог)
    def clip(line_pts):
        cur = []
        out = []
        for p in line_pts:
            if pip(p, DISTRICT) and not pip(p, PARKS[0]) and not near_road(p, -2):
                cur.append([round(p[0], 1), round(p[1], 1)])
            else:
                if len(cur) > 1: out.append(cur)
                cur = []
        if len(cur) > 1: out.append(cur)
        return out

    x = OX
    while x < SIZE[0]:
        streets += clip([(x, y) for y in [i * 2.0 for i in range(int(SIZE[1] / 2))]])
        x += GX
    y = OY
    while y < SIZE[1]:
        streets += clip([(xx, y) for xx in [i * 2.0 for i in range(int(SIZE[0] / 2))]])
        y += GY

    # кварталы -> здания
    ix = 0
    x = OX
    while x + GX < SIZE[0]:
        y = OY
        while y + GY < SIZE[1]:
            bx0, by0 = x + SW / 2 + 2, y + SW / 2 + 2
            bx1, by1 = x + GX - SW / 2 - 2, y + GY - SW / 2 - 2
            corners = [(bx0, by0), (bx1, by0), (bx1, by1), (bx0, by1), ((bx0 + bx1) / 2, (by0 + by1) / 2)]
            if sum(1 for q in corners if pip(q, DISTRICT) and free(q, 0.3)) >= 5 or (sum(1 for q in corners if pip(q, DISTRICT) and free(q, 0.3)) >= 4 and free(corners[4], 0.3)):
                kind_block = rnd.random()
                bw, bd = bx1 - bx0, by1 - by0
                if kind_block < 0.22:  # гаражный кооператив: параллельные ряды
                    gy = by0
                    while gy + 5 <= by1:
                        buildings.append([round(bx0 + rnd.uniform(0, 2), 1), round(gy, 1),
                                          round(bw - rnd.uniform(0, 4), 1), 5.0, 2.8, "garage_row"])
                        gy += 9
                else:  # частные дома и сараи
                    for (lx, ly) in [(0, 0), (1, 0), (0, 1), (1, 1)]:
                        if rnd.random() < 0.18:
                            continue
                        w = rnd.uniform(8, 12); d = rnd.uniform(7, 10)
                        px = bx0 + lx * (bw / 2) + rnd.uniform(0, max(0.1, bw / 2 - w))
                        py = by0 + ly * (bd / 2) + rnd.uniform(0, max(0.1, bd / 2 - d))
                        buildings.append([round(px, 1), round(py, 1), round(w, 1), round(d, 1),
                                          round(rnd.choice([3.5, 3.5, 4.5, 6.0]), 1), "house"])
                        if rnd.random() < 0.5:
                            buildings.append([round(px + w + 0.8, 1), round(py + 1, 1), 3.0, 3.0, 2.4, "shed"])
            y += GY
        x += GX

    # блокпосты: два бетонных барьера по бокам проезда + будка
    barriers = []
    for bp in BLOCKPOSTS:
        px, py = bp["pos"]; dx, dy = bp["dir"]
        nx, ny = -dy, dx
        for s in (-1, 1):
            cx, cy = px + nx * s * 4.0, py + ny * s * 4.0
            barriers.append([round(cx - 1.5, 1), round(cy - 1.5, 1), 3.0, 3.0, 1.2, "barrier"])
        buildings.append([round(px + nx * 6.5 - 2, 1), round(py + ny * 6.5 - 2, 1), 4.0, 4.0, 3.0, "booth"])
    buildings += barriers

    def blocked(pt):
        return any(b[0] - 1 <= pt[0] <= b[0] + b[2] + 1 and b[1] - 1 <= pt[1] <= b[1] + b[3] + 1 for b in buildings)
    spawn = SPAWN
    for r in range(0, 60, 2):
        found = None
        for a in range(0, 360, 20):
            q = (SPAWN[0] + r * math.cos(math.radians(a)), SPAWN[1] + r * math.sin(math.radians(a)))
            if free(q, 0.0) and not blocked(q):
                found = q
                break
        if found:
            spawn = list(found)
            break
    return {
        "name": "Павлов Яр (по карте: река, мосты, дороги, парк; здания генерируются)",
        "scale_note": "1 пиксель карты = 2 м; район сжат относительно 1:25000",
        "size": SIZE, "spawn": [round(spawn[0], 1), round(spawn[1], 1)],
        "water": [WATER], "district": DISTRICT, "parks": PARKS,
        "roads": ROADS, "streets": streets, "bridges": BRIDGES, "railways": RAILWAYS,
        "blockposts": BLOCKPOSTS, "buildings": buildings,
    }


if __name__ == "__main__":
    d = generate()
    assert free(d["spawn"], 0.0), "spawn не на свободной земле: " + str(d["spawn"])
    with open("data/levels/pavlov_yar.json", "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    print("зданий:", len(d["buildings"]), "кусков улиц:", len(d["streets"]))
    if "--preview" in sys.argv:
        from PIL import Image, ImageDraw
        S = 4
        im = Image.new("RGB", (SIZE[0] * S, SIZE[1] * S), (27, 31, 42))
        dr = ImageDraw.Draw(im)
        P = lambda pts: [(p[0] * S, p[1] * S) for p in pts]
        for pk in d["parks"]: dr.polygon(P(pk), fill=(36, 60, 44))
        for w in d["water"]: dr.polygon(P(w), fill=(40, 70, 110))
        for r in d["roads"]: dr.line(P(r["pts"]), fill=(80, 80, 90), width=r["w"] * S)
        for s in d["streets"]: dr.line(P(s), fill=(66, 66, 76), width=6 * S)
        for b in d["bridges"]: dr.line(P(b["pts"]), fill=(120, 110, 100), width=b["w"] * S)
        for b in d["buildings"]:
            col = {"house": (150, 150, 180), "garage_row": (120, 120, 140), "shed": (110, 100, 100)}.get(b[5], (200, 80, 80))
            dr.rectangle([b[0] * S, b[1] * S, (b[0] + b[2]) * S, (b[1] + b[3]) * S], fill=col)
        for bp in d["blockposts"]:
            x, y = bp["pos"]; dr.ellipse([(x - 4) * S, (y - 4) * S, (x + 4) * S, (y + 4) * S], outline=(255, 60, 60), width=3)
        sx, sy = d["spawn"]; dr.ellipse([(sx - 2) * S, (sy - 2) * S, (sx + 2) * S, (sy + 2) * S], fill=(255, 61, 129))
        im.save("/tmp/claude-0/preview.png")
