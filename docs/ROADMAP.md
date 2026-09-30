# AttendIQ Delivery Roadmap

## Current baseline

- Frontend: plain HTML, CSS, and JavaScript.
- Backend: Supabase Auth, Postgres, Row Level Security, Storage, and Deno Edge Functions.
- Existing core flows: authentication, role redirects, attendance marking, student dashboard, leave review, settings, and CSV exports.
- All ten frontend JavaScript files pass `node --check`.
- The hosted Supabase project is connected. The current repository revision is the source of truth for this roadmap.
- The source uses program plus each student's semester for course access.
  Migrations `20260930000200` through `20260930000400` are live. Administrators
  can set an active year from 2020 onward; all eight semesters are available
  and individually assigned to students within that year.

## Phase 0 — Foundation and decisions

**Status: complete**

Phase 0 is intentionally non-functional. It establishes the development rules before database or UI work begins.

### Decisions locked for the next phases

1. **Frontend technology** — remain plain HTML, CSS, and JavaScript. Do not migrate the browser application to TypeScript or add a frontend build step.
2. **Edge Functions** — remain Deno-compatible TypeScript. Each function gets its own `deno.json` so dependencies and compiler settings stay isolated.
3. **Current attendance formula** — preserve the existing behavior during the migration: `Present` contributes to the attendance percentage; `Absent` and `Late` do not. `Late` remains visible as a separate status. This rule must be centralized before the new reporting model is implemented.
4. **Academic relationships** — each student has an individual semester from
   1-8. Students access offerings through their program and semester; batches
   remain roster information. Legacy sections and enrollments are retained as
   historical records, not as current access controls.
5. **Historical records** — do not hard-delete students, teachers, subjects, or semesters once attendance history exists. Add archive/status fields and preserve audit history.
6. **Authorization** — the database is the final authority. Students, teachers, and administrators must have relationship-aware RLS, not only frontend visibility rules.
7. **Production fallback** — the localStorage store is demo-only. It must not silently authenticate production users or store plaintext passwords in the normal application.

### Phase 0 deliverables

- [x] Revert the accidental leading space in the admin-create-user comment.
- [x] Add Deno-aware VS Code settings.
- [x] Recommend the official `denoland.vscode-deno` extension.
- [x] Add function-local Deno configuration.
- [x] Record the phase gates and locked decisions.
- [x] Run `deno check` for both Edge Functions.
- [x] Run the complete JavaScript syntax and repository checks after configuration changes.

### Phase 0 exit gate

Do not start Phase 1 until:

- the Deno configuration is accepted by the Edge Function runtime;
- both functions pass `deno check` or their runtime-equivalent validation;
- frontend JavaScript syntax checks pass;
- the working tree contains only intentional Phase 0 changes;
- the attendance and academic decisions above are recorded and used by the next phase.

## Phase 1 — Security and data integrity

**Status: complete**

Phase 1 is the security and data-integrity foundation. Teacher access is
relationship-aware. The latest local migration narrows teacher/student access
to current-semester offerings and the students' program.

1. Make student-account creation also create and link a `students` record.
2. Make faculty/account creation maintain the correct domain record.
3. Replace broad authenticated-user student access with student/teacher/admin RLS.
4. Scope teacher subjects, students, attendance, and leave requests to the
   current academic relationship. The hosted baseline used section enrollments;
   the latest local migration switches this to program and current semester.
5. Replace unsafe database-value interpolation in `innerHTML` with safe DOM rendering.
6. Remove silent production fallback to local authentication.
7. Add server-side upload validation for leave documents.
8. Add audit logging for account, academic, attendance, leave, and settings changes.
9. Add a server-side upload function that validates file type, size, and signature.

**Exit gate:** authorization tests pass for anonymous, student, teacher, and admin actors; account creation is consistent; destructive actions are audited; leave uploads are validated server-side. Anonymous REST access is verified as zero visible rows through RLS.

## Phase 2 — Academic data model

**Status: complete**

Phase 2 adds the minimum relational structure needed by the product:

- `academic_years`
- `semesters`
- `sections`
- `enrollments`
- `course_offerings`

The migration is `supabase/migrations/20260924000300_phase2_academic_data_model.sql`.
It backfills the current academic year, Semester 7, BSc CSIT Section A, five
active course offerings, eight active enrollments, and links existing
attendance and leave rows without deleting legacy data. Relationship-aware RLS
now limits student, teacher, admin, and leave-document access to the academic
connections represented by the new tables.

**Exit gate passed:** an administrator can represent a current academic year,
semester, section, subject, teacher assignment, and student enrollment in the
database; the remote migration is applied, schema lint passes, and live role
checks confirm the expected visibility boundaries.

## Phase 3 — Administrator CRUD, one vertical slice at a time

**Status: complete — all Phase 3 administration slices are implemented and hosted**

The completed vertical slices are:

- `20260924000400_phase3_student_crud.sql` with lint follow-up
  `20260924000500_phase3_student_crud_lint_fix.sql`
- `20260924000600_phase3_faculty_crud.sql`
- `20260924000700_phase3_subject_crud.sql`
- `20260924000800_phase3_course_offering_crud.sql`
- `20260924000900_phase3_enrollment_management.sql`
- `20260924001000_phase3_academic_calendar_schedule.sql`
- `20260924001100_phase3_schedule_integrity.sql` (relationship-aware schedule reads and stable slot uniqueness)

1. **Student create/edit/archive — complete.** The admin portal creates a
   linked student login and directory record using program, batch, and TU roll;
   students have an individually selected semester from 1-8. Archiving
   preserves history.
2. **Faculty create/edit/archive — complete.** The admin portal creates linked
   teacher accounts and faculty records, edits directory metadata and Auth email,
   and archives faculty while preserving the faculty record and history. The
   privileged `admin-update-faculty` function keeps Auth, profiles, and faculty
   records synchronized.
3. **Subject create/edit/archive — complete.** The admin portal manages the subject catalog with permanent subject codes, editable metadata, credits and course type, plus archive/restore actions. Existing attendance and course-offering history is preserved.
4. **Course offering creation and teacher assignment — complete.** The admin
   portal assigns each subject/semester to a faculty member; current offerings
   are shared by every batch in that program.
5. **Student enrollment management — replaced by semester grouping.** New
   students do not receive section enrollments; existing enrollment records are
   archived, not deleted.
6. **Academic calendar and schedule management — complete.** Administrators can create, edit, archive, and restore date-based academic events and recurring course-offering schedules.

Each slice must include database migration, RLS, JavaScript adapter method, HTML form, validation, success/error states, tests, and documentation. No SQL should be required for normal administration.

**Exit gate:** the full academic setup can be completed through the admin portal.

## Phase 4 — Scoped teacher and student queries

**Status: complete**

The broad portal calls have been replaced with explicit role-scoped adapter
operations in `shared/supabase-store.js`:

- Teacher: `getTeacherCourseOfferings`, `getTeacherStudents`,
  `getTeacherSubjects`, `getTeacherAttendance`, and `getTeacherLeaves`
- Student: `getMyStudentProfile`, `getMySubjects`, `getMyAttendance`, and
  `getMyLeaves`
- Teacher attendance writes now include the selected `course_offering_id`.
- New leave submissions are independent of section/enrollment records.
- Administrator methods remain institution-wide by design.

**Exit gate passed:** live role checks confirm the teacher sees assigned
offerings, current-semester program students, related attendance and leave requests; the student
sees only their own academic relationships and records; the admin retains full
visibility; and anonymous requests return zero protected rows. The frontend
JavaScript, Edge Functions, and repository diff checks pass.

## Phase 5 — Schedule and attendance sessions

**Status: complete — scheduled sessions, teacher marking, student reads, leave decisions, and notifications are connected.**

The hosted database now contains `attendance_sessions`, the optional
`attendance.attendance_session_id` link, and the `create_attendance_session`,
`close_attendance_session`, and `save_attendance_session` RPCs. Session writes
are restricted to an assigned teacher (or administrator), validate the scheduled
weekday, validate active students in the assigned program/current semester, and
save all marks in one operation. Session reads are relationship-scoped for
teachers and current-semester students. The teacher
portal now loads assigned schedules, opens a session, locks the roster controls
until the session is open, saves session-linked marks, and closes the session.
The student portal now loads enrolled course schedules, session-linked
attendance, notifications, and live monthly trends. The existing legacy
attendance path remains readable for historical rows; new teacher marking uses
scheduled sessions.

## Phase 6 — Leave and document completion

**Status: complete.**

Reviewer comments, review timestamps, cancellation, overlap detection, private signed document URLs, and scoped reviewer access are implemented and database-protected.

## Phase 7 — Notifications and calendar

**Status: complete.**

Database-backed notifications now record leave decisions, unread state, and related request IDs. Academic events and calendar administration are already connected to the admin portal.

## Phase 8 — Reports and dashboards

**Status: complete.**

Student, teacher, and administrator dashboards use current attendance records, and CSV exports use the same attendance data. Large-scale database aggregation remains an optimization, not a missing user workflow.

## Phase 9 — Production hardening

**Status: in progress — code-side hardening is complete; deployment configuration remains.**

Password recovery, static validation, CI checks, and environment-controlled Edge Function CORS are implemented. Before production, set the real Site URL/redirect URLs and `ALLOWED_ORIGINS`, configure administrator MFA, rate limits, SMTP, backups, and run end-to-end accessibility/responsive tests.

**Exit gate:** a real student, teacher, and administrator can use the system with no demo credentials, no local password storage, and no unauthorized data access.

## Working rules

1. Never start a new phase before the current phase exit gate passes.
2. Never build a chart before its underlying data and formula are correct.
3. Never remove legacy data until the replacement is migrated, tested, and compared.
4. Complete one vertical slice per commit or small pull request.
5. Update this checklist when a phase is accepted.
6. Keep the frontend plain JavaScript unless a new requirement explicitly changes the implementation target.
7. Treat RLS, server-side validation, and storage policies as part of every feature—not as a later security task.
