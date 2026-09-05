# TCS Operations Hub — Full Preview Requirements

This file is the release checklist for the full-site test build. Do not promote this preview until the items below are represented in the test site and role/security behavior is revalidated.

## Preserve existing foundation
- Keep the current full Operations Hub, not a mini-demo replacement.
- Preserve Family Linking Update: child records link to the correct family profile; creating/editing a child can select an existing family or create a new one while preventing obvious duplicate families.
- Preserve Owner/Admin, Location Licensee, and Employee role/location restrictions.
- Preserve location-owned data separation, RLS, immutable audit logging, encrypted document vault, retention/legal-hold controls, email invitation flow, KidKare restrictions, Timesheet restrictions, AI Command Center, Printable Studio, Marketing Studio, Enrollment Pipeline, Digital Forms, Compliance Center, Transportation Fees, Daily Care, Meals, Ratios, Reports, Files, Children, Families, Employees, Team Access, Settings, Locations, and Audit Log.

## Workforce / hierarchy
- Real Level 1–6 hierarchy plus Maintenance branch.
- Cross-location staffing visibility.
- Workforce hub with Time Clock, Time Off, Coverage, schedules, split shifts, weekly hours, conflict/coverage warnings, acknowledgments, and accountability.
- Real geofenced clock-in enforcement remains a production TODO until actually implemented and validated; preview must not claim it is live.

## Safety / child operations / fleet / training
- Safety & Emergency Center.
- Child Operations and funding authorizations.
- Cash-pay rules and exclusion from subsidy Timesheet tracking where applicable.
- Per-child parent/licensee Timesheet signatures.
- Fleet, gas/fuel, and Upside tracking.
- Training Center with external training links, certificate uploads, recurring/renewal dates, assignment by role/location/person, verification, and configurable XP rewards.
- Lifetime XP and Spendable XP must remain clearly distinguished; a redemption ledger is still a production TODO until implemented.

## Branding / visual system
- Corresponding branded pages for Employee Lounge, KidKare, School Age Center, Lara Family Childcare, Thomason Family Childcare, Employee Bulletin Board, Moore Family Childcare/Halcom, Cornejo Family Childcare, Thomason Maintenance, and School Shuttle/Transportation.
- Each area uses its approved page colors while remaining visually part of one TCS Hub.
- Hybrid Operations View + Visual/Display/Print View wherever appropriate.
- Visual boards support print/export/share workflows with internal/private data safeguards.

## Transportation
- Daily Transportation Board with route cards, driver-specific visual styling, city/school grouping, Important Notes, No Pick-Ups, route changes, closures, late release, substitute/coverage alerts, and optional Meme/Quote of the Day.
- Staff entering Transportation see My Route Today immediately when they are assigned a route.
- Driver view shows assigned vehicle, stops in order, children on that route, pickup time, school, destination, and authorized transportation notes.
- Child status flow: Waiting -> Picked Up -> In Transit -> Arrived/Dropped Off.
- Pickup and arrival actions record child, driver, route, school/location, timestamp, vehicle, and acting staff member.
- Stop reconciliation: expected riders vs picked-up riders; missing rider must be resolved with an approved reason before stop completion.
- Leadership sees all routes and coverage; Licensee/Site Director sees relevant location transportation; staff see only authorized assigned routes/children.
- Future Parent Portal: automatic parent notification when their child is picked up and when they arrive; family-facing transportation timeline. No live-map tracking required.

## Visual boards
- Halcom Weekly Operations Board: weekly staff availability grid, staffing/transport commitments, coverage warnings, notes, metrics, publish/print/export/duplicate-next-week actions.
- Weekend Care Board: Saturday/Sunday child schedules, No Care lists, staffing, opener/closer, ratio timeline, transfers/transport/special notes, print/export/share-staff-version.
- Daily Transportation Board as above.
- Visual Boards navigation should be designed to expand to Staff Availability, Coverage Board, Parent Snapshot, Bulletin Board, and other smart boards.

## Curriculum & Learning Center
- TCS educational identity: Montessori-inspired + STEAM-powered.
- Today’s Learning Plan for staff with theme, activities, materials, objective, instructions, adaptations, completion, photo/documentation, and observations.
- Weekly Curriculum Board with theme, books, vocabulary, questions, learning domains, materials, and extension activities.
- Program-specific curriculum experiences for Infant/Toddler, Preschool/Pre-K, and School Age.
- Learning domains: literacy/language, math, science, creative arts, cognitive, social-emotional, gross motor, fine motor, social studies/community, nature/environment, STEAM, life skills.
- Montessori tags: Practical Life, Sensorial, Language, Mathematics, Cultural Studies, Grace & Courtesy, Independence/Concentration, Fine Motor/Coordination; plus child choice, hands-on, self-correcting, real-world purpose, repetition, prepared environment, orderly sequence, mixed-age opportunity.
- STEAM tags: Science, Technology, Engineering, Art, Mathematics.
- Curriculum Builder, reusable Activity Library, favorites/duplicate/archive/share-across-locations, materials, preparation, instructions, vocabulary, discussion questions, accommodations, extensions, indoor/outdoor, group size, duration, printables/media links.
- Staff curriculum accountability: completed/modified/skipped, reason for skip, documentation status.
- Appropriate family-facing Learning This Week view reserved for Parent Portal.
- AI curriculum assistance may suggest plans/material substitutions but must remain reviewable by staff/admin.

## DRDP
- Guided, plain-language DRDP workflow designed for staff who may not have Child Development coursework.
- Quick “I Saw This Today” observation flow using typed note, voice-to-text where supported, suggested observation tags, work samples/photos where authorized, and activity/child tags.
- Explain formal DRDP concepts in plain language without changing the official meaning.
- “What to look for,” real-world examples, Montessori examples, STEAM examples, and inclusive examples for different communication/mobility needs.
- Evidence Inbox and evidence-strength indicators (need more information / developing evidence / ready to rate).
- AI may suggest likely related measures/evidence levels but must never silently assign the official rating.
- Guided assessment wizard by developmental area; missing-evidence prompts suggest natural observation opportunities.
- Child Development Profile with strengths, emerging skills, recent evidence, and suggested curriculum links.
- DRDP Mini Academy integrated with Training Center/XP.
- Future Parent Portal may collect clearly labeled Family Observations for staff review.
- DRDP deadline/readiness dashboard for leadership.

## Behavior & Support Center
- Keep formal Incident Reports.
- Add Quick Behavior Note, Positive Moment, and Guided ABC Observation as separate documentation levels.
- Quick-note categories for common behaviors/context/strategy/outcome.
- ABC guidance uses plain language: what happened right before, exactly what child did, what happened after; encourages objective wording.
- Behavior timeline, trends/patterns, time-of-day/context/trigger analysis, strategy effectiveness, duration/repeated behavior counts where appropriate.
- Individual Behavior Support Plans with strengths/interests, triggers, early warning signs, prevention, replacement skills, regulation strategies, reinforcement, staff response, safety response, family input, goals, review date.
- Staff Support Snapshot available from child profile/daily care/classroom pages.
- Convert an ABC observation to Incident Report without duplicate entry.
- Parent communication log.
- One observation may connect to curriculum/DRDP/support evidence when appropriate, with explicit staff review.
- Behavior documentation should include positive growth, not only problem behavior.

## Gator Cash student economy
- Currency name: Gator Cash.
- Digital child wallet/bank with spendable wallet balance, savings balance, transaction history, current goal, wishlist, classroom job, achievements.
- One child wallet with location-aware student stores.
- Each location controls its own store items, prices, quantity, categories, purchase limits, eligibility/age limits, approval requirement, active/sold-out status, and store schedule.
- Halcom Student Store default schedule: every Friday.
- Item types: physical prize, snack/food, experience, privilege, mystery reward.
- Halcom may offer different snacks and VR time; other locations do not need the same catalog.
- Friday preview/open/close behavior, countdown/preview during the week, optional Friday specials.
- Student self-service and staff Register Mode.
- VR/experience scheduling uses time slots and a staff queue with Started/Completed states.
- Snack purchases respect child food restrictions without exposing private medical details to other students.
- Classroom jobs with pay, responsibilities, openings, eligibility; older-school-age job applications/interviews may be added.
- Optional Gator Cash awards from positive moments, selected STEAM/Montessori activities, classroom jobs, and approved responsibilities.
- Economy is primarily earn-based, not punishment-based.
- Immutable transaction ledger; corrections use reversal with reason rather than deleting history.
- Savings goals and age-appropriate financial-literacy prompts.
- Location store reports and company-wide oversight without forcing identical prizes.
- Future Parent Portal provides read-only view of their own child’s wallet/savings/goal/earnings.

## Parent Portal future integration
- Parent/family accounts remain disabled in the current production foundation until the portal is intentionally built and security-tested.
- Future portal requirements already reserved: transportation pickup/arrival notifications and timeline, Learning This Week, family DRDP observations, Gator Cash read-only view, child-specific notices/forms/signatures as separately approved.
- Never expose another child’s name, route details, staffing information, behavior notes, DRDP internal notes, or internal opening/closing reports to parents.

## Preview safety
- Full-site test build must use sample/demo records or browser-local test data for new unvalidated modules.
- Do not connect experimental Curriculum, DRDP, Behavior, Gator Cash, or new Transportation status writes to live confidential records until schema, RLS, audit, role, and migration tests pass.
- Do not replace or promote the real production Hub until Danielle approves the full preview.
