#!/usr/bin/env python3
"""Transforma um clipe do mascote gravado sobre fundo rosa/magenta em WebM VP9 com alfa real.

Offline (o navegador nunca faz chroma key). O fundo é magenta: nele o canal verde é
muito menor que o menor entre vermelho e azul. O robô (branco, azul, preto) tem essa
diferença próxima de zero. A diferença dá o alfa; o excesso de magenta nas bordas é
removido (despill). Os quadros são recortados num quadrado comum e o laço é escolhido
pelo par de quadros com poses mais parecidas, para que o loop do <video> não pule.

Somente numpy (sem scipy). Uso:
  rebuild_mascot_pink_alpha.py origem.mp4 destino.webm [--size 448] [--min-loop 20]
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import numpy as np


def probe(path: Path) -> tuple[int, int, str]:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate", "-of", "csv=p=0", str(path)], text=True).strip()
    width, height, rate = out.split(",")
    return int(width), int(height), rate


def smoothstep(x: np.ndarray, low: float, high: float) -> np.ndarray:
    t = np.clip((x - low) / (high - low), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def key_frame(rgb: np.ndarray, low: float, high: float) -> np.ndarray:
    """Devolve RGBA (uint8) com alfa pelo magenta e despill."""
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    magenta = np.minimum(r, b) - g            # ~100-190 no fundo, ~0 no robô
    alpha = 1.0 - smoothstep(magenta, low, high)
    spill = np.maximum(magenta, 0.0)
    # Despill proporcional: tira o magenta que sobrou nas bordas semitransparentes.
    k = np.clip(1.0 - alpha * 0.0, 0.0, 1.0)
    r2 = np.where(r > g, r - spill * k * (r >= b), r)
    b2 = np.where(b > g, b - spill * k * (b > r), b)
    r2 = np.clip(np.where(alpha < 0.999, np.minimum(r, g + 0.15 * spill + 6.0), r2), 0, 255)
    b2 = np.clip(np.where(alpha < 0.999, np.minimum(b, g + 0.15 * spill + 6.0), b2), 0, 255)
    out = np.dstack([r2, g, b2, alpha * 255.0])
    out[alpha < 0.02] = 0
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def decode(path: Path, scale: float) -> tuple[np.ndarray, str]:
    width, height, rate = probe(path)
    w = max(2, round(width * scale / 2) * 2)
    h = max(2, round(height * scale / 2) * 2)
    raw = subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-vf", f"scale={w}:{h}:flags=lanczos", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
    frames = np.frombuffer(raw, dtype=np.uint8).reshape((-1, h, w, 3))
    return frames, rate


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--scale", type=float, default=0.8)
    parser.add_argument("--size", type=int, default=448, help="lado do quadrado final")
    parser.add_argument("--low", type=float, default=22.0)
    parser.add_argument("--high", type=float, default=75.0)
    parser.add_argument("--min-loop", type=int, default=20)
    parser.add_argument("--skip", type=int, default=3, help="quadros iniciais ignorados")
    parser.add_argument("--cpu-used", type=int, default=4)
    args = parser.parse_args()

    frames, rate = decode(args.source, args.scale)
    rgba = np.stack([key_frame(frame, args.low, args.high) for frame in frames])
    alpha = rgba[..., 3]

    # Caixa comum a todos os quadros -> quadrado centrado no robô.
    ys, xs = np.where(alpha.max(axis=0) > 40)
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    side = int(max(bottom - top, right - left) * 1.06)
    cy, cx = (top + bottom) // 2, (left + right) // 2
    y0 = int(np.clip(cy - side // 2, 0, max(0, rgba.shape[1] - side)))
    x0 = int(np.clip(cx - side // 2, 0, max(0, rgba.shape[2] - side)))
    side = min(side, rgba.shape[1] - y0, rgba.shape[2] - x0)
    crop = rgba[:, y0:y0 + side, x0:x0 + side]

    # Laço: par de quadros (i, j) com poses mais parecidas (alfa + cor, em baixa resolução).
    step = max(1, side // 64)
    small = crop[:, ::step, ::step].astype(np.float32)
    premult = small[..., :3] * (small[..., 3:4] / 255.0)
    feature = np.concatenate([premult.reshape(len(crop), -1), small[..., 3].reshape(len(crop), -1)], axis=1)
    best = None
    for i in range(args.skip, len(crop) - args.min_loop):
        for j in range(i + args.min_loop, len(crop)):
            score = float(np.mean(np.abs(feature[i] - feature[j])))
            if best is None or score < best[0]:
                best = (score, i, j)
    assert best is not None, "clipe curto demais para achar um laço"
    _, start, end = best
    print(f"laço: quadros {start}..{end - 1} ({end - start} quadros, diferença média {best[0]:.2f})")
    chosen = crop[start:end]

    args.destination.parent.mkdir(parents=True, exist_ok=True)
    encoder = subprocess.Popen([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba",
        "-s", f"{side}x{side}", "-r", rate, "-i", "-", "-an",
        "-vf", f"scale={args.size}:{args.size}:flags=lanczos",
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "34",
        "-row-mt", "1", "-cpu-used", str(args.cpu_used), "-metadata:s:v:0", "alpha_mode=1", str(args.destination)],
        stdin=subprocess.PIPE)
    assert encoder.stdin is not None
    for frame in chosen:
        encoder.stdin.write(np.ascontiguousarray(frame).tobytes())
    encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError("ffmpeg falhou ao codificar")
    print(f"{args.destination} ({args.destination.stat().st_size // 1024} KiB, {len(chosen)} quadros, {args.size}px)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
