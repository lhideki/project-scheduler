# JSON import validation and compatibility

The browser (ordinary imports, linked JSON, embedded HTML) and the scheduling CLI use
`src/lib/projectValidation.js`. It is a pure browser-compatible module with no Node.js
I/O dependencies. `validateProjectData(raw)` returns the same structured diagnostics
for both entry points: `severity`, `code`, `path`, localization `messageKey`/`params`, optional task `ids`, and optional `blocking`.
`formatProjectIssue(t, issue)` in `i18n.js` formats reasons from the Japanese/English
message catalogs; the CLI adds its Japanese `message` when presenting reports.

## Before a plan changes

`normalizeImportedProject` parses no files and changes no application state. It checks
the schema-v1 envelope, all current collections, comparison snapshots, and any present
raw snapshot collections before cloning and applying defaults. Blocking errors throw
`Error("invalid_project_json")` with an `issues` array. Syntax errors are reported
separately by callers of `JSON.parse`.

`prepareProjectImport(raw, currentVersions, { mergeVersions = true })` returns
`{ data, issues }`. It also prepares the full version merge before returning. Incoming
IDs replace existing IDs; local-only versions remain; nonempty incoming history is
sorted newest first. Empty incoming history preserves existing history and its order.
Linked imports use `mergeVersions: false` to replace the complete linked snapshot.

The UI does not update any project field until preparation succeeds and the user
confirms. It applies all fields in one synchronous React batch and resets task-only
Undo/Redo after a successful whole-project import, preventing tasks from the previous
project from being undone into the new resources/calendar. Rejection and cancellation
leave the plan, version history, and task Undo/Redo unchanged.

## Errors versus repairable schedule issues

The validator checks object/array shapes, required fields, finite numeric values,
nonnegative effort/capacity, progress ranges, real calendar dates, dependency types,
unique IDs, hierarchy, and references. Diagnostics contain exact paths such as
`tasks[0]`, `tasks[2].startDate`, or `versions[0].rawTasks[1].predecessors[0].id`.
Reserved object-dictionary IDs are rejected to keep graph traversal safe.

- Malformed data, duplicate IDs, missing parent or predecessor tasks, and parent
  hierarchy cycles block import.
- Missing assignees or sprint references, overlapping sprints, and conflicting calendar
  overrides retain their existing CLI warning severity. They do not block import.
- Self-dependencies and dependency cycles retain CLI `severity: "error"`, but carry
  `blocking: false`. These are repairable schedule problems that the UI can display;
  exported plans containing them must remain reopenable. `isBlockingProjectIssue` is
  the shared predicate for import safety. CLI validation still reports an unsuccessful
  schedule validation when these errors exist.
- Schedule-dependent conflicts (e.g. a fixed milestone deadline) remain part of the
  existing scheduling diagnostics rather than file-shape rejection.

Every diagnostic's `path` is now a JSON-location string. For dependency cycles the
former task-ID route is available as `dependencyPath`; CLI consumers using the old
array-valued `path` should use that field instead.

## Schema-v1 compatibility

- The required envelope remains `schemaVersion: 1`, `exportedAt`, `tasks`, `resources`,
  `sprints`, and `versions`. Dates and timestamps must be valid.
- Empty arrays, including `tasks: []`, are legitimate projects.
- Omitted `levelingOn` defaults to `false`; omitted `calendarExceptions` defaults to
  `[]`. Present values of the wrong type are rejected rather than silently discarded.
- Optional empty task dates (`startDate: ""` / `fixedDate: ""`) remain accepted as
  unset, matching the UI's cleared date inputs. Invalid nonempty dates are rejected.
- Old comparison-only versions without the newer WBS/raw-snapshot fields remain
  displayable. Present fields are checked; a version explicitly claiming a full
  snapshot must include its required raw arrays. `hasFullSnapshot` is then derived
  from the actual raw arrays. Omitted old raw calendar data remains an empty calendar
  when restored. Comparison-only versions cannot be restored.
- New UI and CLI full snapshots include boolean `rawLevelingOn` alongside the raw
  tasks, resources, sprints, and calendar exceptions. Restoration reapplies that
  saved setting even when the current toggle differs. This field stays optional
  for schema-v1 compatibility; invalid present values are rejected at their version
  field path. A legacy snapshot without it retains the current leveling setting,
  because the original condition is unknown. The restore confirmation explains
  that recalculated dates may differ from the saved comparison; no condition is
  inferred from those dates. Restoring a version clears task Undo/Redo history so
  earlier tasks cannot be replayed against the restored resources or calendar.
- Task and version extension fields remain preserved. No conversion of arbitrary
  older schema versions or automatic repair of invalid data is performed.
- Emergency JSON export preserves the current screen data, including invalid edited
  snapshots, so it remains a backup path when browser storage fails. It does not
  silently repair it; importing that backup still reports any invalid fields.

## Browser persistence

Normal startup restores both `pm_project` and `pm_versions`, including a taskless
project with other settings. Legacy local-storage records (which have no schema
wrapper) are migrated and passed through the same validator. Local restoration alone
uses a narrow editing-compatibility mode: empty or reversed sprint dates and finite
negative resource capacities can be reopened exactly as the existing UI saved them,
including inside raw version snapshots. External JSON/linked/embedded imports remain
strict. Other unsafe shapes, non-finite/null numbers, malformed nonempty dates, IDs,
and references are still rejected. Unreadable or invalid saved data pauses saving
until explicit confirmation to replace it. Editing controls remain unavailable while
a delayed initial read is pending, so late restoration cannot replace new input.

One debounced, serialized queue owns both keys. The status is pending after an edit;
it is saved only after both writes for the newest snapshot succeed. Old completions
cannot mark later edits saved or finish writing after a newer write. An explicit
`false` return or thrown storage error is failure. Existing host APIs returning
`void`, `true`, or a success object remain supported. These two storage keys do not
form an atomic database transaction: if either write fails, the UI reports failure
and offers complete JSON backup and retry.

Linked JSON and embedded/shared HTML continue to make no automatic writes to either
plan/history key. Language preference remains a separate UI preference.

## Verification

- `npm test`: unit, import compatibility, shared UI/CLI diagnostic parity, save-queue,
  storage wrapper, and taskless restoration regression tests.
- `npm run build`: regenerates the distributable HTML, schema reference, CLI, and README.
- `npx playwright install --with-deps chromium`, then `npm run test:browser`: actual
  Chromium UI tests on the generated HTML, with synthetic fixtures. The local test
  server binds only `127.0.0.1:4173`.
- Pull-request CI uploads screenshots, traces on failures, and the Playwright report
  as `browser-evidence-<commit>` artifacts. Screenshots are real browser captures of
  that checked-out build, not generated mockups.
