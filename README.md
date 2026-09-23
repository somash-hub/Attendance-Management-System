# AttendIQ Student Attendance System

AttendIQ is a frontend project for a role-based student attendance management
website. The current implementation is being built with plain HTML, CSS, and
JavaScript so that the interface and user flows can be completed before adding
a backend.

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
  status badges, charts, warnings below the 75% threshold, and clear empty or
  success states

The reference bundle is a React/Vite prototype with Recharts and Lucide icons.
It is being used as a functional and visual reference only; it has not been
copied into this repository. The implementation target for this repository is
plain HTML, CSS, and JavaScript.

## Current Features

- Single login page for every role: the account decides which portal opens
- Administrator-managed accounts: create users and assign roles from
  **Settings → User Accounts**
- Role-based redirect after login to the student, teacher, or administrator
  portal
- Session persistence so a signed-in user stays signed in after a refresh
- Student email-domain validation using the college domain `@kct.edu.np`
- Administrator-controlled attendance threshold (defaults to 80%, the TU
  requirement, and can be adjusted in Settings)
- Demo data aligned with TU BSc CSIT: Semester 7 subjects (CSC419–CSC425),
  Bikram Sambat dates, and Nepali roll numbers
- Password visibility toggle
- Client-side validation for email and password requirements
- Responsive styling for the login screen and all portals

## Planned Frontend Work

The authentication foundation is in place. The next iterations will make the
portals work on shared data and finish the remaining actions:

1. Build a shared data store so the student, teacher, and administrator
   portals read and write the same attendance, leave, and course records.
2. Replace demo actions with real behavior: CSV export, add/edit forms,
   persisted settings, and notifications.
3. Consolidate duplicated panel helpers and styles into shared files.
4. Replace browser-only accounts and demo data with backend/API integration.

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
│   └── store.js
└── .vscode/
    └── settings.json
```

## Running the Project

This is a static frontend and does not require a build step or package
installation.

1. Open `landing page/landing.html` in a web browser to view the public
   landing page.
2. Use any portal button to open `login/login.html`.
3. Sign in with one of the demo accounts below, or click a demo chip on the
   login page to auto-fill the credentials; the account role decides which
   portal opens.
4. Administrators can open **Settings → User Accounts** to create new users
   and assign roles. New accounts can sign in immediately.
5. Opening a portal while signed out redirects back to the login page.

### Demo Accounts

| Role          | Email                    | Password       |
| ------------- | ------------------------ | -------------- |
| Administrator | `admin@kct.edu.np`       | `Admin@2025`   |
| Teacher       | `priya.mehta@kct.edu.np` | `Teacher@2025` |
| Student       | `aryan.k@kct.edu.np`     | `Student@2025` |

Accounts and attendance settings are stored in the browser via `localStorage`.
The demo accounts are restored automatically whenever the account list is
empty, so an administrator can always sign in. The attendance threshold is
shared through the same store, so warnings and at-risk lists stay in sync
across every portal. Passwords are kept in plain text because this is a
frontend prototype; backend authentication with hashing is planned.

The administrator prototype includes dashboard metrics, program attendance
visualization, student and faculty directories, course cards, leave-request
approval, attendance settings (with the shared threshold), an academic
calendar, user accounts, and responsive mobile navigation. Its data is
currently demo data stored in JavaScript.

The student prototype includes attendance overview cards, subject percentages,
attendance records with search and status filtering, a weekly class schedule,
notifications, and a leave-request form. The teacher prototype includes class
metrics, subject averages, at-risk students, interactive attendance marking,
attendance reports, and leave-request approval. These portals currently use
demo data and browser-only state.

The portals currently run on demo data and browser-only accounts. A backend
will be needed for real authentication, shared attendance data, reports, and
role-based permissions.
