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

Apply the migrations in order from `supabase/migrations/`:

1. `20260924000100_initial_attendance_schema.sql`
2. `20260924000200_phase1_security_integrity.sql`
3. `20260924000300_phase2_academic_data_model.sql`
4. `20260924000400_phase3_student_crud.sql`
5. `20260924000500_phase3_student_crud_lint_fix.sql`

Use separate SQL Editor queries, or paste them in order and run each query.

### Supabase CLI

Authenticate once with `npx supabase login`, then link this folder:

```bash
npx supabase link --project-ref yvvgvteijtxnuwtncfio
npx supabase db push
```

Do not commit the access token created by `supabase login`.

It creates:

- Tables: `profiles`, `settings`, `subjects`, `students`, `attendance`,
  `leaves`, `faculty`, `audit_logs`, `academic_years`, `semesters`,
  `sections`, `enrollments`, and `course_offerings`
- Role helpers (`role_of`, `is_admin`, `is_staff`, `student_id_of`) and all
  row level security policies
- Teacher attendance access restricted to assigned subjects, and student leave
  submissions forced to begin as pending
- Relationship-aware access now uses current sections and course offerings;
  teachers can read students and academic records connected to their assigned
  offerings, while students can read their own academic relationships
- Administrator student CRUD RPCs support editing and archiving students while
  preserving attendance and leave history; new student logins receive a current
  enrollment through the `admin-create-user` Edge Function
- Administrator faculty CRUD is available through the admin portal; faculty
  account metadata is synchronized by `admin-update-faculty`, and archiving
  preserves the faculty record while removing the linked login
- Phase 4 adapter methods scope teacher and student reads to assigned course
  offerings, sections, enrollments, attendance, and leave requests
- The private `leave-documents` storage bucket; students can upload and read
  their own documents, while assigned staff can review related documents
- Demo seeds: 5 subjects (CSC419–CSC425), the 2079 batch roster, Aryan's
  attendance history, and the 4 demo leave requests

## 3. Deploy the edge functions

These four functions are the privileged operations (creating/updating/deleting
 accounts and validating leave-document uploads). The service role key stays
inside Supabase.

Dashboard → **Edge Functions** → **Deploy a new function** → paste the content
of each file:

| Function            | File                                        |
| ------------------- | ------------------------------------------- |
| `admin-create-user` | `supabase/functions/admin-create-user/index.ts` |
| `admin-update-faculty` | `supabase/functions/admin-update-faculty/index.ts` |
| `admin-delete-user` | `supabase/functions/admin-delete-user/index.ts` |
| `upload-leave-document` | `supabase/functions/upload-leave-document/index.ts` |

Or with the CLI:

```bash
npx supabase functions deploy admin-create-user --project-ref yvvgvteijtxnuwtncfio
npx supabase functions deploy admin-update-faculty --project-ref yvvgvteijtxnuwtncfio
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
select count(*) from public.academic_years; -- 1 current year
select count(*) from public.semesters;     -- 1 current semester
select count(*) from public.sections;      -- 1 current section
select count(*) from public.course_offerings; -- 5 active offerings
select count(*) from public.enrollments;   -- 8 active enrollments
```

## Access rules at a glance

| Table                 | Student                         | Teacher                              | Admin |
| --------------------- | ------------------------------- | ------------------------------------ | ----- |
| `attendance`          | read own rows                   | read/write assigned offering rows   | all   |
| `leaves`              | insert + read own               | read/review assigned students       | all   |
| `students`            | read own row                    | read assigned section roster        | all   |
| `subjects`            | read catalogue                  | read assigned offerings              | all   |
| `enrollments`         | read own enrollment             | read assigned section relationships | all   |
| `course_offerings`    | read enrolled offerings         | read assigned offerings              | all   |
| `academic_years`      | read                            | read                                 | all   |
| `semesters`           | read                            | read                                 | all   |
| `sections`            | read                            | read                                 | all   |
| `settings`            | read                            | read                                 | update |
| `profiles`            | read own                        | read own                             | all   |
| `faculty`             | no directory access             | read own record                      | all   |

## Still to do later (not part of this setup)

- Subject create/edit/archive, course offering management, and academic
  structure management remain for the next Phase 3 slices.
- Remaining demo panels: dashboard charts, class schedule, notifications,
  course cards, and monthly trend.
