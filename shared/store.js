// Shared account and session store for AttendIQ.
// Administrators create accounts in the admin portal; the login page and every
// portal read the same records from this module. Data is kept in localStorage
// so the frontend works without a backend yet.
(function (root) {
  "use strict";

  var USERS_KEY = "attendiq.users";
  var SESSION_KEY = "attendiq.session";
  var SETTINGS_KEY = "attendiq.settings";

  // TU requires 80% attendance per subject; administrators can adjust it.
  var DEFAULT_THRESHOLD = 80;

  // Student accounts use the college-issued email domain.
  var STUDENT_EMAIL_DOMAIN = "@kct.edu.np";

  // Roles the login redirect and the admin user manager understand.
  var ROLES = ["student", "teacher", "admin"];

  // Seeded accounts keep the system usable before an administrator signs in.
  var SEED_USERS = [
    {
      id: "u-admin",
      name: "System Administrator",
      email: "admin@kct.edu.np",
      password: "Admin@2025",
      role: "admin",
    },
    {
      id: "u-teacher",
      name: "Dr. Priya Mehta",
      email: "priya.mehta@kct.edu.np",
      password: "Teacher@2025",
      role: "teacher",
    },
    {
      id: "u-student",
      name: "Aryan Kumar",
      email: "aryan.k@kct.edu.np",
      password: "Student@2025",
      role: "student",
    },
  ];

  // Portal locations used after login; every page sits one folder deep.
  var ROLE_PANELS = {
    student: "student panel/student.html",
    teacher: "teacher panel/teacher.html",
    admin: "admin panel/admin.html",
  };

  // localStorage can be unavailable (private mode, blocked storage), so every
  // read and write is guarded and reports failure instead of crashing.
  function read(key, fallback) {
    try {
      var raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  // The user list is seeded whenever it is missing or empty, which also acts
  // as a safeguard: an administrator can never lock everyone out for good.
  function getUsers() {
    var users = read(USERS_KEY, null);
    if (!Array.isArray(users) || !users.length) {
      users = SEED_USERS.map(function (seed) {
        return Object.assign({}, seed);
      });
      write(USERS_KEY, users);
    }
    return users;
  }

  // Emails are compared case-insensitively across the whole store.
  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  // Look up a single account by email, ignoring case and stray spaces.
  function findUserByEmail(email) {
    var target = normalizeEmail(email);
    return (
      getUsers().find(function (user) {
        return normalizeEmail(user.email) === target;
      }) || null
    );
  }

  // Creation rules shared by the admin form and any future caller.
  function validateUser(input) {
    var name = String(input.name || "").trim();
    var email = normalizeEmail(input.email);
    var password = String(input.password || "");
    var role = String(input.role || "");

    if (!name) return "Enter the user's full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return "Enter a valid email address.";
    if (ROLES.indexOf(role) === -1) return "Choose a valid role.";
    if (role === "student" && !email.endsWith(STUDENT_EMAIL_DOMAIN))
      return "Student accounts must use an " + STUDENT_EMAIL_DOMAIN + " email.";
    if (findUserByEmail(email))
      return "An account with this email already exists.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    )
      return "Password must include uppercase, lowercase, number, and symbol.";
    return "";
  }

  // Create a validated account; ids combine the time and a random suffix so
  // accounts created in the same millisecond still stay unique.
  function addUser(input) {
    var error = validateUser(input);
    if (error) return { ok: false, error: error };

    var users = getUsers();
    var user = {
      id:
        "u-" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 6),
      name: String(input.name).trim(),
      email: normalizeEmail(input.email),
      password: String(input.password),
      role: input.role,
    };
    users.push(user);

    if (!write(USERS_KEY, users))
      return {
        ok: false,
        error: "Browser storage is unavailable, so the account was not saved.",
      };
    return { ok: true, user: user };
  }

  // Assigning a role also keeps an open session in sync when the edited
  // account belongs to the signed-in administrator.
  function assignRole(id, role) {
    if (ROLES.indexOf(role) === -1)
      return { ok: false, error: "Choose a valid role." };

    var users = getUsers();
    var user = users.find(function (item) {
      return item.id === id;
    });
    if (!user) return { ok: false, error: "Account not found." };
    if (role === "student" && !user.email.endsWith(STUDENT_EMAIL_DOMAIN))
      return {
        ok: false,
        error:
          "Student accounts must use an " + STUDENT_EMAIL_DOMAIN + " email.",
      };

    user.role = role;
    if (!write(USERS_KEY, users))
      return {
        ok: false,
        error: "Browser storage is unavailable, so the role was not saved.",
      };

    var session = getSession();
    if (session && session.id === user.id) {
      session.role = role;
      write(SESSION_KEY, session);
    }
    return { ok: true, user: user };
  }

  // Delete an account by id and report when the id is not on the list.
  function removeUser(id) {
    var users = getUsers();
    var remaining = users.filter(function (user) {
      return user.id !== id;
    });
    if (remaining.length === users.length)
      return { ok: false, error: "Account not found." };
    if (!write(USERS_KEY, remaining))
      return {
        ok: false,
        error: "Browser storage is unavailable, so the account was not removed.",
      };
    return { ok: true };
  }

  // Match an email and password pair against the stored accounts.
  function authenticate(email, password) {
    var user = findUserByEmail(email);
    if (!user || user.password !== String(password)) return null;
    return user;
  }

  // Sessions keep only display data; passwords are never stored in a session.
  function setSession(user) {
    return write(SESSION_KEY, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }

  // Return the stored session only when it still looks complete and valid.
  function getSession() {
    var session = read(SESSION_KEY, null);
    if (!session || !session.id || ROLES.indexOf(session.role) === -1)
      return null;
    return session;
  }

  // Sign-out helper: forgets the session without touching the accounts.
  function clearSession() {
    try {
      root.localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* Storage unavailable: there is nothing to clear. */
    }
  }

  // Attendance settings are shared by every portal; administrators control
  // the threshold here and each panel reads the same value.
  function getSettings() {
    var stored = read(SETTINGS_KEY, null);
    var threshold = stored ? Number(stored.threshold) : NaN;
    if (!isFinite(threshold) || threshold < 40 || threshold > 100)
      threshold = DEFAULT_THRESHOLD;
    return { threshold: threshold };
  }

  // Persist a settings change such as the attendance threshold.
  function saveSettings(patch) {
    var merged = Object.assign(getSettings(), patch || {});
    var threshold = Number(merged.threshold);
    if (!isFinite(threshold) || threshold < 40 || threshold > 100)
      return {
        ok: false,
        error: "Attendance threshold must be between 40 and 100.",
      };
    if (!write(SETTINGS_KEY, { threshold: threshold }))
      return {
        ok: false,
        error: "Browser storage is unavailable, so the settings were not saved.",
      };
    return { ok: true, settings: { threshold: threshold } };
  }

  var api = {
    ROLES: ROLES,
    ROLE_PANELS: ROLE_PANELS,
    SEED_USERS: SEED_USERS,
    DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
    STUDENT_EMAIL_DOMAIN: STUDENT_EMAIL_DOMAIN,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getUsers: getUsers,
    findUserByEmail: findUserByEmail,
    validateUser: validateUser,
    addUser: addUser,
    assignRole: assignRole,
    removeUser: removeUser,
    authenticate: authenticate,
    setSession: setSession,
    getSession: getSession,
    clearSession: clearSession,
  };

  root.AttendIQ = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
