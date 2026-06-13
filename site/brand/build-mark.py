#!/usr/bin/env python3
"""Regenerate markwise-mark.svg with freshly outlined glyphs.

You only need this to change the LETTER, FONT, or WEIGHT of the mark. For color, gradient,
size, spacing, or hairline tweaks, just edit markwise-mark.svg directly (it's plain SVG).

Requires:  pip install fonttools brotli   (e.g. in a throwaway venv)
Run:       python3 build-mark.py
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

HERE = Path(__file__).resolve().parent
FONTS = HERE.parent / "fonts"
OUT = HERE / "markwise-mark.svg"

# --- the two glyphs (edit to change letters / fonts / weights / placement) ---
BASELINE = 21.6
GLYPHS = [
    dict(font="SplineSansMono-var.woff2", char=">", wght=600, fill="#e8b04b", size=15.0, cx=9.2),
    dict(font="Literata-var.woff2",       char="d", wght=700, fill="#16181c", size=15.5, cx=22.0),
]
# --- the gradient + frame (edit freely; kept here so a regen stays consistent) ---
GRADIENT_STOPS = [
    ("0",   "#15171c"), ("0.4", "#23262c"), ("0.6", "#8f8c82"),
    ("0.8", "#e7e1d4"), ("1",   "#f4efe4"),
]


def outline(spec):
    f = TTFont(FONTS / spec["font"])
    try:
        instantiateVariableFont(f, {"wght": spec["wght"]}, inplace=True)
    except Exception:
        pass
    upem = f["head"].unitsPerEm
    glyphs = f.getGlyphSet()
    g = glyphs[f.getBestCmap()[ord(spec["char"])]]
    pen = SVGPathPen(glyphs)
    g.draw(pen)
    s = spec["size"] / upem
    tx = spec["cx"] - (g.width * s) / 2
    return (f'  <path fill="{spec["fill"]}" transform="translate({tx:.3f} {BASELINE}) '
            f'scale({s:.5f} {-s:.5f})" d="{pen.getCommands()}"/>')


stops = "".join(f'\n      <stop offset="{o}" stop-color="{c}"/>' for o, c in GRADIENT_STOPS)
paths = "\n".join(outline(g) for g in GLYPHS)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" role="img" aria-label="Markwise">
  <!-- Markwise brand mark - SINGLE SOURCE OF TRUTH. The site favicon + top-bar/footer marks all reference this file.
       Glyphs are outlined (font-independent). Edit colors/gradient/spacing here directly; re-run build-mark.py only to change letters/fonts. -->
  <defs>
    <linearGradient id="mwg" x1="0" y1="0.08" x2="1" y2="0.92">{stops}
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="7" fill="url(#mwg)"/>
{paths}
  <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="6.5" fill="none" stroke="#000000" stroke-opacity="0.16" stroke-width="1.1"/>
</svg>
'''
OUT.write_text(svg)
print("wrote", OUT)
