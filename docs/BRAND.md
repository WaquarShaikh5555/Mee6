# The mark

A hexagon split into two interlocking pieces — teal above, brass below — with the
gap between them drawing the S. It reads as an S at 48 px, which is the only
size that matters: that is what a launcher actually draws.

## Colours

| Role | Hex | Where |
| --- | --- | --- |
| Ground | `#090D0E` | The tile, the adaptive-icon background, splash in dark mode |
| Teal | `#7EB8B6` | Upper piece |
| Brass | `#D0B26E` | Lower piece |

The mark's teal and brass sit slightly cooler and lighter than `peacock.600` and
`brass.400` in the app's tokens. That is deliberate: an icon is viewed against
other icons, not against parchment, so it needs its own contrast.

## Files

| File | Size | Used for |
| --- | --- | --- |
| `icon.png` | 1024² | Launcher icon on iOS and Android, store listing |
| `android-icon-foreground.png` | 1024² | Adaptive icon foreground, 57% height — inside the 66% safe zone |
| `android-icon-background.png` | 1024² | Adaptive icon background (flat `#090D0E`) |
| `android-icon-monochrome.png` | 1024² | Themed icons on Android 13+ (white silhouette) |
| `splash-icon.png` | 1024² | Splash screen, on transparency |
| `logo-mark.png` | 512² | In-app `BrandMark`, on transparency |
| `logo-tile.png` | 512² | Anywhere the mark needs its own ground |
| `favicon.png` | 196² | Browser tab |

## Rebuilding

The source artwork is `assets/brand/source-logo.png`. Everything else is
generated from it, so the shapes and colours stay consistent:

```bash
python3 tools/brand/build-icons.py assets/brand/source-logo.png
```

The script decomposes each pixel into "how much teal, how much gold, how much
background" rather than resizing the JPEG. That keeps the anti-aliasing and
throws away the compression noise and the vignette, so the edges stay clean at
any size. It needs `pillow` and `numpy`.

## Rules

- **Never hand-edit a generated file.** Change the source and re-run the script.
- **Never bake in rounded corners or a shadow.** iOS and Android mask the icon
  themselves; a baked mask gets rounded twice and shows a seam.
- **Keep the mark inside the safe zone.** Android crops adaptive icons to a
  shape of its choosing; anything outside the middle 66% can be cut.
