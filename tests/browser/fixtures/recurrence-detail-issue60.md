# Recurring-task detail visual reference (Issue #60)

`recurrence-detail-issue60.html.gz` is an immutable, unmodified standalone HTML
from the canonical Issue #60 build based on master
`a56a61e1f96b613ff5193c2443471353f62f051f`. Decompressed SHA-256:

`36bdda084a4192aa7d7e5541626a018d4764ce1b9c45dd0a1e2d4e3f7ddcca98`

It records the intentional addition of the recurring-task section to the detail
panel. Only the desktop and narrow-viewport `task-detail-modal` scenarios use
this reference. They compare the **live current HTML** against it, with the same
strict geometry, computed-style, dimension and zero-non-AA-pixel gates as the
other 22 scenarios. Those 22 continue comparing live current HTML with the
unchanged Tailwind v3 reference. No tolerances, masks or conditional fallbacks
were added. The independent rendering control always uses the selected reference.

These two cases are recurring-task detail regression checks, **not** a claim of
v3-to-v4 visual parity for a deliberately changed UI. Their actual CI screenshots
must be visually reviewed before this new reference is accepted; equality to a
newly recorded reference alone does not approve the layout. The Issue #60 PR's
review evidence records that inspection. Recurring-task browser scenarios
separately exercise rule editing, individual changes, cancellation, Undo, fixed
scheduling, persistence, dependencies and translated labels.

The fixture contains normal app code, with no user project data. Do not regenerate
it automatically or re-record it to conceal an unexplained visual failure. Any
later intentional layout update requires separately documented visual review.

The initial Issue #60 capture exposed a clipped mobile dialog despite matching
pixels. This reference was deliberately corrected after that visual rejection:
the detail overlay now follows the visual viewport instead of the overflow-expanded
layout viewport. Its 390px dialog, scrolling, close controls and recurrence editor
require fresh CI screenshot inspection; the initial clipped reference was not accepted.

Visual acceptance was completed against CI run `38114018534`, artifact
`11692941188`, head `c30d6453a78ba9815baa0c104d3d9b3f7ac14566`.
The desktop detail and 390×844 mobile captures were inspected directly. The mobile
panel fits within x=16–374 and y=16–828; the close button and recurrence actions are
reachable. The separate mobile browser case also exercised scrolling, Cancel,
Close and Escape. All 24 visual comparisons passed with the original gates.
That run still failed one unrelated new test because its polling callback read an
absent override before debounced persistence completed; this visual acceptance is
not a claim that the entire CI run succeeded.
