#!/usr/bin/env python3
"""Convert an ordinary 2D video into a stereoscopic 3D video.

Pipeline, per frame:
  1. Estimate a depth map (AI model if available, otherwise a fast heuristic).
  2. Smooth depth over time so the 3D effect does not flicker.
  3. Render a left-eye and right-eye view by shifting pixels horizontally in
     proportion to their depth (depth-image-based rendering).
  4. Pack the two views as side-by-side (for VR headsets, 3D TVs, YouTube 3D)
     and/or red-cyan anaglyph (for cheap 3D glasses).
The original audio is copied into each output file unchanged.

Usage:
  python convert_to_3d.py input.mp4 -o out/ --format sbs anaglyph
  python convert_to_3d.py input.mp4 -o out/ --depth ai     # best quality
"""
import argparse
import os
import shutil
import subprocess
import sys

import cv2
import numpy as np


# --------------------------------------------------------------------------- depth
class HeuristicDepth:
    """Model-free depth guess: lower in frame and more detailed => closer."""

    def __call__(self, frame_bgr):
        h, w = frame_bgr.shape[:2]
        small = cv2.resize(frame_bgr, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

        # Perspective prior: the bottom of the frame is usually nearer.
        vert = np.linspace(0.0, 1.0, gray.shape[0], dtype=np.float32)[:, None]
        vert = np.repeat(vert, gray.shape[1], axis=1)

        # Detail/focus prior: sharp, textured regions tend to be the subject.
        lap = np.abs(cv2.Laplacian(gray, cv2.CV_32F, ksize=3))
        detail = cv2.GaussianBlur(lap, (0, 0), sigmaX=gray.shape[1] / 30)
        detail = detail / (detail.max() + 1e-6)

        # Centre prior: subjects are usually framed near the middle.
        yy, xx = np.mgrid[0:gray.shape[0], 0:gray.shape[1]].astype(np.float32)
        cx, cy = gray.shape[1] / 2, gray.shape[0] / 2
        centre = 1.0 - np.sqrt(((xx - cx) / cx) ** 2 + ((yy - cy) / cy) ** 2) / np.sqrt(2)

        depth = 0.45 * vert + 0.35 * detail + 0.20 * centre
        depth = cv2.GaussianBlur(depth, (0, 0), sigmaX=3)
        return cv2.resize(depth, (w, h), interpolation=cv2.INTER_LINEAR)


class AIDepth:
    """Depth Anything V2 (monocular depth estimation) via Hugging Face."""

    def __init__(self, model_id, device=None):
        import torch
        from transformers import pipeline

        if device is None:
            device = 0 if torch.cuda.is_available() else -1
        self.pipe = pipeline("depth-estimation", model=model_id, device=device)

    def __call__(self, frame_bgr):
        from PIL import Image

        h, w = frame_bgr.shape[:2]
        img = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
        pred = self.pipe(img)["predicted_depth"]
        depth = pred.squeeze().detach().cpu().numpy().astype(np.float32)
        return cv2.resize(depth, (w, h), interpolation=cv2.INTER_CUBIC)  # larger = nearer


def normalize(depth):
    lo, hi = np.percentile(depth, (2, 98))
    return np.clip((depth - lo) / (hi - lo + 1e-6), 0.0, 1.0)


# ------------------------------------------------------------------------- stereo
def render_stereo(frame, depth, max_disp, convergence):
    """Return (left, right) views. depth in [0,1], 1 = nearest."""
    h, w = depth.shape
    # Positive disparity pops out of the screen, negative sits behind it.
    disp = (depth - convergence) * max_disp
    xs = np.tile(np.arange(w, dtype=np.float32), (h, 1))
    ys = np.tile(np.arange(h, dtype=np.float32)[:, None], (1, w))
    half = (disp / 2.0).astype(np.float32)
    kw = dict(interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    left = cv2.remap(frame, xs + half, ys, **kw)
    right = cv2.remap(frame, xs - half, ys, **kw)
    return left, right


def anaglyph(left, right):
    """Red-cyan anaglyph (half-colour): red from left eye, green+blue from right."""
    out = right.copy()
    gray_l = cv2.cvtColor(left, cv2.COLOR_BGR2GRAY)
    out[:, :, 2] = (0.3 * left[:, :, 2] + 0.7 * gray_l).astype(np.uint8)  # BGR: index 2 = red
    return out


def side_by_side(left, right, half):
    sbs = np.hstack([left, right])
    if half:  # squeeze back to original width (Half-SBS, what most 3D TVs expect)
        sbs = cv2.resize(sbs, (left.shape[1], left.shape[0]), interpolation=cv2.INTER_AREA)
    return sbs


# -------------------------------------------------------------------------- video
def open_writer(path, size, fps, src, crf):
    w, h = size
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
        "-i", src, "-map", "0:v:0", "-map", "1:a?",
        "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", path,
    ]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("-o", "--outdir", default="output")
    ap.add_argument("--format", nargs="+", default=["sbs", "anaglyph"],
                    choices=["sbs", "hsbs", "anaglyph", "depth"],
                    help="sbs=full side-by-side, hsbs=half side-by-side, anaglyph=red/cyan, depth=depth-map preview")
    ap.add_argument("--depth", choices=["auto", "ai", "heuristic"], default="auto")
    ap.add_argument("--model", default="depth-anything/Depth-Anything-V2-Small-hf")
    ap.add_argument("--strength", type=float, default=0.03,
                    help="max disparity as a fraction of frame width (0.02-0.05 is comfortable)")
    ap.add_argument("--convergence", type=float, default=0.4,
                    help="depth level that sits on the screen plane (0=far, 1=near)")
    ap.add_argument("--smooth", type=float, default=0.6, help="temporal depth smoothing 0..0.95")
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--max-frames", type=int, default=0, help="debug: stop after N frames")
    a = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg is required")

    estimator = None
    if a.depth in ("auto", "ai"):
        try:
            estimator = AIDepth(a.model)
            print(f"Depth: AI model {a.model}")
        except Exception as e:  # missing torch/transformers or no network
            if a.depth == "ai":
                sys.exit(f"Could not load AI depth model: {e}")
            print(f"Depth: AI model unavailable ({type(e).__name__}); using heuristic depth")
    if estimator is None:
        estimator = HeuristicDepth()

    cap = cv2.VideoCapture(a.input)
    if not cap.isOpened():
        sys.exit(f"Cannot open {a.input}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    max_disp = a.strength * w

    os.makedirs(a.outdir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(a.input))[0]
    sizes = {"sbs": (2 * w, h), "hsbs": (w, h), "anaglyph": (w, h), "depth": (w, h)}
    writers = {f: open_writer(os.path.join(a.outdir, f"{stem}_3d_{f}.mp4"), sizes[f], fps, a.input, a.crf)
               for f in a.format}

    prev, prev_gray, n = None, None, 0
    while True:
        ok, frame = cap.read()
        if not ok or (a.max_frames and n >= a.max_frames):
            break
        depth = normalize(estimator(frame))

        # Temporal smoothing; reset on scene cuts so depth doesn't bleed across shots.
        gray = cv2.cvtColor(cv2.resize(frame, (64, 36)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        cut = prev_gray is not None and np.mean(np.abs(gray - prev_gray)) > 30
        if prev is not None and not cut:
            depth = a.smooth * prev + (1 - a.smooth) * depth
        prev, prev_gray = depth, gray

        left, right = render_stereo(frame, depth, max_disp, a.convergence)
        outs = {
            "sbs": lambda: side_by_side(left, right, half=False),
            "hsbs": lambda: side_by_side(left, right, half=True),
            "anaglyph": lambda: anaglyph(left, right),
            "depth": lambda: cv2.applyColorMap((depth * 255).astype(np.uint8), cv2.COLORMAP_INFERNO),
        }
        for f, p in writers.items():
            p.stdin.write(np.ascontiguousarray(outs[f]()).tobytes())
        n += 1
        if n % 50 == 0:
            print(f"  {n}/{total} frames", flush=True)

    cap.release()
    for f, p in writers.items():
        p.stdin.close()
        p.wait()
        print(f"Wrote {os.path.join(a.outdir, f'{stem}_3d_{f}.mp4')}")


if __name__ == "__main__":
    main()
