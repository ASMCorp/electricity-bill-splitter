# Calculation methods

Both options estimate bill units using the existing tariff slabs, pool declared AC units, scale excessive readings proportionally, and share the remaining bill equally.

- `highest-first`: original bottom-up allocation, consuming the most expensive active units first. Remains the default.
- `lowest-first`: new top-down allocation, consuming the cheapest active units first.

The guest calculator and monthly billing editor expose a method selector. Changing the method clears the previous calculation. New monthly snapshots store `calculation_snapshot.method`; snapshots without that field retain the original algorithm. Published records remain immutable. Receipt images and public records identify the selected method.

## Deployment prerequisite

Apply `supabase/migrations/202609300001_calculation_methods.sql` in the existing Bill Calculator project's SQL Editor before deploying the frontend. It replaces the validation function, preserves existing snapshot data and authorization rules, and rejects unrecognized method values. No records are deleted or recalculated.

The user explicitly authorized agent-managed application for this change. The live validator was updated through a guarded migration that preserves the existing function body and replaces only the allocation direction logic. Readback confirmed method selection and `lowest-first` support. Commit and push the reviewed feature branch and deploy to Vercel, verifying the assigned production alias and its bundle.

## Local verification

Lint, production build, and whitespace checks passed. No automated test cases were added or run, following the project's standing preference.

A direct execution with the bundled tariff, a 600 taka bill, two residents, and 20 AC units for one resident returned:

| Method | AC cost | Shared per person | Person totals |
| --- | --- | --- | --- |
| highest-first | 160.85647058823528 | 219.57176470588234 | 380.4282352941176, 219.57176470588234 |
| lowest-first | 123.6 | 238.2 | 361.79999999999995, 238.2 |

Both executions reconciled to 600. The live database validator now supports both methods, confirmed by function-definition readback. No real monthly bill records were created as part of verification.
