# AttendIQ Student Attendance System

AttendIQ is a frontend prototype for a student attendance management system. It
provides role-based login and a guided student account-registration flow for
students, teachers, and administrators.

## Features

- Role selection for student, teacher, and administrator login
- Student email-domain validation using `@student.tu.edu.np`
- Password visibility toggle
- Client-side validation for email and password requirements
- Three-step student registration form
- TU symbol number and student email validation
- Password confirmation during account creation
- Responsive styling for login and signup screens

## Project Structure

```text
.
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

1. Open `login/login.html` in a web browser, or serve the project directory
   with a local static web server.
2. Select the account role and test the login validation.
3. Use **Create an account** to try the multi-step signup flow.

The forms currently perform client-side validation only. A backend is required
for authentication, account persistence, and attendance data management.
