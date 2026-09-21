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

- Role selection for student, teacher, and administrator login
- Student email-domain validation using `@student.tu.edu.np`
- Password visibility toggle
- Client-side validation for email and password requirements
- Three-step student registration form
- TU symbol number and student email validation
- Password confirmation during account creation
- Responsive styling for login and signup screens

## Planned Frontend Work

The login and signup flows are the foundation. The next frontend iterations
will add the authenticated application shell and role-specific screens:

1. Build reusable layout, navigation, card, table, badge, modal, and form
   patterns in HTML/CSS/JavaScript.
2. Add the student dashboard, attendance log, schedule, notifications, and
   leave-request views.
3. Add teacher attendance marking, reports, at-risk student views, and leave
   approvals.
4. Add administrator management screens for students, teachers, courses,
   leaves, and settings.
5. Replace demo data with backend/API integration after the frontend flows are
   stable.

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
├── login/
│   ├── login.html
│   ├── login.css
│   └── login.js
├── signup/
│   ├── signup.html
│   ├── signup.css
│   └── signup.js
└── .vscode/
    └── settings.json
```

## Running the Project

This is a static frontend and does not require a build step or package
installation.

1. Open `landing page/landing.html` in a web browser to view the public
   landing page.
2. Open `admin panel/admin.html` to view the administrator portal prototype.
3. Use a portal button to open `login/login.html`.
4. Select the account role and test the login validation.
5. Use **Create an account** to try the multi-step signup flow.

The administrator prototype includes dashboard metrics, department attendance
visualization, student and faculty directories, course cards, leave-request
approval, attendance settings, an academic calendar, and responsive mobile
navigation. Its data is currently demo data stored in JavaScript.

The forms currently perform client-side validation only. A backend will be
needed for authentication, account persistence, attendance data, reports, and
role-based permissions.
