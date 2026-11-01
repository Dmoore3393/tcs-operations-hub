# Departed children and prior-month timesheets

An inactive child can be included in a monthly batch only when their existing server record explicitly confirms that service period in `timesheetServicePeriods`. This does not reactivate the child. A `neverStartedCare` record is excluded. Missing last-care dates are not guessed, and inactive status alone never establishes prior-month eligibility.

The batch builder still requires a recognized subsidy program and active location, and preserves its existing skip-existing-child safeguards. No monthly rows are created automatically by deploying this change. The cleaned review CSV can carry an exact Last day of care, a Care status note, confirmed Timesheet service periods, and Never started care. Blank dates remain blank. Existing program/location details are used before global import defaults when the export omits them; explicit row selections and supplied source details still take precedence.

Normal child edits retain imported identity, additional contacts, care-status notes and confirmed service periods from the server record. Client input cannot overwrite these preserved fields. Second-parent phone/email fields are accepted through the ordinary sanitized child editor. The roster review CSV and individual departure confirmations remain outside this public repository.
