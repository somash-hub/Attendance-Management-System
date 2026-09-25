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
- Supabase browser SDK loading and a public publishable-key guard; the
  service-role key is never included in frontend files
- Password visibility toggle, client-side validation, and responsive styling
  for the login screen and all portals

## Supabase status

The hosted project `yvvgvteijtxnuwtncfio` is connected. The initial migration,
Phase 1 security migration, Phase 2 academic data-model migration, and Phase 3
student CRUD migration are applied. The `admin-create-user`,
`admin-delete-user`, and `upload-leave-document` Edge Functions are deployed,
and `shared/supabase.js` contains only the public publishable key. Phase 2
backfills the current academic year, Semester 7, BSc CSIT Section A, five
course offerings, and eight active student enrollments while preserving legacy
attendance and leave rows. Phase 3 adds administrator student create/edit/
archive operations with enrollment synchronization. Phase 4 adds explicit
relationship-scoped teacher and student reads for course offerings, rosters,
attendance, and leave requests; administrator queries remain institution-wide
by design. The frontend calls the backend through `shared/supabase-store.js`; a
configured client never silently falls back to localStorage after a request
error. The local store is available only in explicit demo mode (`?demo=1`). See
`supabase/SETUP.md` for the setup and security notes.

## Planned Frontend Work

The Supabase data layer and the main attendance, leave, account, settings, and
report flows are connected. Remaining iterations are:

1. Replace the remaining demo panels with database queries: faculty and course
   cards, class schedule, notifications, monthly trend, and the administrator
   dashboard charts and metrics.
2. Add administrator forms for faculty, subjects, course offerings, and
   academic structure so the remaining directory and catalog data can be
   managed instead of seeded with SQL.
3. Add leave-document viewing for reviewers and richer empty/loading states.
4. Consolidate duplicated panel helpers and styles into shared files.

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
│   │   ├── admin-delete-user/index.ts
│   │   └── upload-leave-document/index.ts
│   └── migrations/
│       ├── 20260924000100_initial_attendance_schema.sql
│       ├── 20260924000200_phase1_security_integrity.sql
│       ├── 20260924000300_phase2_academic_data_model.sql
│       ├── 20260924000400_phase3_student_crud.sql
│       └── 20260924000500_phase3_student_crud_lint_fix.sql
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
4. Administrators can open **Settings → User Accounts** to create new users
   and assign roles. New accounts can sign in immediately.
5. Opening a portal while signed out redirects back to the login page.
6. The pages use the hosted Supabase client in `shared/supabase.js`. The
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

The administrator portal now loads students, attendance percentages, leave
requests, users, and settings from Supabase. Dashboard metrics, program charts,
faculty and course cards, and the academic calendar still use demo data.

The student portal now loads the signed-in student's attendance dashboard,
attendance log, subject percentages, threshold warning, leave submission, and
CSV export from Supabase. The weekly class schedule and notification copy
remain demo data.

The teacher portal now loads the roster, assigned subjects, daily attendance
marking, semester reports, leave review, settings, and CSV export from
Supabase. Dashboard subject averages and some summary metrics still use demo
data.
