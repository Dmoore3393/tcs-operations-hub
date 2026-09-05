# TCS Operations Hub — Full Preview Requirements

This is the release checklist for the full-site test build. Do not promote this preview until the items below are represented in the test site and role/security behavior is revalidated.

## Preserve existing foundation
- Keep the current full Operations Hub, not a mini-demo replacement.
- Preserve Family Linking Update: child records link to the correct family profile; creating/editing a child can select an existing family or create a new one while preventing obvious duplicate families.
- Preserve Owner/Admin, Location Licensee, and Employee role/location restrictions.
- Preserve location-owned data separation, RLS, immutable audit logging, encrypted document vault, retention/legal-hold controls, email invitation flow, KidKare restrictions, Timesheet restrictions, AI Command Center, Printable Studio, Marketing Studio, Enrollment Pipeline, Digital Forms, Compliance Center, Transportation Fees, Daily Care, Meals, Ratios, Reports, Files, Children, Families, Employees, Team Access, Settings, Locations, and Audit Log.

## Visual Launch standard
- The polished branded mockups are the target functional interface, not separate inspiration pages.
- Sitewide typography, buttons, fields, cards, navigation labels, and tap targets must be substantially larger and easier to scan than the compact pilot UI.
- Use clear visual hierarchy, generous spacing, larger action cards, consistent status colors, and mobile/iPad layouts that do not shrink desktop screens into tiny text.
- Every major page must answer within seconds: where am I, what needs attention, and what can I do next?
- Use the same status language across modules: green = ready/complete/covered, yellow = needs attention/due soon, red = urgent/missing/out of ratio, blue = in progress/assigned, neutral = not started/inactive.
- Add tasteful micro-interactions for completion, status change, progress, Gator Cash, XP, route completion, and training without distracting from operations.

## Navigation groups
### Command Center
Dashboard; Today at TCS; AI Director.

### Children & Families
Children; Families; Child Operations; Child Schedules; Daily Care; Behavior & Support; Curriculum & Learning.

### Team
Employees; Workforce; Staff Scheduling; Training Center; Accountability; Employee Lounge; Employee Bulletin Board.

### Transportation
Transportation; Daily Transportation / My Route Today; Routes; Driver Assignments; Fleet & Fuel.

### Program Operations
Meals; Ratios; Shift Reports; Health & Safety; Safety & Emergency; Opening / Closing Reports.

### School-Age
Gator Cash; Student Store; Jobs / Payday; Enrichment.

### Administration
Enrollment Pipeline; Digital Forms; Compliance Center; Files; **KidKare**; Timesheets; Transportation Fees; Administrative Reports.

**KidKare is an Administration module.** Do not place KidKare under Program Operations. KidKare remains restricted to Owner/Admin and appropriate Location Licensees; standard Employees do not receive KidKare access.

### Visual Studio
Visual Boards; Printable Studio; Marketing Studio.

### Company
Locations; Team Access; Audit Log; Settings.

## Branded page identities
- Employee Lounge: navy / green / gold / cream with alligator identity.
- KidKare: blue / yellow / green, while remaining inside Administration navigation.
- School Age Center: energetic blue / green / yellow / purple / teal.
- Lara Family Childcare: navy / green / gold / cream.
- Thomason Family Childcare / 21st: green / gold / cream / sage.
- Employee Bulletin Board: navy / green / cork-tan pinned-board treatment.
- Moore Family Childcare / Halcom: soft green / blush / peach / cream.
- Cornejo Family Childcare: navy / gold / sage / cream.
- Thomason Maintenance: navy / green / white.
- School Shuttle / Transportation: blue / yellow / white.
- Each area uses its approved identity while remaining unmistakably part of one TCS Hub.
- Hybrid Operations View + Visual/Display/Print View wherever appropriate.

## Dashboard / Command Center
- Large location-aware hero with time-of-day greeting, date, active location, and program type.
- What Needs My Attention cards for staffing, ratios, transportation, compliance, family follow-up, forms, and incidents.
- Today at TCS timeline.
- TCS AI Morning Briefing using only authorized operational context.
- Large Quick Actions for Add Child, Behavior Note, Staff Call-Out, Transportation Change, DRDP Observation, Incident, Gator Cash, and Visual/Print Board.

## Locations
- Every location gets a branded operational home page using shared real operational components.
- Halcom / Moore: today’s children, ratios, staffing, transportation, meals, extended care and Halcom Weekly Board.
- Lara, Cornejo, Thomason/21st, School Age Center/Division, and Tehachapi each receive their own visual identity and site-relevant home-page summary.

## Children / Families
- Children page supports large Card View plus admin Table View.
- Child card shows name, age, location, attendance/today status, transportation, family, alerts, and quick actions.
- Add Child starts with Select Existing Family or Create New Family.
- One family profile connects all children/siblings and should not duplicate a family for each child.
- Family hub includes guardians, contact details, funding, linked children, approved family-facing items, and appropriate admin shortcuts.

## Workforce / hierarchy
- Real Level 1–6 hierarchy plus Maintenance branch.
- Cross-location staffing visibility.
- Workforce hub with Today, Schedule, Time Clock, Call-Outs, Time Off, Coverage, Availability, split shifts, weekly hours, conflict/coverage warnings, acknowledgments, and accountability.
- Coverage Board uses a visual time line so gaps are obvious.
- Call-Out flow shows affected location/hours, ratio risk, eligible replacements, and Send Coverage Request.
- Real geofenced clock-in enforcement remains a production TODO until actually implemented and validated; preview must not claim it is live.

## Training / Employee experience
- Training Center uses a visual mission/progression layout with external training links, provider, due date, role/location/person assignments, recurrence/renewal, certificate upload, verification, base XP and optional on-time bonus.
- Employee Lounge emphasizes My Day, My XP, Training, Rewards, Team Stuff, birthdays, announcements, wins and shout-outs.
- Lifetime XP and Spendable XP must remain clearly distinguished; a redemption ledger is still a production TODO until implemented.
- Employee Bulletin Board uses a pinned/corkboard visual system for company news, location news, transportation, training, celebrations and deadlines.

## Accountability
- Use Accountability & Follow-Through, not a punishment-style page.
- Workflow: Assigned -> Due -> Completed -> Verified.
- Sections for Assignments, Acknowledgments, Follow-Ups, Corrective Actions, and Wins.

## Safety / child operations / fleet
- Safety & Emergency Center with large fast-access actions for injury, missing child, fire, lockdown, hazard, licensing visit, and emergency contacts.
- Child Operations and funding authorizations.
- Cash-pay rules and exclusion from subsidy Timesheet tracking where applicable.
- Per-child parent/licensee Timesheet signatures.
- Fleet, gas/fuel, and Upside tracking.
- Vehicle cards show readiness, mileage, fuel, seats, assigned driver and next maintenance; statuses include Ready, Attention Soon and Out of Service.
- Maintenance work orders use Reported -> Assigned -> In Progress -> Completed -> Verified.

## Transportation
- School Shuttle identity: blue/yellow/white, with large MY ROUTE TODAY entry point.
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
- Visual Boards navigation expands to Staff Availability, Coverage Board, Parent Snapshot, Bulletin Board and future smart boards.
- Each board supports Operations View plus Display/Print View, with Edit, Duplicate, Print, PNG, PDF, and role-safe share/export options.

## Curriculum & Learning Center
- TCS educational identity: Montessori-inspired + STEAM-powered + DRDP-informed.
- Today’s Learning Plan for staff with theme, activities, materials, objective, instructions, adaptations, completion, photo/documentation, and observations.
- Weekly Curriculum Board with theme, books, vocabulary, questions, learning domains, materials, and extension activities.
- Program-specific curriculum experiences for Infant/Toddler, Preschool/Pre-K, and School Age.
- Montessori tags: Practical Life, Sensorial, Language, Mathematics, Cultural Studies, Grace & Courtesy, Independence/Concentration, Fine Motor/Coordination plus child choice, hands-on, self-correcting, real-world purpose, repetition, prepared environment, orderly sequence and mixed-age opportunity.
- STEAM tags: Science, Technology, Engineering, Art, Mathematics.
- Curriculum Builder, reusable Activity Library, favorites/duplicate/archive/share-across-locations, materials, preparation, instructions, vocabulary, discussion questions, accommodations, extensions, indoor/outdoor, group size, duration, printables/media links.
- Staff curriculum accountability: completed/modified/skipped, reason for skip, documentation status.
- Appropriate family-facing Learning This Week view reserved for Parent Portal.
- AI curriculum assistance may suggest plans/material substitutions but must remain reviewable by staff/admin.

## DRDP Made Easy
- Guided, plain-language DRDP workflow designed for staff who may not have Child Development coursework.
- Quick “I Saw This Today” observation flow using typed note, voice-to-text where supported, suggested observation tags, work samples/photos where authorized, and activity/child tags.
- Explain formal DRDP concepts in plain language without changing the official meaning.
- “What to look for,” real-world examples, Montessori examples, STEAM examples, and inclusive examples for different communication/mobility needs.
- Evidence Inbox indicators: Need More Information / Developing Evidence / Ready to Rate.
- “Ready to Rate” is a usability aid, not an official score.
- AI may suggest likely related measures/evidence levels but must never silently assign an official rating.
- Guided assessment wizard, missing-evidence prompts, Child Development Profile, DRDP Mini Academy, future Family Observations, and deadline/readiness dashboard.

## Behavior & Support Center
- Keep formal Incident Reports.
- Add Quick Behavior Note, Positive Moment, and Guided ABC Observation as separate documentation levels.
- Plain-language ABC prompts: what happened right before, exactly what the child did, what happened after; encourage objective wording.
- Behavior timeline, trends/patterns, time-of-day/context/trigger analysis, strategy effectiveness, duration/repeated behavior counts where appropriate.
- Individual Support Plans: strengths/interests, triggers, early warning signs, prevention, replacement skills, regulation, reinforcement, staff response, safety response, family input, goals and review date.
- Staff Support Snapshot from child profile/daily care/classroom pages.
- Convert ABC observation to Incident Report without duplicate entry.
- Parent communication log.
- Behavior documentation includes positive growth, not only challenging behavior.

## Gator Cash student economy
- Currency name: Gator Cash; tagline Earn • Save • Spend • Grow.
- Digital child wallet with spendable balance, savings, transaction history, goal, wishlist, classroom job and achievements.
- Each location controls its own store catalog, pricing, inventory, limits, eligibility, approvals and store schedule.
- Halcom Student Store default schedule: every Friday.
- Halcom may offer snacks, prizes, fidgets, mystery rewards and VR time; other locations do not need the same catalog.
- Friday Store mode includes Store, Checkout/Register, VR Queue, Inventory, Wallets, and Close Store.
- VR/experience purchases reserve time slots and use a staff completion queue.
- Snack purchases respect authorized food restrictions without exposing private health details to other children.
- Classroom jobs with pay, responsibilities and staff-confirmed payday.
- Economy is primarily earn-based, not punishment-based.
- Immutable transaction ledger; corrections use reversal with reason rather than deleting history.
- Savings goals and age-appropriate financial-literacy prompts.
- Future Parent Portal provides read-only view of their own child’s wallet/savings/goal/earnings.

## Administration page expectations
- Enrollment Pipeline uses a visual CRM: New Inquiry -> Tour Needed -> Tour Scheduled -> Follow-Up -> Paperwork -> Enrolled.
- Digital Forms uses Draft -> Ready to Send -> Sent -> Signed -> Verified.
- Compliance Center uses clear green/yellow/red readiness states and filters by child, staff, location, agency and document type.
- KidKare keeps its blue/yellow/green identity while living under Administration.
- Timesheets use Location Prep -> Review -> Signatures -> Submit -> Complete and should not default to an unreadably dense grid.

## Parent Portal future integration
- Parent/family accounts remain disabled in the current production foundation until the portal is intentionally built and security-tested.
- Future portal requirements reserved: transportation pickup/arrival notifications and timeline, Learning This Week, family DRDP observations, Gator Cash read-only view, child-specific notices/forms/signatures as separately approved.
- Never expose another child’s name, route details, staffing information, behavior notes, DRDP internal notes, or internal opening/closing reports to parents.

## Preview safety / launch gate
- Full-site test build uses sample/demo records or browser-local test data for new unvalidated modules.
- Do not connect experimental Curriculum, DRDP, Behavior, Gator Cash, or new Transportation status writes to live confidential records until schema, RLS, audit, role, and migration tests pass.
- Re-test Danielle/Owner, Jennifer/Owner, one Location Licensee and one Employee on the hosted build.
- Re-test location isolation, direct-route denial, KidKare/Timesheet restrictions, audit behavior and encrypted document access.
- Do not replace or promote the real production Hub until Danielle approves the full preview.
