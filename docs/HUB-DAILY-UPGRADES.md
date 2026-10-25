# The Hub: communications and daily-work upgrade

October 25, 2026. Website release; TCS branding, earned-only rewards, original family access and account deletion remain in place.

## What changed and how to check it on an iPhone

1. **Communications:** Sign into Staff Hub, open Tools, then Communications. Start a team conversation for an assigned location. Owner/Admin can address all TCS locations; leadership can pin a message and request an explicit acknowledgment. Open a thread to see replies together. Reading and acknowledging are separate actions.
2. **Family inbox:** Open Family Communications. Use Unread or Awaiting TCS reply, or search a family, subject or message. Open a family, read the conversation and use the clearly labeled read-receipt control. Authorized managers retain the same guardian access boundaries.
3. **Needs attention:** Open the staff dashboard. Find recent unread team messages, family replies, dated overdue tasks, pickup handoffs and reports awaiting leadership review. Choose your tasks or location follow-up. Each item opens its existing tool.
4. **Work plans:** Add or edit a task. Enter the owner, date/time deadline, shift checkpoint and what finished work looks like. Staff can acknowledge reviewing it, then complete it with initials. Dated deadlines produce overdue labels; vague legacy labels such as Friday do not invent a date. Existing task assignments remain intact. Printable plans select an actual available owner and show the dated deadline.
5. **Parent home:** Sign into Parent Portal. Home brings together unread messages, family forms, care planning and today's authorized shared care updates. Care and photos remain available. Messages has its own bottom-navigation tab, unread count, read-receipt control and composer. Individual guardian permissions still apply.
6. **Find tools:** On desktop, press Command-K or Ctrl-K and type a tool name, such as attendance. Escape clears the filter. Mobile retains the searchable Tools menu, with Communications and Family Messages added where authorized.
7. **Saving and errors:** Message requests have a 12-second deadline and visible errors. A failed send retains its draft, and retry IDs prevent duplicate messages. Drafts live in memory and are not stored in browser storage. Team conversations refresh while the page is visible. Controls use readable sans-serif text and touch targets.

Opening/closing reports and pickup handoffs remain internal staff records. Family messaging stays separate. No development messages, invitations, alerts or edits were sent to real families or staff.

## Database and deployment

The additive migration `20261025230642_hub_daily_communications.sql` creates three initially empty team tables with organization/location RLS, explicit author checks, limited pinning permissions and individual receipts. It adds an invoker read/acknowledgment RPC and a server-only family-message RPC. No existing operational rows are changed by installation. New family sends lock one child row, append without replacing unrelated fields, preserve message metadata and commit audit records together. The previous packaged parent client may continue sending without a retry ID.

The migration was applied to the existing Hub Supabase project. Live database verification inserted synthetic records only in the isolated review workspace, checked authenticated thread/reply/acknowledgment and family-message retries, then rolled the entire test transaction back. No QA records remain. New-object security-advisor findings: none. Existing project advisories were left unchanged.

## Verification

- 140 automated Node tests passed, including new database authorization, API guardian-permission and deadline/inbox tests.
- TypeScript, production compilation, security/readiness checks and targeted new-code lint passed.
- Browser tests used real components with an isolated synthetic API, at iPhone and desktop widths. Verified acknowledgment, replies, failed-send retention/retry, family conversations, parent navigation/read receipts, task review/completion, overdue labels and desktop tool search. No horizontal overflow was observed in the checked inbox and parent views.
- The bundled screen export is checked separately for the next iPhone release. This website release does not replace or withdraw Apple's submitted build 4. New packaged screens require a subsequent signed iPhone update.

## Current boundaries

These are implemented workflow improvements, not a claim of feature parity with every competing platform. Team inbox pages load a bounded set of posts and recent replies, with older conversations available through pagination. Physical-iPhone/native push/biometric checks remain in the iOS release checklist. New team conversations currently surface through the in-app inbox and its refresh; this release does not add new team-message push delivery. Existing pickup, incident and schedule alert features remain available.
