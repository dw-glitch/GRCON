#!/usr/bin/env python3
"""Rebuild GRCON mascot WebMs with a real VP9 alpha plane.

The source clips use a smooth studio backdrop.  We estimate that backdrop from
both vertical borders on every frame, build a foreground matte from colour
distance, retain the central connected subject, and encode straight RGBA to
VP9.  This is an offline asset operation; the browser never performs chroma
keying or per-frame canvas processing.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage


def probe(path: Path) -> tuple[int, int, str]:
    command = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate",
        "-of", "csv=p=0", str(path),
    ]
    width, height, rate = subprocess.check_output(command, text=True).strip().split(",")
    return int(width), int(height), rate


def smoothstep(value: np.ndarray, low: float, high: float) -> np.ndarray:
    value = np.clip((value - low) / (high - low), 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def foreground_alpha(rgb: np.ndarray, candidate_low: float, matte_low: float, matte_high: float) -> np.ndarray:
    height, width, _ = rgb.shape
    border = max(12, min(36, width // 24))
    rgbf = rgb.astype(np.float32)

    left = np.median(rgbf[:, :border], axis=1)
    right = np.median(rgbf[:, -border:], axis=1)
    # A median filter ignores occasional limbs entering one side of a frame.
    filter_size = max(9, (height // 40) | 1)
    left = ndimage.median_filter(left, size=(filter_size, 1), mode="nearest")
    right = ndimage.median_filter(right, size=(filter_size, 1), mode="nearest")
    x = np.linspace(0.0, 1.0, width, dtype=np.float32)[None, :, None]
    background = left[:, None, :] * (1.0 - x) + right[:, None, :] * x

    distance = np.linalg.norm(rgbf - background, axis=2)
    candidate = distance > candidate_low
    candidate = ndimage.binary_opening(candidate, structure=np.ones((3, 3)), iterations=1)
    candidate = ndimage.binary_closing(candidate, structure=np.ones((5, 5)), iterations=2)

    labels, count = ndimage.label(candidate)
    if not count:
        return np.zeros((height, width), dtype=np.uint8)

    center_y, center_x = height / 2.0, width / 2.0
    keep = np.zeros((height, width), dtype=bool)
    for label_id in range(1, count + 1):
        ys, xs = np.where(labels == label_id)
        size = len(xs)
        if size < max(180, width * height // 7000):
            continue
        component_x = float(np.median(xs))
        component_y = float(np.median(ys))
        central = abs(component_x - center_x) < width * 0.47 and abs(component_y - center_y) < height * 0.48
        substantial = size > width * height * 0.006
        if central and substantial:
            keep |= labels == label_id

    keep = ndimage.binary_fill_holes(keep)
    keep = ndimage.binary_dilation(keep, iterations=2)
    matte = smoothstep(distance, matte_low, matte_high)
    matte *= keep
    bottom = np.arange(height, dtype=np.float32)[:, None] > height * 0.82
    matte[bottom & (distance < 60.0)] = 0.0
    matte = ndimage.gaussian_filter(matte, sigma=0.65)
    matte[matte < 0.012] = 0.0
    return np.clip(np.rint(matte * 255.0), 0, 255).astype(np.uint8)


def rebuild(source: Path, destination: Path, cpu_used: int, candidate_low: float, matte_low: float, matte_high: float, max_dimension: int) -> None:
    source_width, source_height, rate = probe(source)
    scale = min(1.0, max_dimension / max(source_width, source_height))
    width = max(2, round(source_width * scale / 2) * 2)
    height = max(2, round(source_height * scale / 2) * 2)
    frame_bytes = width * height * 4
    decoder = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-c:v", "libvpx-vp9", "-i", str(source),
         "-vf", f"scale={width}:{height}:flags=lanczos,format=rgba", "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
        stdout=subprocess.PIPE,
    )
    encoder = subprocess.Popen(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
         "-s", f"{width}x{height}", "-r", rate, "-i", "-", "-an", "-c:v", "libvpx-vp9",
         "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "34",
         "-row-mt", "1", "-cpu-used", str(cpu_used), "-metadata:s:v:0", "alpha_mode=1", str(destination)],
        stdin=subprocess.PIPE,
    )
    assert decoder.stdout is not None and encoder.stdin is not None
    frames = 0
    try:
        while True:
            raw = decoder.stdout.read(frame_bytes)
            if not raw:
                break
            if len(raw) != frame_bytes:
                raise RuntimeError(f"truncated decoded frame in {source}")
            rgba = np.frombuffer(raw, dtype=np.uint8).reshape((height, width, 4)).copy()
            rgba[:, :, 3] = foreground_alpha(rgba[:, :, :3], candidate_low, matte_low, matte_high)
            encoder.stdin.write(rgba.tobytes())
            frames += 1
    finally:
        encoder.stdin.close()
        decoder.stdout.close()
    if decoder.wait() != 0 or encoder.wait() != 0:
        raise RuntimeError(f"ffmpeg failed while rebuilding {source}")
    if frames == 0:
        raise RuntimeError(f"no frames decoded from {source}")
    print(f"{source.name}: {frames} frames -> {destination}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--cpu-used", type=int, default=4)
    parser.add_argument("--candidate-low", type=float, default=27.0)
    parser.add_argument("--matte-low", type=float, default=22.0)
    parser.add_argument("--matte-high", type=float, default=58.0)
    parser.add_argument("--max-dimension", type=int, default=640)
    args = parser.parse_args()
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    rebuild(args.source, args.destination, args.cpu_used, args.candidate_low, args.matte_low, args.matte_high, args.max_dimension)
    return 0


if __name__ == "__main__":
    sys.exit(main())
