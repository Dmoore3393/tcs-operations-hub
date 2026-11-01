# Child import and safe website updates

The website detects new deployments and displays Reload now / Later instead of automatically refreshing. Staff can finish their import or save a form before choosing reload. Packaged native builds keep their existing update behavior. Draft forms and export contents are not stored in browser persistence.

Brightwheel imports parse both parents' names (including separate first/last columns) and second-parent phone/email. The preview shows both contacts; the child detail and editor expose the second parent separately. Blank incoming contact fields and identifiers preserve existing values. Parent Portal permissions and invitations remain separate and unchanged.

Clear identity matches update the same child UUID and legacy ID, preserving related records. Same-birthday profiles sharing one name are held for explicit identity review instead of silently becoming a new child. This is a possible-match hint, not an automatic fuzzy merge. Conflicting identifiers, ambiguous matches, repeated rows, and stale previews retain their previous checks. Staff may explicitly confirm a separate child where appropriate.

No real roster import is run by this release. After refreshing onto the new version, reselect the CSV and regenerate the preview before committing.
