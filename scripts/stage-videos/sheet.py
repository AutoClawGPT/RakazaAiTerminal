#!/usr/bin/env python3
"""contact sheet of a finished video: python3 sheet.py <video.mp4> <out.jpg> [cols=5] [rows=4]"""
import subprocess, sys, tempfile, os, glob
from PIL import Image
v, out = sys.argv[1], sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 5; rows = int(sys.argv[4]) if len(sys.argv) > 4 else 4
d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", v]))
n = cols * rows; tmp = tempfile.mkdtemp()
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", v, "-vf", f"fps={n / d:.5f},scale=288:288", "-frames:v", str(n), f"{tmp}/%03d.png"], check=True)
fs = sorted(glob.glob(tmp + "/*.png"))[:n]
W = Image.new("RGB", (cols * 288, rows * 288))
for i, f in enumerate(fs): W.paste(Image.open(f), ((i % cols) * 288, (i // cols) * 288))
W.save(out, quality=85)
for f in fs: os.remove(f)
os.rmdir(tmp)
