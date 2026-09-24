# Supabase Setup for AttendIQ

Project reference: `yvvgvteijtxnuwtncfio`
Everything in this folder is **idempotent** — running it again is safe.

## 1. Create the three demo accounts

Supabase Dashboard → **Authentication → Users → Add user** → tick
**Auto Confirm User** (skip sending an invite):

| Email                     | Password       | Role    |
| ------------------------- | -------------- | ------- |
| `admin@kct.edu.np`        | `Admin@2025`   | admin   |
| `priya.mehta@kct.edu.np`  | `Teacher@2025` | teacher |
| `aryan.k@kct.edu.np`      | `Student@2025` | student |

## 2. Run the schema

Dashboard → **SQL Editor → New query** → paste the whole of
`supabase/schema.sql` → **Run**.

It creates:

- Tables: `profiles`, `settings`, `subjects`, `students`, `attendance`,
  `leaves`
- Role helpers (`role_of`, `is_admin`, `is_staff`, `student_id_of`) and all
  row level security policies
- The private `leave-documents` storage bucket with upload/read policies
- Demo seeds: 5 subjects (CSC419–CSC425), the 2079 batch roster, Aryan's
  attendance history, and the 4 demo leave requests

## 3. Deploy the edge functions

These two functions are the only privileged operations (creating and deleting
login accounts). The service role key stays inside Supabase.

Dashboard → **Edge Functions** → **Deploy a new function** → paste the content
of each file:

| Function            | File                                        |
| ------------------- | ------------------------------------------- |
| `admin-create-user` | `supabase/functions/admin-create-user/index.ts` |
| `admin-delete-user` | `supabase/functions/admin-delete-user/index.ts` |

Or with the CLI:

```bash
npx supabase functions deploy admin-create-user --project-ref yvvgvteijtxnuwtncfio
npx supabase functions deploy admin-delete-user --project-ref yvvgvteijtxnuwtncfio
```

## 4. Lock down signups

Authentication → **Providers → Email** → turn **off**
"Allow new users to sign up". Accounts are created only by administrators
(the edge functions above), which is exactly how the app works today.

## 5. Connect the frontend

Settings → **API** → copy:

- **Project URL** → already filled in `shared/supabase.js`
- **anon public key** → paste it into `shared/supabase.js`

The anon key is safe to ship to the browser because every table is protected
by row level security. **Never** put the `service_role` key in frontend files
or in this repository.

## 6. Sanity checks (SQL Editor)

```sql
select count(*) from public.profiles;    -- 3
select * from public.settings;           -- threshold = 80
select count(*) from public.subjects;    -- 5
select count(*) from public.students;    -- 8
select count(*) from public.attendance;  -- 8 (Aryan's history)
select count(*) from public.leaves;      -- 4
```

## Access rules at a glance

| Table        | Student                  | Teacher                       | Admin |
| ------------ | ------------------------ | ----------------------------- | ----- |
| `attendance` | read own rows            | read/write own subject rows   | all   |
| `leaves`     | insert + read own        | read + approve/reject         | all   |
| `students`   | read (roster)            | read                          | write |
| `subjects`   | read                     | read                          | write |
| `settings`   | read                     | read                          | update |
| `profiles`   | read own                 | read own                      | all   |

## Still to do later (not part of this setup)

- Extra teacher accounts for the faculty directory (currently one teacher
  account exists; the rest of the directory stays demo data until then).
- The frontend refactor that moves `shared/store.js` from localStorage to
  these tables (see the project roadmap).
