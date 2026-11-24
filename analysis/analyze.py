#!/usr/bin/env python3
"""
Reproducible Forensic Convergence Analyzer for 400ms-attractor-basin.

Inspects all three independently generated film codebases under `runs/`
and the sanitized reasoning-trace metadata in `analysis/sanitized_traces.json`
to reproduce every quantitative metric cited in README.md:
  - Source LOC & Three.js geometry primitive counts
  - Tailwind CSS v3 default hex-color leakage ratio & cross-run exact hex overlap
  - Narrative, shader, typography, and DSP/musical convergence matrix
  - Single-prompt token allocation & zero-divergence concept-lock telemetry
  - Self-critique ceiling audit (engineering fixes vs. art-direction revisions)

Usage:
    python3 analysis/analyze.py
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Official Tailwind CSS v3 default hex tokens
TAILWIND_HEX: dict[str, str] = {
    "F8FAFC": "slate-50", "F1F5F9": "slate-100", "E2E8F0": "slate-200", "CBD5E1": "slate-300",
    "94A3B8": "slate-400", "64748B": "slate-500", "475569": "slate-600", "334155": "slate-700",
    "1E293B": "slate-800", "0F172A": "slate-900", "020617": "slate-950",
    "1F2937": "gray-800", "111827": "gray-900", "09090B": "zinc-950",
    "7DD3FC": "sky-300", "38BDF8": "sky-400", "0EA5E9": "sky-500", "0284C7": "sky-600", "0C4A6E": "sky-900",
    "67E8F9": "cyan-300", "22D3EE": "cyan-400", "06B6D4": "cyan-500",
    "EFF6FF": "blue-50", "93C5FD": "blue-300", "1E3A8A": "blue-900",
    "818CF8": "indigo-400", "6366F1": "indigo-500", "1E1B4B": "indigo-950",
    "2DD4BF": "teal-400", "14B8A6": "teal-500",
    "34D399": "emerald-400", "10B981": "emerald-500",
    "4ADE80": "green-400", "22C55E": "green-500",
    "FEF3C7": "amber-100", "FDE68A": "amber-200", "FBBF24": "amber-400", "F59E0B": "amber-500",
    "D97706": "amber-600", "78350F": "amber-900",
    "FEF08A": "yellow-200", "FDE047": "yellow-300", "FACC15": "yellow-400", "CA8A04": "yellow-600",
    "FDBA74": "orange-300", "F97316": "orange-500", "EA580C": "orange-600",
    "FECACA": "red-200", "EF4444": "red-500", "DC2626": "red-600",
    "FFE4E6": "rose-100", "FECDD3": "rose-200", "FDA4AF": "rose-300", "FB7185": "rose-400",
    "F43F5E": "rose-500", "E11D48": "rose-600",
    "F472B6": "pink-400", "EC4899": "pink-500",
    "E879F9": "fuchsia-400", "D946EF": "fuchsia-500",
    "C084FC": "purple-400", "581C87": "purple-900",
    "A78BFA": "violet-400", "7C3AED": "violet-600",
}

RUN_DIRS = {
    "Run 1 (0.4 SECONDS)": ROOT / "runs/run1-0.4-seconds",
    "Run 2 (FORWARD PASS)": ROOT / "runs/run2-forward-pass",
    "Run 3 (400MS BEFORE 'SURE!')": ROOT / "runs/run3-400ms-before-sure",
}

CODE_EXTS = {".js", ".mjs", ".py", ".html"}

MOTIF_PATTERNS: list[tuple[str, str]] = [
    ("Sub-second forward-pass framing", r"0\.4\s*seconds|400\s*millisecond|4-millisecond|forward\s*pass"),
    ("British deadpan documentary narrator", r"Daniel|RyanNeural|nature documentary|BBC documentary"),
    ("96 attention heads / layers", r"\b96\b|ninety[- ]six"),
    ("Quarantining / banning 'delve'", r"\bdelve\b"),
    ("Temperature dial meltdown", r"T\s*=\s*2\.4|tempOverload|temperature\s*(?:2\.1|2\.4|1\.4|slider|dial|overload)"),
    ("D minor / Dorian -> Dmaj9 resolution", r"Dm9|Dmaj9|D minor|D Dorian|D MAJOR"),
    ("Zero-sample 48kHz procedural DSP", r"48000"),
    ("Schroeder / Freeverb comb+allpass reverb", r"Freeverb|schroeder|allpass|combDelays"),
    ("Sidechain ducking under narration", r"sidechain|duckEnv|sc_gain"),
    ("Mulberry32 PRNG (0x6D2B79F5)", r"0x6d2b79f5"),
    ("ACES Filmic tone mapping", r"ACESFilmic|2\.51[\s\S]{0,40}0\.03[\s\S]{0,40}2\.43"),
    ("Bloom + Chromatic Aberration + Grain", r"__MULTI__:UnrealBloom|uBloom&&uChroma|uChromatic&&uGrain|grain"),
    ("SF Mono HUD typography", r"SF Mono"),
    ("Zero-Blender / pure-code boast", r"zero blender|no blender|BLENDER_AMT|BLENDER CUBES"),
]


def load_run_code(run_dir: Path) -> tuple[list[Path], str, int]:
    files = sorted(p for p in run_dir.rglob("*") if p.is_file() and p.suffix in CODE_EXTS)
    chunks = [p.read_text(encoding="utf-8", errors="ignore") for p in files]
    combined = "\n".join(chunks)
    loc = sum(len(c.splitlines()) for c in chunks)
    return files, combined, loc


def main() -> None:
    print("=" * 78)
    print("400MS ATTRACTOR BASIN — REPRODUCIBLE FORENSIC REPORT")
    print("=" * 78)

    hex_sets: dict[str, set[str]] = {}
    motif_hits: dict[str, list[bool]] = {label: [] for label, _ in MOTIF_PATTERNS}

    for name, rdir in RUN_DIRS.items():
        files, text, loc = load_run_code(rdir)
        raw_hex = [h.upper() for h in re.findall(r"(?:#|0x)([0-9a-fA-F]{6})\b", text)]
        non_bw = [h for h in raw_hex if h not in {"FFFFFF", "000000"}]
        tw_hits = [h for h in non_bw if h in TAILWIND_HEX]
        uniq_non_bw = set(non_bw)
        uniq_tw = set(tw_hits)
        hex_sets[name] = uniq_non_bw

        geoms = Counter(re.findall(r"THREE\.(\w+Geometry)\b", text))
        print(f"\n[{name}]")
        print(f"  Code files: {len(files)} | Total LOC: {loc:,}")
        print(
            f"  Tailwind CSS hex leakage: {len(tw_hits)}/{len(non_bw)} occurrences "
            f"({100.0 * len(tw_hits) / max(1, len(non_bw)):.1f}%) | "
            f"{len(uniq_tw)}/{len(uniq_non_bw)} unique colors "
            f"({100.0 * len(uniq_tw) / max(1, len(uniq_non_bw)):.1f}%)"
        )
        top_tw = Counter((h, TAILWIND_HEX[h]) for h in tw_hits).most_common(6)
        if top_tw:
            print("  Top Tailwind tokens:", ", ".join(f"#{h} ({tok} ×{n})" for (h, tok), n in top_tw))
        print("  Top 3D primitives:", ", ".join(f"{k}×{v}" for k, v in geoms.most_common(6)))

        for label, pat in MOTIF_PATTERNS:
            if pat.startswith("__MULTI__:"):
                parts = pat[len("__MULTI__:"):].split("&&")
                hit = all(bool(re.search(p, text, re.IGNORECASE)) for p in parts)
            else:
                hit = bool(re.search(pat, text, re.IGNORECASE))
            motif_hits[label].append(hit)

    names = list(RUN_DIRS.keys())
    shared_23 = sorted(hex_sets[names[1]] & hex_sets[names[2]])
    shared_23_tw = [h for h in shared_23 if h in TAILWIND_HEX]
    print("\n" + "-" * 78)
    print(f"Exact 6-digit non-B/W hex overlap (Run 2 ∩ Run 3): {len(shared_23)} colors ({len(shared_23_tw)} Tailwind defaults)")
    print("  " + ", ".join(f"#{h}({TAILWIND_HEX.get(h, 'custom')})" for h in shared_23))

    print("\n" + "-" * 78)
    print("CONVERGENCE MATRIX (Run 1 | Run 2 | Run 3)")
    print("-" * 78)
    full_converge = 0
    for label, hits in motif_hits.items():
        if all(hits):
            full_converge += 1
        marks = "  ".join("YES" if h else " no" for h in hits)
        print(f"  {label:<44s}  {marks}")
    print(f"\n3/3 Full Convergence: {full_converge}/{len(MOTIF_PATTERNS)} tracked technical & narrative invariants.")

    traces_path = ROOT / "analysis/sanitized_traces.json"
    if traces_path.exists():
        data = json.loads(traces_path.read_text())
        print("\n" + "-" * 78)
        print("REASONING TRACE & SELF-CRITIQUE CEILING TELEMETRY")
        print("-" * 78)
        tot_out = tot_concept = tot_eng = tot_art = tot_alts = 0
        for r in data["runs"]:
            tok = r["tokens"]
            crit = r["self_critique_audit"]
            tot_out += tok["output_total"]
            tot_concept += tok["concept_lock_output"]
            tot_eng += crit["engineering_or_legibility_fixes"]
            tot_art += crit["art_direction_or_hud_revisions"]
            tot_alts += r["alternative_concepts_evaluated"]
            pct = 100.0 * tok["concept_lock_output"] / tok["output_total"]
            print(
                f"  {r['id']} ({r['model']}): {r['single_film_turns']} turns | "
                f"{tok['output_total']:,} out tok | concept lock Turn #{r['milestones_turn']['concept_lock']} "
                f"({pct:.1f}% tok, {r['alternative_concepts_evaluated']} alts) | "
                f"critique: {crit['engineering_or_legibility_fixes']} eng / {crit['art_direction_or_hud_revisions']} art"
            )
        print(
            f"  TOTAL: {tot_out:,} output tokens | concept lock share={100.0*tot_concept/tot_out:.2f}% | "
            f"alternatives brainstormed={tot_alts} | self-critique={tot_eng} eng vs {tot_art} art"
        )


if __name__ == "__main__":
    main()
