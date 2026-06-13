# Markwise brand mark

`markwise-mark.svg` is the **single source of truth** for the logo. The site favicon and the
top-bar + footer marks all reference this one file, so changing it updates everywhere at once.

The mark: a rounded tile with a diagonal **terminal → markdown** gradient, a gold `>` (shell
prompt / markdown blockquote) on the dark side and a serif `d` (the "d" of markdown) on the
light side. The `>` and `d` are stored as **outlined vector paths**, so the file needs no fonts
to render correctly anywhere (browser tab, `<img>`, social card).

## Changing the logo

**Color, gradient, size, spacing, or the hairline edge** → just edit `markwise-mark.svg`
directly. It's plain SVG. Save, reload the site, done. No tools needed.

**A different letter, font, or weight** → the glyphs are baked-in outlines, so edit the glyph
specs at the top of `build-mark.py` and re-run it to re-bake them:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install fonttools brotli
python3 build-mark.py          # rewrites markwise-mark.svg
```

`build-mark.py` regenerates the *entire* file from the constants inside it (gradient included).
If you've hand-edited colors in the SVG and then re-run it, port those values into the script
too, otherwise they'll be overwritten.

## Where it's used

| Surface | Reference |
|---|---|
| Browser-tab favicon | `<link rel="icon" type="image/svg+xml" href="brand/markwise-mark.svg">` in `index.html` |
| Top bar + footer | `<img class="mark-ico" src="brand/markwise-mark.svg">` in `index.html` |

## Not wired yet (future)

- **In-product previewer** (`src/preview/`) has no favicon — point it at this file to match.
- **Social card** (`og:image`): link unfurls (Slack/X/iMessage) need a raster **PNG**, not SVG.
  A future `scripts/build-og` step would rasterize this mark (composed with the tagline) to a
  1200×630 PNG; add `<meta property="og:image">` once it exists.
