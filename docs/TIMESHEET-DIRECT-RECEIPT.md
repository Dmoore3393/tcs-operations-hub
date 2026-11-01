# Danielle direct receipt

From Timesheets, choose the service month and open a child's workflow. Danielle's active Owner/Admin account can record physical receipt with a reason, then confirm required signatures and dates. Checks can be saved incrementally. Both signature and date review are required before intake can advance to filling out the form. The director's review is recorded independently from Dynasty's review and handoff; existing collector evidence is preserved.

The checklist shows receipt, signature review, date review, completion, documented scan, and documented agency email. Saved checks show verification timestamps, not the dates written on the actual form. Existing scan-batch evidence, routing, licensee approval, Jennifer's email evidence, independent verification, and agency receipt controls remain. Recording an email does not send one. Email routing remains separated by service month, location and program.

Filled, flagged, scanned, approved or emailed forms use existing correction/reopen controls. Direct intake is authorized in both the API and the database, uses the existing optimistic revision check, and writes the actual actor and changes to the transaction's audit record. No child statuses are prefilled or modified by deploying this feature.
