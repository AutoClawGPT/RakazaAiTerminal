#!/usr/bin/env python3
"""Step 4: turn the captured stage frames (transparent PNGs of the real 3D stage) into the finished video.

  python3 compose.py <video-id>      (ids: see VIDEOS below)

Adds: stage-light background (beams + floor glow that follow the beat), burned-in karaoke lyrics, a now-playing label
with an equaliser, a brand pill and a short Rakaza AI Terminal end card; muxes the real song audio (cut + fades).
Writes public/memes/video/<id>.mp4 + .jpg and public/memes/og/<id>.jpg. Needs numpy + Pillow + ffmpeg.
"""
import json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SV = os.environ.get("SV", "/workspace/sv")
G = "/usr/share/fonts/truetype/sand-box/google/"
LG = G + "Luckiest Guy/LuckiestGuy-Regular.ttf"
AB = G + "Archivo Black/ArchivoBlack-Regular.ttf"
INK = (23, 10, 54); MUS = (255, 200, 61); PINK = (255, 64, 160); LAV = (236, 228, 255); WHITE = (255, 255, 255)
PAL = [(157, 123, 255), (255, 111, 181), (77, 225, 255), (255, 207, 90)]
W = H = 720
FPS = 30
URL = "rakaza-ai-terminal.vercel.app"

# lyric lines: (start, end, [(shown word, sung length)]) in song seconds. Times come from word timestamps of the song
# (faster-whisper) and are spread over each line by how long each sung word is.
def L(a, b, text):
    toks = []
    for w in text.split():
        sung = {"pump.fun": "pump dot fun", "skill.md": "skill dot m d", "AI": "A I", "100%": "one hundred percent", "70": "seventy", "30": "thirty"}.get(w.strip(",!."), w)
        toks.append((w, len(sung) + (3 if w[-1] in ",!." else 0)))
    return (a, b, toks)

VIDEOS = {
    "rakaza-sings-launch": dict(
        song="rakaza-song-1.mp3", title="Rakaza Launch", feed="feed1.json", frames="frames1", start=15.9, dur=18.54, poster_t=17.3,
        lines=[
            L(15.95, 19.95, "Rakaza AI Terminal, launch it, launch it"),
            L(20.1, 22.95, "River AI brain, it's electric"),
            L(23.2, 26.9, "Agents sign in with skill.md"),
            L(27.1, 30.6, "Do your own research, it's not financial advice"),
            L(30.7, 33.9, "Rakaza, Rakaza, let's go!"),
        ]),
    "rakaza-dances-launch-v2": dict(
        song="rakaza-song-2.mp3", title="Rakaza Launch v2", feed="feed2.json", frames="frames2", start=12.35, dur=20.8, poster_t=20.4,
        lines=[
            L(12.4, 15.8, "Or self launch and keep it all, 100%"),
            L(15.9, 19.8, "Rakaza AI Terminal, launch it, launch it"),
            L(19.9, 22.5, "River AI brain, it's electric"),
            L(22.6, 26.0, "Agents sign in with skill.md"),
            L(26.1, 30.7, "Do your own research, it's not financial advice"),
            L(30.9, 33.17, "Rakaza, Rakaza, let's go!"),
        ]),
}
END = 3.0  # seconds of end card at the end

_fonts = {}
def font(p, s):
    k = (p, s)
    if k not in _fonts: _fonts[k] = ImageFont.truetype(p, s)
    return _fonts[k]

def ease_out_back(x):
    x = min(max(x, 0), 1); c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2

def lerp(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

_bgbase = None
def background(t, f, k):
    """stage lights: dark gradient, 3 swinging beams, floor glow, bokeh crowd lights, beat flash"""
    global _bgbase
    s = 360
    if _bgbase is None:
        y = np.linspace(0, 1, s)[:, None, None]
        top = np.array([14, 6, 40], np.float32); mid = np.array([38, 18, 84], np.float32); bot = np.array([22, 10, 52], np.float32)
        g = np.where(y < 0.6, top + (mid - top) * (y / 0.6), mid + (bot - mid) * ((y - 0.6) / 0.4))
        _bgbase = np.repeat(g, s, axis=1).astype(np.float32)
    beat = f["beat"]; frac = beat - math.floor(beat); pulse = math.exp(-5 * frac); bass = f["bass"]
    base = _bgbase.copy()
    lay = Image.new("RGB", (s, s), (0, 0, 0)); d = ImageDraw.Draw(lay)
    kk = int(beat // 4)
    for j, (ox, ph) in enumerate([(0.12, 0.0), (0.5, 2.1), (0.88, 4.0)]):
        col = PAL[(kk + j) % 4]
        sw = math.sin(t * (0.9 + 0.2 * j) + ph) * 0.22
        x0 = ox * s; x1 = (ox + sw * (1 if j != 1 else -1) + (0.5 - ox) * 0.35) * s
        wid = 0.07 * s * (1 + 0.5 * pulse)
        a = (0.55 + 0.45 * pulse) * (0.8 + 0.5 * bass)
        c = tuple(int(v * a * 0.75) for v in col)
        d.polygon([(x0 - 6, 0), (x0 + 6, 0), (x1 + wid, s * 0.86), (x1 - wid, s * 0.86)], fill=c)
    lay = lay.filter(ImageFilter.GaussianBlur(7))
    floor = Image.new("RGB", (s, s), (0, 0, 0)); fd = ImageDraw.Draw(floor)
    fc = PAL[(kk + 1) % 4]; fa = 0.45 + 0.4 * pulse + 0.4 * bass
    fd.ellipse([s * 0.08, s * 0.80, s * 0.92, s * 1.0], fill=tuple(int(v * fa * 0.8) for v in fc))
    floor = floor.filter(ImageFilter.GaussianBlur(12))
    a = base + np.asarray(lay, np.float32) + np.asarray(floor, np.float32)
    a = np.clip(a * (1 + 0.14 * pulse * (0.5 + f["energy"])), 0, 255)
    im = Image.fromarray(a.astype(np.uint8)).resize((W, H), Image.BILINEAR).convert("RGBA")
    d = ImageDraw.Draw(im, "RGBA")
    # bokeh crowd lights along the horizon
    for i in range(14):
        x = (i * 53 + 17) % W; y = 430 + (i * 37) % 70
        r = 5 + (i % 3) * 3 + 3 * pulse; col = PAL[(i + kk) % 4]
        al = int(70 + 70 * (0.5 + 0.5 * math.sin(t * 3 + i * 1.7)))
        d.ellipse([x - r, y - r, x + r, y + r], fill=col + (al,))
    # sparkles
    for i in range(10):
        x = (i * 97 + 31 + 24 * math.sin(t * 0.6 + i)) % W; y = (i * 61 + 13 - t * 18) % H
        sz = (6 + (i % 3) * 3) * (0.6 + 0.4 * math.sin(t * 5 + i))
        d.polygon([(x, y - sz), (x + sz * .25, y - sz * .25), (x + sz, y), (x + sz * .25, y + sz * .25), (x, y + sz), (x - sz * .25, y + sz * .25), (x - sz, y), (x - sz * .25, y - sz * .25)], fill=(255, 220, 120, 150))
    return im

def glow_from(av, col, amt):
    """soft coloured halo behind the avatar (rim glow), from the alpha channel"""
    al = av.getchannel("A").resize((W // 3, H // 3)).filter(ImageFilter.GaussianBlur(9)).resize((W, H), Image.BILINEAR)
    tint = Image.new("RGBA", (W, H), col + (0,)); tint.putalpha(al.point(lambda v: int(v * amt)))
    return tint

def text_stroked(d, xy, txt, f, fill, sw, stroke=INK, shadow=PINK, off=4):
    x, y = xy
    d.text((x + off, y + off), txt, font=f, fill=shadow, stroke_width=sw, stroke_fill=shadow)
    d.text((x, y), txt, font=f, fill=fill, stroke_width=sw, stroke_fill=stroke)

def word_times(line):
    a, b, toks = line
    tot = sum(w for _, w in toks); acc = 0; out = []
    span = b - a
    for txt, w in toks:
        out.append((a + span * acc / tot, a + span * (acc + w) / tot)); acc += w
    return out

def layout(line, fs):
    """split a line into <=2 rows that fit, returns rows of token indices"""
    a, b, toks = line
    f = font(LG, fs); d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    maxw = W * 0.88
    full = " ".join(t for t, _ in toks)
    if d0.textlength(full, font=f) <= maxw: return [list(range(len(toks)))]
    best = None
    for cut in range(1, len(toks)):
        r1 = " ".join(t for t, _ in toks[:cut]); r2 = " ".join(t for t, _ in toks[cut:])
        m = max(d0.textlength(r1, font=f), d0.textlength(r2, font=f))
        if best is None or m < best[0]: best = (m, cut)
    return [list(range(best[1])), list(range(best[1], len(toks)))]

def caption(im, t, lines, fade_out, shift=0):
    cur = None
    for ln in lines:
        if ln[0] - 0.05 <= t <= ln[1] + 0.35: cur = ln
    if cur is None: return
    a, b, toks = cur
    wt = word_times(cur)
    fs = 56
    rows = layout(cur, fs)
    while True:
        f = font(LG, fs); d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        if max(d0.textlength(" ".join(toks[i][0] for i in r), font=f) for r in rows) <= W * 0.9 or fs < 34: break
        fs -= 3
    f = font(LG, fs)
    age = t - (a - 0.05); pop = ease_out_back(age / 0.22)
    vis = min(1.0, max(0.0, (b + 0.35 - t) / 0.2)) * min(1.0, age / 0.08) * (1 - fade_out)
    if vis <= 0: return
    lh = int(fs * 1.12); sw = max(4, fs // 9)
    pw, ph = W, lh * len(rows) + 30
    lay = Image.new("RGBA", (pw, ph), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for ri, r in enumerate(rows):
        rw = d0.textlength(" ".join(toks[i][0] for i in r), font=f)
        x = (pw - rw) / 2; y = 12 + ri * lh
        for i in r:
            wd = toks[i][0]; st, en = wt[i]
            if t >= en: col, sc = WHITE, 1.0
            elif t >= st: col, sc = MUS, 1.0 + 0.16 * ease_out_back((t - st) / 0.12)
            else: col, sc = (200, 190, 235), 1.0
            lift = -fs * 0.12 * math.exp(-9 * (t - st)) if st <= t < st + 0.5 else 0  # the sung word pops up
            text_stroked(d, (x, y + lift), wd, f, col, sw)
            x += d0.textlength(wd + " ", font=f)
    s = 0.88 + 0.12 * pop
    lay = lay.resize((int(pw * s), int(ph * s)), Image.BICUBIC)
    if vis < 1: lay.putalpha(lay.getchannel("A").point(lambda v: int(v * vis)))
    # soft scrim under the lyrics so they read on any light
    y0 = H - 40 - shift - lay.height
    im.alpha_composite(lay, (int((W - lay.width) / 2), int(y0)))

def hud(im, t, f, title):
    d = ImageDraw.Draw(im, "RGBA")
    d.rounded_rectangle([16, 16, 16 + 150, 16 + 40], radius=20, fill=INK + (225,), outline=LAV + (255,), width=3)
    d.text((91, 36), "RAKAZA", font=font(AB, 22), fill=MUS, anchor="mm")
    # now playing + equaliser
    tw = d.textlength(title, font=font(AB, 17))
    x1 = W - 16; x0 = x1 - (tw + 92)
    d.rounded_rectangle([x0, 16, x1, 56], radius=20, fill=INK + (200,), outline=PINK + (255,), width=2)
    for i in range(6):
        h = 5 + 22 * min(1, f["bars"][i * 2 + 1] * 1.25)
        bx = x0 + 16 + i * 8
        d.rectangle([bx, 36 + 11 - h, bx + 5, 36 + 11], fill=MUS if i % 2 == 0 else PINK)
    d.text((x0 + 70, 36), title, font=font(AB, 17), fill=LAV, anchor="lm")

_logo = None
def end_card(im, p):
    """p 0..1: a slim brand bar slides up at the bottom while the lyrics move up above it"""
    global _logo
    if p <= 0: return
    if _logo is None:
        lg = Image.open(os.path.join(APP, "public/brand/profile-320.jpg")).convert("RGB").resize((76, 76), Image.LANCZOS)
        m = Image.new("L", (76, 76), 0); ImageDraw.Draw(m).ellipse([0, 0, 75, 75], fill=255)
        _logo = Image.new("RGBA", (76, 76), (0, 0, 0, 0)); _logo.paste(lg, (0, 0), m)
    e = ease_out_back(p)
    bh = 104
    lay = Image.new("RGBA", (W, bh + 12), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    x0, x1, y0, y1 = 24, W - 24, 4, bh
    d.rounded_rectangle([x0 + 4, y0 + 5, x1 + 4, y1 + 5], radius=26, fill=PINK + (255,))
    d.rounded_rectangle([x0, y0, x1, y1], radius=26, fill=INK + (242,), outline=MUS + (255,), width=3)
    lay.alpha_composite(_logo, (x0 + 14, y0 + 14))
    tx = x0 + 14 + 76 + 18
    d.text((tx, 33), "Rakaza AI Terminal", font=font(LG, 36), fill=MUS, anchor="lm", stroke_width=2, stroke_fill=INK)
    d.text((tx, 64), URL, font=font(AB, 20), fill=WHITE, anchor="lm")
    d.text((tx, 87), "fictional AI character · entertainment only · not financial advice", font=font(AB, 11), fill=LAV + (220,), anchor="lm")
    lay.putalpha(lay.getchannel("A").point(lambda v: int(v * min(1, p * 2.5))))
    im.alpha_composite(lay, (0, H - bh - 14 + int((1 - e) * 130)))

def frame_at(cfg, feed, i, t_vid, total_s):
    n = i + 1
    path = os.path.join(SV, cfg["frames"], f"{n:05d}.png")
    song_t = cfg["start"] + t_vid
    fi = min(len(feed["frames"]) - 1, int(round(song_t * FPS)))
    f = feed["frames"][fi]
    im = background(song_t, f, 0)
    av = Image.open(path).convert("RGBA").resize((W, H), Image.LANCZOS)
    kk = int(f["beat"] // 4)
    im.alpha_composite(glow_from(av, PAL[(kk + 2) % 4], 0.32 + 0.25 * f["bass"]))
    im.alpha_composite(av)
    # vignette
    im.alpha_composite(VIG)
    ep = (t_vid - (total_s - END)) / 0.45
    ep = min(1, max(0, ep))
    caption(im, song_t, cfg["lines"], fade_out=0, shift=int(96 * min(1, ep * 4)))
    hud(im, song_t, f, cfg["title"])
    end_card(im, ep)
    # fades
    fin = min(1, t_vid / 0.25); fout = min(1, max(0, (total_s - t_vid) / 0.35)) if total_s - t_vid < 0.35 else 1
    k = min(fin, fout)
    if k < 1:
        blk = Image.new("RGBA", (W, H), (10, 4, 28, int(255 * (1 - k)))); im.alpha_composite(blk)
    return im

def make_vig():
    y, x = np.ogrid[:H, :W]; r = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
    a = np.clip((r - 0.7) * 0.5, 0, 0.45) * 255
    v = np.zeros((H, W, 4), np.uint8); v[..., 0] = 8; v[..., 1] = 3; v[..., 2] = 24; v[..., 3] = a.astype(np.uint8)
    return Image.fromarray(v, "RGBA")
VIG = make_vig()

def og_card(poster, out):
    bg = poster.resize((1200, 1200), Image.LANCZOS).crop((0, 285, 1200, 915)).filter(ImageFilter.GaussianBlur(24))
    bg = Image.eval(bg, lambda v: int(v * 0.55))
    c = Image.new("RGB", (1200, 630), INK); c.paste(bg, (0, 0))
    sq = poster.resize((560, 560), Image.LANCZOS); c.paste(sq, (320, 0))
    d = ImageDraw.Draw(c); d.rectangle([0, 569, 1200, 630], fill=INK)
    d.text((600, 600), "RAKAZA  ·  " + URL, font=font(AB, 30), fill=MUS, anchor="mm")
    c.save(out, quality=88)

def main(vid):
    cfg = VIDEOS[vid]
    feed = json.load(open(os.path.join(SV, cfg["feed"])))
    total_s = cfg["dur"]; n = int(round(total_s * FPS))
    have = len([x for x in os.listdir(os.path.join(SV, cfg["frames"])) if x.endswith(".png")])
    assert have >= n, f"need {n} frames, have {have}"
    mp4 = os.path.join(APP, "public/memes/video", vid + ".mp4")
    os.makedirs(os.path.dirname(mp4), exist_ok=True)
    song = os.path.join(APP, "public/songs", cfg["song"])
    crf = int(os.environ.get("CRF", "24"))
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-ss", f"{cfg['start']:.3f}", "-t", f"{total_s:.3f}", "-i", song,
           "-af", f"afade=t=in:st=0:d=0.2,afade=t=out:st={total_s - 0.8:.3f}:d=0.8",
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p", "-r", str(FPS),
           "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-movflags", "+faststart", "-shortest", mp4]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    pi = int(round(cfg["poster_t"] - cfg["start"]) * FPS)
    for i in range(n):
        im = frame_at(cfg, feed, i, i / FPS, total_s)
        pr.stdin.write(np.asarray(im.convert("RGB")).tobytes())
        if i == pi:
            poster = im.convert("RGB"); poster.save(os.path.join(APP, "public/memes/video", vid + ".jpg"), quality=86)
        if i % 100 == 0: print(vid, i, n, flush=True)
    pr.stdin.close(); pr.wait()
    og_card(poster, os.path.join(APP, "public/memes/og", vid + ".jpg"))
    print("size", os.path.getsize(mp4))

if __name__ == "__main__":
    main(sys.argv[1])
