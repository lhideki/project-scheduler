# Tailwind v3 visual baseline

`tailwind-v3-e029cc66.html.gz` is an unmodified, gzip-compressed copy of
`project_scheduler.html` from commit
`e029cc66e2e806e01c040780ebc7e70c5b360384`.

SHA-256 of the decompressed HTML:
`da7be2493ba179390844ecfce414b46b6587a901b2d7400d7014c64944bbbe7c`

The browser regression verifies that checksum before rendering. The fixture
contains its original bundled JavaScript and compiled Tailwind v3 CSS. It does
not require a historical checkout, npm install, CDN, or network access at test
time. Do not regenerate it from the candidate app or update it to make a visual
failure pass.

Reproduction, from a checkout containing the source commit:

```sh
git show e029cc66e2e806e01c040780ebc7e70c5b360384:project_scheduler.html \
  | gzip -n -9 > tests/browser/fixtures/tailwind-v3-e029cc66.html.gz
```

The tests render both versions in the same Chromium build with identical
synthetic project data, UTC clock, installed fonts, locale, device scale and
viewport. They save actual before/after screenshots, an exact RGBA pixel-diff
image, and detailed geometry/computed-style reports into the normal Playwright
evidence artifact. The gate requires zero non-antialiased changed pixels with
Pixelmatch's `threshold: 0, includeAA: false`. Exact raw RGBA counts and diff
images are retained alongside the separate non-AA comparison and diff image.
There are no image masks, color-distance tolerances, allowed changed-pixel
budgets, replacement fonts, CSS overrides, or auto-updating reference screenshots.
Carets are hidden and
CSS animations are completed using Playwright's standard screenshot options;
JavaScript animations must settle before capture.

For direct children of a `space-y-*` container, the style comparison measures
the exact rendered sibling gaps and all child/container rectangles instead of
comparing top-versus-bottom margin placement. Tailwind v3 and v4 assign those
margins to different siblings. The original computed margins remain in each
report's diagnostics. Geometry, color and radius checks include the outer logo
box, as well as its SVG icon, to guard against rounded-edge styling changes.

When any candidate pixels differ, the test also opens an independent context
with the identical immutable v3 HTML and replays the same scenario. Its separate
control screenshot, v3-to-v3 and control-to-candidate pixel reports, coordinate
samples, and diff images help distinguish rendering variance from a migration
change. Control results never relax the candidate's zero-non-AA-pixel assertion.
