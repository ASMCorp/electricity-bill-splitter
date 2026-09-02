# Electricity Bill Splitter

A React/Vite app for splitting an electricity bill across residents. The public calculator works without an account. Supabase adds effective-dated tariffs, published monthly records, and an administrator-only draft/publish workflow.

## Features

- Public bill calculator with an image download
- Public tariff methodology and version history
- Public, read-only monthly records that expose aliases—not stored private names
- Versioned, immutable tariffs with effective dates
- One draft or published record per calendar month
- Tariff, calculation, and per-person snapshots on every monthly bill
- Admin email/password login plus server-side `is_admin` authorization
- Explicit draft → publish → reopen workflow and previous-month people shortcut
- Row-level security and append-only audit logging
- Graceful calculator-only mode when Supabase is not configured

PDF export and print-specific styles are intentionally not included.

## Local setup

Prerequisites: Node.js 22+ and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

For calculator-only mode, leave both Supabase values unset. In that mode the UI clearly labels the bundled tariff and disables database-backed monthly/admin features; it does not pretend to save records locally.

Run quality checks with:

```bash
npm test
npm run lint
npm run build
```

## Supabase setup

1. Create a Supabase project.
2. Apply `supabase/migrations/202609020001_monthly_billing.sql` with one of:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

   Or paste the migration into the project SQL Editor and run it once.
3. In **Project Settings → API**, copy the project URL and publishable/anon key into `.env.local`:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_ANON_KEY
   ```
4. In **Authentication → Providers**, enable Email. Create admin accounts in **Authentication → Users**. Public sign-up is not used by this app and should remain disabled unless you need it elsewhere.
5. Restart the Vite server after changing environment variables.

Only the public anon/publishable key belongs in the browser. Never put a Supabase service-role key in a `VITE_` variable, source control, or a client deployment.

## Administrator bootstrap

The migration creates a non-admin `profiles` row whenever a new Auth user is created. After creating the user in the Supabase dashboard, promote exactly that user from the SQL Editor:

```sql
select id, email from auth.users order by created_at desc;

update public.profiles
set is_admin = true,
    updated_at = now()
where id = 'PASTE-THE-AUTH-USER-UUID-HERE'::uuid;
```

Verify the result:

```sql
select p.id, u.email, p.is_admin
from public.profiles p
join auth.users u on u.id = p.id
where p.id = 'PASTE-THE-AUTH-USER-UUID-HERE'::uuid;
```

Do not expose a UI or anonymous RPC for changing `is_admin`. The flag is protected by table grants/RLS and should be managed by a trusted database operator.

### Existing Auth users

If Auth users existed before the migration, backfill their non-admin profiles first:

```sql
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
```

Then promote the intended account with the bootstrap statement above.

## Data and security model

- `tariff_versions` stores immutable slabs and effective dates. Updating/deleting a tariff raises an error; create a new version instead.
- New tariff versions cannot be backdated into or before a month that already has a saved bill, so existing snapshots remain publishable and reopenable.
- Tariff creation and monthly-bill validation share a transaction-level database lock to serialize concurrent applicability checks.
- `monthly_bills` has a unique `(bill_year, bill_month)` constraint. New rows must be drafts.
- Publishing validates that the stored tariff snapshot matches its tariff version and that person totals reconcile to the bill.
- Published rows cannot be edited. Reopen first; reopening and editing must be separate database operations.
- Anonymous users cannot select `monthly_bills` directly. `published_monthly_bills` exposes only published rows and removes `display_name` from each public JSON person record.
- `audit_logs` records inserts/updates/deletes on profiles, tariffs, and monthly bills. Only admins can read it; clients cannot write it.
- RLS still performs authorization even if a user bypasses the UI. The UI admin check is only an additional guard.

## Deployment

Build with `npm run build`; deploy the generated `dist/` directory to any static host.

For Vercel:

1. Import the repository as a Vite project.
2. Use build command `npm run build` and output directory `dist`.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to each intended environment (Preview/Production).
4. Redeploy after adding or changing environment variables.
5. Add the deployed origin under Supabase **Authentication → URL Configuration** if Auth redirect settings require it.

The migration must be applied separately to the Supabase project before database-backed views or admin operations will work.

## Operational workflow

1. Create a new immutable tariff version when pricing changes; set its effective date.
2. Create a monthly draft, select the applicable tariff, and optionally copy identities from the previous month. AC readings and bill amount are intentionally cleared by the shortcut.
3. Review and save the draft. The database enforces one record per month.
4. Publish to expose the alias-only snapshot publicly.
5. To correct a published record, reopen it first, edit the draft, then publish again. Every transition is audited.
