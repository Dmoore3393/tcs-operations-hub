# Supabase Setup

The previous Supabase project was deleted, so use a brand-new project.

Start with `START-HERE-FRESH-SETUP.md`. Run `supabase/setup.sql` once in the new project's SQL Editor, create Danielle's first Owner account, and invite everyone else from Team Access.

## Family Care Calendar

After the base setup is complete, run `supabase/family-care-calendar.sql` once in the same project's SQL Editor.

This adds the secure Family Care Calendar tables used for:
- parent weekly schedule submissions and change requests,
- the Friday 6:00 PM deadline and late-request tracking,
- Owner/Admin closure dates,
- location schedule approval,
- and approved date-specific care times that feed the Ratio Plan.

The migration is additive and does not replace the existing recurring child schedule records.
