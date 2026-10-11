# Recurring-task detail visual reference (Issue #60)

`recurrence-detail-issue60.html.gz` is an immutable, unmodified standalone HTML
from the canonical Issue #60 build based on master
`a56a61e1f96b613ff5193c2443471353f62f051f`. Decompressed SHA-256:

`c7a0b476d8e4af25a5e25842bcf28e63d5197c7bccfa54a2ea18ef7f3a0a3528`

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
review evidence records that inspection. Nine recurring-task browser scenarios
separately exercise rule editing, individual changes, cancellation, Undo, fixed
scheduling, persistence, dependencies and translated labels.

The fixture contains normal app code, with no user project data. Do not regenerate
it automatically or re-record it to conceal an unexplained visual failure. Any
later intentional layout update requires separately documented visual review.
