# AttendIQ Student Attendance System

AttendIQ is a role-based student attendance management website built with
plain HTML, CSS, and JavaScript. Supabase provides authentication, the shared
attendance and leave data, settings, reports, and administrator account
functions. The old localStorage store is available only in explicit demo mode
when the Supabase browser client is unavailable.

## Product Direction

The supplied Student Panel reference establishes the intended scope for the
finished website:

- **Students:** attendance overview, subject-wise percentages, attendance
  records, class schedule, notifications, and leave requests
- **Teachers:** dashboard, daily attendance marking, class reports, students
  at risk, and leave-request approval
- **Administrators:** institution-wide dashboard, student and teacher
  management, course management, leave management, and settings
- **Shared experience:** role-based authentication, responsive navigation,
  status badges, charts, warnings below the administrator-selected threshold,
  and clear empty or success states

The reference bundle is a React/Vite prototype with Recharts and Lucide icons.
It is being used as a functional and visual reference only; it has not been
copied into this repository. The implementation target for this repository is
plain HTML, CSS, and JavaScript.

## Current Features

- Single login page for every role: Supabase Auth signs the account in and the
  profile role decides which portal opens
- Administrator-managed accounts: create users, assign roles, and remove
  accounts from **Settings → User Accounts** through Supabase Edge Functions
- Role-based redirects and profile checks on every portal page
- Session persistence so a signed-in user stays signed in after a refresh
- Student email-domain validation using the college domain `@kct.edu.np`
- Administrator-controlled attendance threshold persisted in the `settings`
  table (defaults to 80%, the TU requirement, and can be adjusted in Settings)
- Teacher attendance marking backed by students, subjects, course offerings,
  and attendance, including AD/BS dates and database-enforced uniqueness
- Teacher session-based attendance workflow: assigned schedule selection, open/closed
  session status, enrolled-roster marking, and session-scoped saves
- Student dashboard and attendance log computed from the signed-in student's
  own marks, with subject percentages and threshold warnings
- Leave workflow: student submission with optional private document upload,
  teacher/admin review, and approve/reject/undo status changes
- Teacher, admin, and student CSV report downloads
- Demo data aligned with TU BSc CSIT: Semester 7 subjects (CSC419–CSC425),
  Bikram Sambat dates, and Nepali roll numbers
- Supabase schema with row-level security, demo seeds, a private document
  storage bucket, and admin-only account-management edge functions
- Academic data model for years, semesters, sections, enrollments, and course
  offerings, with existing demo records linked into the current structure
- Administrator student CRUD: create a linked student login and enrollment,
  edit student/section details, and archive students while preserving history
- Relationship-scoped teacher and student queries for offerings, rosters,
  attendance, and leave requests
- Scheduled attendance sessions with relationship-scoped RLS, atomic session
  attendance saving, and a separate lint-correction migration
- Student schedules, leave history, cancellation, reviewer notes, signed document
  links, and database-backed notifications
- Live student monthly attendance trend and administrator/teacher metrics derived
  from current database attendance records
- Supabase browser SDK loading and a public publishable-key guard; the
  service-role key is never included in frontend files
- Password visibility toggle, client-side validation, and responsive styling
  for the login screen and all portals
- A password-reset link returns to this login page. Use **Forgot password?** to request
  the email; the recovery screen then updates the password through Supabase Auth.
- The hosted project has all migrations through
  `20260924001302_phase6_8_function_sync.sql` applied. The linked database lint passes.

## Supabase status

The hosted project `yvvgvteijtxnuwtncfio` is connected. All repository migrations
through `20260924001302_phase6_8_function_sync.sql` are applied to the hosted
database, and the linked database lint passes. The project includes Phase 1
security, Phase 2 academic relationships, and the complete Phase 3 administrator
student, faculty, subject, course-offering, enrollment, academic-calendar, and
class-schedule administration slices. The `admin-create-user`,
`admin-update-faculty`, `admin-delete-user`, and `upload-leave-document` Edge
Functions are deployed, and `shared/supabase.js` contains only the public
publishable key. Phase 5 adds `attendance_sessions`, teacher-assignment checks
for opening sessions, atomic session attendance RPCs, relationship-aware RLS,
and adapter methods for teacher/student session reads. The teacher portal now
connects the schedule → open session → mark roster → save → close flow; the
student portal loads its enrolled course schedules, database notifications,
leave history, signed document links, and real monthly attendance trend. Phase 6
adds server-validated leave overlap protection, reviewer notes/timestamps,
student cancellation, and notifications. Phase 8 metrics and charts use the
same current attendance records as the directory/report views. The current
hosted database has five assigned course offerings but no active class schedules
yet, so an administrator must add a schedule before a teacher can open a live
session.

The frontend calls the backend through `shared/supabase-store.js`; a configured
client never silently falls back to localStorage after a request error. The
local store is available only in explicit demo mode (`?demo=1`). See
`supabase/SETUP.md` for setup and security notes.

## Current remaining work

The core attendance, student, teacher, administrator, leave, notification, and
scheduled-session flows are connected to Supabase. Remaining work is production
hardening and scale-oriented improvements:

1. Add automated browser and RLS/session-workflow tests beyond the static checks.
2. Configure a production Supabase Site URL and allowed redirect URLs.
3. Set the `ALLOWED_ORIGINS` Edge Function secret to the real frontend origin, for example:
   `https://attendance.example.com` (use comma-separated origins for multiple deployments).
4. Deploy the hardened Edge Functions and configure administrator MFA.
5. Add rate limits, backups, accessibility/responsive testing, and production deployment.

## Project Structure

```text
.
├── landing page/
│   ├── landing.html
│   ├── landing.css
│   └── landing.js
├── admin panel/
│   ├── admin.html
│   ├── admin.css
│   └── admin.js
├── student panel/
│   ├── student.html
│   ├── student.css
│   └── student.js
├── teacher panel/
│   ├── teacher.html
│   ├── teacher.css
│   └── teacher.js
├── login/
│   ├── login.html
│   ├── login.css
│   └── login.js
├── shared/
│   ├── store.js
│   ├── supabase.js
│   ├── supabase-store.js
│   ├── safe-dom.js
│   └── csv.js
├── supabase/
│   ├── .gitignore
│   ├── config.toml
│   ├── SETUP.md
│   ├── functions/
│   │   ├── admin-create-user/index.ts
│   │   ├── admin-update-faculty/index.ts
│   │   ├── admin-delete-user/index.ts
│   │   └── upload-leave-document/index.ts
│   └── migrations/
│       ├── 20260924000100_initial_attendance_schema.sql
│       ├── 20260924000200_phase1_security_integrity.sql
│       ├── 20260924000300_phase2_academic_data_model.sql
│       ├── 20260924000400_phase3_student_crud.sql
│       ├── 20260924000500_phase3_student_crud_lint_fix.sql
│       ├── 20260924000600_phase3_faculty_crud.sql
│       ├── 20260924000700_phase3_subject_crud.sql
│       ├── 20260924000800_phase3_course_offering_crud.sql
│       ├── 20260924000900_phase3_enrollment_management.sql
│       ├── 20260924001000_phase3_academic_calendar_schedule.sql
│       ├── 20260924001100_phase3_schedule_integrity.sql
│       ├── 20260924001200_phase5_attendance_sessions.sql
│       └── 20260924001201_phase5_attendance_sessions_lint_fix.sql
│       ├── 20260924001300_phase6_8_notifications_and_leave_safeguards.sql
│       ├── 20260924001301_phase6_8_rls_correction.sql
│       └── 20260924001302_phase6_8_function_sync.sql
│       └── 20260924001302_phase6_8_function_sync.sql

└── .vscode/
    ├── mcp.json
    └── settings.json
```

## Running the Project

This is a static frontend and does not require a build step or package
installation.

1. Open `landing page/landing.html` in a web browser to view the public
   landing page.
2. Use any portal button to open `login/login.html`.
3. Sign in with a hosted Supabase account. To use the local demo explicitly,
   open `login/login.html?demo=1`; demo credentials are hidden otherwise.
4. The account role decides which portal opens.
5. Administrators can open **Settings → User Accounts** to create new users
   and assign roles. New accounts can sign in immediately.
6. Administrators can open **Faculty Management** to create, edit, or archive
   faculty records and linked teacher accounts.
7. Opening a portal while signed out redirects back to the login page.
8. The pages use the hosted Supabase client in `shared/supabase.js`. The
   localStorage store is used only in explicit demo mode (`?demo=1`).

### Demo Accounts

| Role          | Email                    | Password       |
| ------------- | ------------------------ | -------------- |
| Administrator | `admin@kct.edu.np`       | `Admin@2025`   |
| Teacher       | `priya.mehta@kct.edu.np` | `Teacher@2025` |
| Student       | `aryan.k@kct.edu.np`     | `Student@2025` |

These accounts must also exist in Supabase Authentication with the same
passwords (see `supabase/SETUP.md`). The local store keeps a demo copy only for
explicit `?demo=1` sessions; the hosted accounts and all attendance data are the
source of truth in normal operation. Do not use these demo passwords for real
users.

The administrator portal loads students, faculty, attendance percentages, leave
requests, users, settings, academic events, and class schedules from Supabase.
Dashboard metrics and program charts are calculated from the same current
attendance records. The admin portal manages academic events and recurring class
schedules in **Settings**.

The student portal loads the signed-in student's attendance dashboard, attendance
log, subject percentages, threshold warning, enrolled class schedule, leave
history, signed document links, notifications, and CSV export from Supabase.

The teacher portal loads the assigned roster, subjects, schedules, daily
attendance marking, semester reports, leave review, notifications-ready data, and
CSV export from Supabase. Dashboard totals and at-risk metrics are calculated
from current assigned attendance records.
