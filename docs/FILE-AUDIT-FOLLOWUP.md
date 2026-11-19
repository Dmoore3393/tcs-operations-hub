# Location file audits: children and employees

Child and employee files use the same location-bound checklist editor, per-item document review, atomic Save audit & assign corrections, assigned task submissions, reviewer verification, and intentional document copying with a separate destination review.

Employee file findings carry staff_lane_id; child findings carry child_id. Exactly one identity is required. Existing rows remain unchanged, including the legacy child_name field, which contains the person's display name for compatibility. All identity/location fields are immutable. Location permissions and role controls remain enforced. Halcom corrections go to the unique active Miss Latrice account. Existing unresolved findings are reused by file and item. Staff documents may only be copied to another file for the same staff lane, with access to both locations.

N/A no longer needs an item note, and is excluded from missing/expiration counts. Existing notes remain saved. An existing correction finding still needs reviewer confirmation to close; marking N/A does not silently close assigned tasks.

Given to parent is available for delivery-only child packet handouts identified by form name: LIC 995E, LIC 995F, LIC 9212, PUB 515, PUB 271 and Family Handbook. Names describing signed receipts/acknowledgments are excluded. The date given is saved in the existing dateChecked field; the field is labeled Date given. No uploaded returned form is needed for these handouts. Signed forms such as LIC 995A, consent forms and handbook acknowledgments keep their independent On File/review requirements. No status or upload in one location completes another location's checklist.

The /files?type=Staff entry now opens employee location files. Earlier tracking items and uploaded documents remain accessible through Earlier file items & document vault; they are not guessed or bulk migrated.

Validation: location person-file status tests, PostgreSQL integration tests covering child/staff isolation, employee review/assignment/deduplication, N/A resolution without notes, same-person copy restrictions, and rejected false delivery completion of signature forms.
