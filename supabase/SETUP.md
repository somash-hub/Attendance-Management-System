# Supabase Setup for AttendIQ

Project reference: `yvvgvteijtxnuwtncfio`
Everything in this folder is **re-runnable** — the schema drops and recreates
its named policies before enabling them, so policy changes can be applied
again safely. The hosted project has the migration and both Edge Functions
applied; the steps below can be used to reproduce or update the setup.

## 1. Create the three demo accounts

Supabase Dashboard → **Authentication → Users → Add user** → tick
**Auto Confirm User** (skip sending an invite):

| Email                     | Password       | Role    |
| ------------------------- | -------------- | ------- |
| `admin@kct.edu.np`        | `Admin@2025`   | admin   |
| `priya.mehta@kct.edu.np`  | `Teacher@2025` | teacher |
| `aryan.k@kct.edu.np`      | `Student@2025` | student |

## 2. Apply the database migration

Create the three Auth users first, then choose one of these methods.

### Supabase Dashboard

**SQL Editor → New query** → paste the whole of
`supabase/migrations/20260924000100_initial_attendance_schema.sql` → **Run**.

### Supabase CLI

Authenticate once with `npx supabase login`, then link this folder:

```bash
npx supabase link --project-ref yvvgvteijtxnuwtncfio
npx supabase db push
```

Do not commit the access token created by `supabase login`.

It creates:

- Tables: `profiles`, `settings`, `subjects`, `students`, `attendance`,
  `leaves`, `faculty`, and `audit_logs`
- Role helpers (`role_of`, `is_admin`, `is_staff`, `student_id_of`) and all
  row level security policies
- Teacher attendance access restricted to assigned subjects, and student leave
  submissions forced to begin as pending
- Teacher/admin leave-document access restricted to the teacher's assigned
  program roster until section-level offerings are added in Phase 2
- The private `leave-documents` storage bucket; students can upload and read
  their own documents, while staff can review every leave document
- Demo seeds: 5 subjects (CSC419–CSC425), the 2079 batch roster, Aryan's
  attendance history, and the 4 demo leave requests

## 3. Deploy the edge functions

These three functions are the only privileged operations (creating and
 deleting accounts and validating leave-document uploads). The service role
 key stays inside Supabase.

Dashboard → **Edge Functions** → **Deploy a new function** → paste the content
of each file:

| Function            | File                                        |
| ------------------- | ------------------------------------------- |
| `admin-create-user` | `supabase/functions/admin-create-user/index.ts` |
| `admin-delete-user` | `supabase/functions/admin-delete-user/index.ts` |
| `upload-leave-document` | `supabase/functions/upload-leave-document/index.ts` |

Or with the CLI:

```bash
npx supabase functions deploy admin-create-user --project-ref yvvgvteijtxnuwtncfio
npx supabase functions deploy admin-delete-user --project-ref yvvgvteijtxnuwtncfio
npx supabase functions deploy upload-leave-document --project-ref yvvgvteijtxnuwtncfio
```

## 4. Lock down signups

Authentication → **Providers → Email** → turn **off**
"Allow new users to sign up". Accounts are created only by administrators
(the edge functions above), which is exactly how the app works today.

## 5. Connect the frontend

Settings → **API** → copy:

- **Project URL** → already filled in `shared/supabase.js`
- **anon/publishable key** → already filled in `shared/supabase.js`; replace it
  only when rotating the public key

For current Supabase dashboards, the public and secret keys are shown under
**Project Settings → API Keys**. Use only the `anon`/`publishable` key in the
browser.

The public key is safe to ship to the browser because every table is protected
by row level security. **Never** put the `service_role` key in frontend files,
Git commits, or this repository. The local store is available only in explicit
`?demo=1` sessions.

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
- Administrator forms for students, subjects, and faculty assignments.
- Remaining demo panels: dashboard charts, class schedule, notifications,
  faculty/course cards, and monthly trend.
- Leave-document viewing for reviewers.
