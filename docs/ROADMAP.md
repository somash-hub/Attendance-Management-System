# AttendIQ Delivery Roadmap

## Current baseline

- Frontend: plain HTML, CSS, and JavaScript.
- Backend: Supabase Auth, Postgres, Row Level Security, Storage, and Deno Edge Functions.
- Existing core flows: authentication, role redirects, attendance marking, student dashboard, leave review, settings, and CSV exports.
- All ten frontend JavaScript files pass `node --check`.
- The hosted Supabase project is connected. The current repository revision is the source of truth for this roadmap.

## Phase 0 — Foundation and decisions

**Status: complete**

Phase 0 is intentionally non-functional. It establishes the development rules before database or UI work begins.

### Decisions locked for the next phases

1. **Frontend technology** — remain plain HTML, CSS, and JavaScript. Do not migrate the browser application to TypeScript or add a frontend build step.
2. **Edge Functions** — remain Deno-compatible TypeScript. Each function gets its own `deno.json` so dependencies and compiler settings stay isolated.
3. **Current attendance formula** — preserve the existing behavior during the migration: `Present` contributes to the attendance percentage; `Absent` and `Late` do not. `Late` remains visible as a separate status. This rule must be centralized before the new reporting model is implemented.
4. **Academic hierarchy** — use `academic year → semester → section → course offering`. Students enroll in sections, and teachers are assigned through course offerings rather than permanently to a global subject.
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
relationship-aware and currently limited to the teacher's assigned program;
section-level course offerings remain the next prerequisite.

1. Make student-account creation also create and link a `students` record.
2. Make faculty/account creation maintain the correct domain record.
3. Replace broad authenticated-user student access with student/teacher/admin RLS.
4. Scope teacher subjects, students, attendance, and leave requests to the current academic relationship. Phase 1 uses the assigned program; Phase 2 narrows this to sections and course offerings.
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

**Status: in progress — student slice complete**

The first vertical slice is complete in `supabase/migrations/20260924000400_phase3_student_crud.sql`
with a lint follow-up in `20260924000500_phase3_student_crud_lint_fix.sql`:

1. **Student create/edit/archive — complete.** The admin portal can create a
   linked student login, student record, and current enrollment; edit directory
   details and current section; and archive a student without deleting history.
2. Faculty create/edit/archive — next.
3. Subject create/edit/archive.
4. Course offering creation and teacher assignment.
5. Student enrollment management beyond the create/edit flow.
6. Academic calendar and schedule management.

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
- New leave submissions now include the student's active `section_id`.
- Administrator methods remain institution-wide by design.

**Exit gate passed:** live role checks confirm the teacher sees assigned
offerings, section students, related attendance and leave requests; the student
sees only their own academic relationships and records; the admin retains full
visibility; and anonymous requests return zero protected rows. The frontend
JavaScript, Edge Functions, and repository diff checks pass.

## Phase 5 — Schedule and attendance sessions

Add `class_schedules`, `attendance_sessions`, and session-based attendance records. Migrate existing date/time attendance into sessions and compare reports before removing the legacy path.

**Exit gate:** a teacher marks attendance only for an assigned scheduled session and its enrolled roster.

## Phase 6 — Leave and document completion

Add reviewer comments, review timestamps, cancellation rules, overlap detection, private signed document URLs, server-side file validation, and scoped reviewer access.

**Exit gate:** the complete student → reviewer → decision → document workflow is secure and tested.

## Phase 7 — Notifications and calendar

Add `notifications` and `academic_events`. Replace hard-coded notification copy and calendar dates with database records.

**Exit gate:** unread notifications and academic events are real data.

## Phase 8 — Reports and dashboards

Add filtered student, subject, class, teacher, program, and institution reports. Move large calculations to database views or RPC functions. Replace remaining hard-coded dashboard values.

**Exit gate:** every visible metric and chart is calculated from the same documented attendance formula and current academic scope.

## Phase 9 — Production hardening

Complete password recovery, MFA decision for administrators, production Auth redirect URLs, CORS restrictions, rate limits, accessibility review, responsive testing, automated tests, CI, backups, deployment documentation, and demo-mode isolation.

**Exit gate:** a real student, teacher, and administrator can use the system with no demo credentials, no local password storage, and no unauthorized data access.

## Working rules

1. Never start a new phase before the current phase exit gate passes.
2. Never build a chart before its underlying data and formula are correct.
3. Never remove legacy data until the replacement is migrated, tested, and compared.
4. Complete one vertical slice per commit or small pull request.
5. Update this checklist when a phase is accepted.
6. Keep the frontend plain JavaScript unless a new requirement explicitly changes the implementation target.
7. Treat RLS, server-side validation, and storage policies as part of every feature—not as a later security task.

