# Child audit deep-link and primary-button correction

Danielle's screenshot showed a false child-not-available error alongside an apparently blank start-audit button on the Halcom audit screen.

Root causes verified in current source:
- Child screens link using the numeric UI identifier, which may differ from both the database UUID and the legacy import key. The location-file picker resolved only the latter two.
- Both primary actions combined the white secondary-button background with dark-green background classes and conflicting foreground classes.

Correction:
- Project only the scalar record_data.id value in the existing authorized children query and derive a ui_id alias consistent with /api/children. Do not expose the full record_data object.
- Resolve database UUID, legacy key and numeric UI aliases within the already authorized result set. Ambiguous aliases never choose the first match. Unknown/ambiguous links open a blank manual child picker with an explanatory message instead of a dead-end error.
- Keep file writes on database UUIDs with existing role/location checks. No enrollment, family, audit, staff, access or live-document records were modified by this correction.
- Use a dedicated dark-green/white-text class for Start and Save. The shared staff editor receives the same button correction.

Validation before release:
- All 29 focused identifier, location-file, child-audit entry, audit and route-permission checks passed.
- TypeScript, changed-source lint, security check and app-readiness check passed.
- Five React DOM scenarios using synthetic data passed: numeric/legacy/UUID links select the same child; create/save/reopen Halcom persists its notes and leaves the 33rd file unchanged; unknown/ambiguous references open a manual picker with no writes.
- The compiled production Tailwind stylesheet resolves the primary-action background to --color-emerald-800 and foreground to --color-white without conflicting bg-white/text-slate classes.
- Chromium could not render in this sandbox (browser process closed). No claim of full browser rendering, Safari verification, or a signed-in live-record save is made.

Release scope: website source/API only. No database migration or iOS build/submission is part of this change. Other previously proposed website improvements are not included.
