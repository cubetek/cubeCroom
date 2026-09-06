# CubeCroom branding assets

The approved logo is `logo-source.png`. The matching symbol without its wordmark is `mark-source.png`. Both are transparent PNG artwork; the original approved image also remains in `docs/design/branding`.

Use `BrandMark` / `BrandLogo` from `@cubecroom/ui/components/brand` in app interfaces. The live wordmark follows the interface theme and stays legible in compact navigation.

Run `pnpm brand` after changing the source artwork or generation recipe. Commit the generated files and `generated.json` together. Run `pnpm brand --check` to verify all 18 outputs. Build/start commands check existing assets without network access or image processing. The recipe normalizes script line endings when hashing, so Windows and Unix checkouts agree.

`scripts/brand.mjs` resizes PNGs with the root build-only Sharp dependency and uses the portable icon converter from pinned electron-builder to encode ICO and ICNS. No image library is added to the app runtime. The first explicit regeneration may download electron-builder's checksum-verified icon toolset; normal builds use the committed output.

- Web/app mark: 512 × 512, transparent.
- Full logo: 640 × 640, transparent.
- Browser icon: 64 × 64, white backing for light/dark browser chrome.
- Apple touch icon: 180 × 180, opaque white background.
- Desktop PNG: 1024 × 1024; Windows ICO and macOS ICNS contain multiple sizes.

References: [electron-builder icons](https://www.electron.build/docs/features/icons-and-images/) and [Sharp resize](https://sharp.pixelplumbing.com/api-resize/).

## Symbol extraction

Generated on 2026-09-06 with the built-in `image_gen` tool, using the approved full logo as the edit target.

```text
Use case: background-extraction.
Edit target: the attached approved CubeCroom logo.
Create the symbol-only production asset for app icons from this approved logo. Remove only the CubeCroom wordmark and the unused outer margin. Preserve the exact approved cube / open-book symbol: its specific top rhombus, outer folded C-shaped left-and-bottom frame, and two inner book panels. Preserve the silhouette, gaps, shape proportions, rounded corners, teal colors and visual treatment without redesigning or simplifying it.
Center the isolated unchanged symbol on a square transparent-alpha canvas with around 8 percent clear padding on all four sides. Make the symbol large within the canvas, with the entire symbol visible. Output a clean high-resolution PNG with real transparency.
No text, no tile background, no mockup, no extra elements, no added gradients or effects, no shadows, no watermark. Do not generate a different logo.
```

