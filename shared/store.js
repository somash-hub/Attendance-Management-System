// Shared account and session store for AttendIQ.
// Administrators create accounts in the admin portal; the login page and every
// portal read the same records from this module. Data is kept in localStorage
// so the frontend works without a backend yet.
(function (root) {
  "use strict";

  var USERS_KEY = "attendiq.users";
  var FACULTY_KEY = "attendiq.faculty";
  var SESSION_KEY = "attendiq.session";
  var SETTINGS_KEY = "attendiq.settings";
  var SUBJECTS_KEY = "attendiq.subjects";
  var SECTIONS_KEY = "attendiq.sections";
  var OFFERINGS_KEY = "attendiq.offerings";
  var EVENTS_KEY = "attendiq.academic-events";
  var SCHEDULES_KEY = "attendiq.class-schedules";

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

  var DEMO_FACULTY = [
    {
      id: "faculty-demo-1",
      profile_id: "u-teacher",
      faculty_id: "FAC001",
      name: "Dr. Priya Mehta",
      email: "priya.mehta@kct.edu.np",
      department: "BSc CSIT",
      program: "BSc CSIT",
      designation: "Senior Lecturer",
      status: "active",
    },
    {
      id: "faculty-demo-2",
      profile_id: null,
      faculty_id: "FAC002",
      name: "Prof. Arjun Sharma",
      email: "arjun.sharma@kct.edu.np",
      department: "BSc CSIT",
      program: "BSc CSIT",
      designation: "Lecturer",
      status: "active",
    },
  ];

  var DEMO_SUBJECTS = [
    { code: "CSC419", name: "Advanced Java Programming", semester: 7, program: "BSc CSIT", credits: 3, course_type: "theory", active: true, archived_at: null },
    { code: "CSC420", name: "Data Warehousing and Data Mining", semester: 7, program: "BSc CSIT", credits: 3, course_type: "theory", active: true, archived_at: null },
    { code: "CSC421", name: "Principles of Management", semester: 7, program: "BSc CSIT", credits: 3, course_type: "theory", active: true, archived_at: null },
    { code: "CSC422", name: "Project Work", semester: 7, program: "BSc CSIT", credits: 6, course_type: "project", active: true, archived_at: null },
    { code: "CSC425", name: "Software Project Management", semester: 7, program: "BSc CSIT", credits: 3, course_type: "theory", active: true, archived_at: null },
  ];

  var DEMO_SEMESTERS = [
    { id: "sem-7", name: "Semester 7", number: 7, is_current: true },
  ];

  var DEMO_SECTIONS = [
    { id: "section-a", academic_year_id: "year-2082", semester_id: "sem-7", program: "BSc CSIT", batch: "2079", name: "A", is_current: true },
  ];

  var DEMO_OFFERINGS = [
    { id: "offering-csc419", subject_code: "CSC419", semester_id: "sem-7", section_id: "section-a", teacher_id: "u-teacher", status: "active" },
    { id: "offering-csc420", subject_code: "CSC420", semester_id: "sem-7", section_id: "section-a", teacher_id: "u-teacher", status: "active" },
    { id: "offering-csc421", subject_code: "CSC421", semester_id: "sem-7", section_id: "section-a", teacher_id: "u-teacher", status: "active" },
    { id: "offering-csc422", subject_code: "CSC422", semester_id: "sem-7", section_id: "section-a", teacher_id: "u-teacher", status: "active" },
    { id: "offering-csc425", subject_code: "CSC425", semester_id: "sem-7", section_id: "section-a", teacher_id: "u-teacher", status: "active" },
  ];

  var DEMO_ACADEMIC_YEARS = [
    { id: "year-2082", name: "2082/83 BS", start_date: "2025-04-01", end_date: "2026-03-31", is_current: true },
  ];

  var DEMO_EVENTS = [
    { id: "event-1", academic_year_id: "year-2082", semester_id: "sem-7", title: "Semester 7 begins", event_type: "semester", start_date: "2025-06-01", end_date: "2025-06-01", description: "Classes begin", status: "active" },
    { id: "event-2", academic_year_id: "year-2082", semester_id: "sem-7", title: "Mid-semester break", event_type: "holiday", start_date: "2025-08-10", end_date: "2025-08-16", description: "College holiday", status: "active" },
  ];

  var DEMO_SCHEDULES = [
    { id: "schedule-1", course_offering_id: "offering-csc419", day_of_week: 1, start_time: "09:00", end_time: "10:00", room: "A-201", status: "active" },
    { id: "schedule-2", course_offering_id: "offering-csc420", day_of_week: 2, start_time: "10:15", end_time: "11:15", room: "A-202", status: "active" },
  ];

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

  // Older versions of the store shipped different demo emails. Whenever a
  // stored account carries a seed id, refresh it to the current seed details
  // so the documented demo logins keep working; accounts created by an
  // administrator use their own ids and are never touched. A seed email that
  // is already used by another account is left alone to avoid duplicates.
  function syncSeedUsers(users) {
    var changed = false;
    SEED_USERS.forEach(function (seed) {
      var stored = users.find(function (user) {
        return user.id === seed.id;
      });
      if (!stored) return;
      var taken = users.some(function (user) {
        return (
          user.id !== stored.id &&
          normalizeEmail(user.email) === normalizeEmail(seed.email)
        );
      });
      if (taken) return;
      if (
        stored.name !== seed.name ||
        stored.email !== seed.email ||
        stored.password !== seed.password ||
        stored.role !== seed.role
      ) {
        stored.name = seed.name;
        stored.email = seed.email;
        stored.password = seed.password;
        stored.role = seed.role;
        changed = true;
      }
    });
    return changed;
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
      return users;
    }
    // Keep stored copies of the demo accounts aligned with the seed data.
    if (syncSeedUsers(users)) write(USERS_KEY, users);
    return users;
  }

  function getFacultyRecords() {
    var faculty = read(FACULTY_KEY, null);
    if (!Array.isArray(faculty)) {
      faculty = DEMO_FACULTY.map(function (member) {
        return Object.assign({}, member);
      });
      write(FACULTY_KEY, faculty);
    }
    return faculty;
  }

  function getFaculty() {
    return getFacultyRecords().filter(function (member) {
      return member.status !== "archived";
    });
  }

  function updateFaculty(input) {
    var value = input || {};
    var faculty = getFacultyRecords();
    var member = faculty.find(function (item) { return item.id === value.id; });
    if (!member) return { ok: false, error: "Faculty record not found." };
    var updated = {
      id: member.id,
      profile_id: member.profile_id || null,
      faculty_id: String(value.faculty_id || member.faculty_id).trim(),
      name: String(value.name || member.name).trim(),
      email: String(value.email || member.email || "").trim().toLowerCase(),
      department: String(value.department || member.department).trim(),
      program: String(value.program || member.program).trim(),
      designation: String(value.designation || member.designation || "").trim(),
      status: value.status === "on_leave" ? "on_leave" : "active",
      archived_at: null,
    };
    if (!updated.faculty_id || !updated.name || !updated.email || !updated.department || !updated.program) {
      return { ok: false, error: "Complete every faculty field before saving." };
    }
    var duplicate = faculty.some(function (item) {
      return item.id !== updated.id && item.faculty_id.toLowerCase() === updated.faculty_id.toLowerCase();
    });
    if (duplicate) return { ok: false, error: "That faculty ID is already in use." };
    faculty[faculty.indexOf(member)] = updated;
    if (!write(FACULTY_KEY, faculty)) {
      return { ok: false, error: "Browser storage is unavailable, so the faculty record was not updated." };
    }
    return { ok: true, faculty: updated };
  }

  function archiveFaculty(id) {
    var faculty = getFacultyRecords();
    var member = faculty.find(function (item) { return item.id === id; });
    if (!member) return { ok: false, error: "Faculty record not found." };
    member.status = "archived";
    member.archived_at = new Date().toISOString();
    if (!write(FACULTY_KEY, faculty)) {
      return { ok: false, error: "Browser storage is unavailable, so the faculty record was not archived." };
    }
    return { ok: true, faculty: member };
  }

  function getSubjectRecords() {
    var subjects = read(SUBJECTS_KEY, null);
    if (!Array.isArray(subjects)) {
      subjects = DEMO_SUBJECTS.map(function (subject) {
        return Object.assign({}, subject);
      });
      write(SUBJECTS_KEY, subjects);
    }
    return subjects;
  }

  function getSubjects(includeArchived) {
    return getSubjectRecords().filter(function (subject) {
      return includeArchived === true || subject.active !== false;
    });
  }

  function validateSubject(value) {
    var subject = value || {};
    var code = String(subject.code || "").trim().toUpperCase();
    var name = String(subject.name || "").trim();
    var semester = Number(subject.semester);
    var program = String(subject.program || "").trim();
    var credits = Number(subject.credits);
    var type = String(subject.course_type || "theory").trim().toLowerCase();
    if (!/^[A-Z]{2,4}[0-9]{3,4}$/.test(code)) return "Subject code must contain 2–4 letters followed by 3–4 numbers.";
    if (!name || !program) return "Subject name and program are required.";
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) return "Semester must be between 1 and 8.";
    if (!Number.isFinite(credits) || credits <= 0 || credits > 30) return "Credits must be greater than 0 and no more than 30.";
    if (["theory", "lab", "project"].indexOf(type) === -1) return "Choose theory, lab, or project as the course type.";
    return "";
  }

  function createSubject(value) {
    var subject = value || {};
    var error = validateSubject(subject);
    if (error) return { ok: false, error: error };
    var subjects = getSubjectRecords();
    var code = String(subject.code).trim().toUpperCase();
    if (subjects.some(function (item) { return item.code === code; })) {
      return { ok: false, error: "That subject code already exists." };
    }
    var created = {
      code: code,
      name: String(subject.name).trim(),
      semester: Number(subject.semester),
      program: String(subject.program).trim(),
      credits: Number(subject.credits),
      course_type: String(subject.course_type || "theory").trim().toLowerCase(),
      active: true,
      archived_at: null,
    };
    subjects.push(created);
    if (!write(SUBJECTS_KEY, subjects)) return { ok: false, error: "Browser storage is unavailable, so the subject was not saved." };
    return { ok: true, subject: created };
  }

  function updateSubject(value) {
    var subject = value || {};
    var error = validateSubject(subject);
    if (error) return { ok: false, error: error };
    var subjects = getSubjectRecords();
    var code = String(subject.code).trim().toUpperCase();
    var index = subjects.findIndex(function (item) { return item.code === code; });
    if (index === -1) return { ok: false, error: "Subject not found." };
    var updated = Object.assign({}, subjects[index], {
      name: String(subject.name).trim(),
      semester: Number(subject.semester),
      program: String(subject.program).trim(),
      credits: Number(subject.credits),
      course_type: String(subject.course_type || "theory").trim().toLowerCase(),
      active: subject.active !== false,
      archived_at: subject.active === false ? subjects[index].archived_at || new Date().toISOString() : null,
    });
    subjects[index] = updated;
    if (!write(SUBJECTS_KEY, subjects)) return { ok: false, error: "Browser storage is unavailable, so the subject was not updated." };
    return { ok: true, subject: updated };
  }

  function archiveSubject(code) {
    var subjects = getSubjectRecords();
    var subject = subjects.find(function (item) { return item.code === String(code || "").trim().toUpperCase(); });
    if (!subject) return { ok: false, error: "Subject not found." };
    subject.active = false;
    subject.archived_at = subject.archived_at || new Date().toISOString();
    if (!write(SUBJECTS_KEY, subjects)) return { ok: false, error: "Browser storage is unavailable, so the subject was not archived." };
    return { ok: true, subject: subject };
  }

  function getAcademicEvents(includeArchived) {
    var events = read(EVENTS_KEY, null);
    if (!Array.isArray(events)) {
      events = DEMO_EVENTS.map(function (event) { return Object.assign({}, event); });
      write(EVENTS_KEY, events);
    }
    return events.filter(function (event) { return includeArchived === true || event.status !== "archived"; });
  }

  function getClassSchedules(includeArchived) {
    var schedules = read(SCHEDULES_KEY, null);
    if (!Array.isArray(schedules)) {
      schedules = DEMO_SCHEDULES.map(function (schedule) { return Object.assign({}, schedule); });
      write(SCHEDULES_KEY, schedules);
    }
    return schedules.filter(function (schedule) { return includeArchived === true || schedule.status !== "archived"; });
  }

  function createAcademicEvent(value) {
    var event = value || {};
    if (!event.title || !event.start_date || !event.end_date || event.end_date < event.start_date) return { ok: false, error: "Complete the event title and valid date range." };
    var events = getAcademicEvents(true);
    var created = { id: "event-" + Date.now().toString(36), academic_year_id: event.academic_year_id || "year-2082", semester_id: event.semester_id || "sem-7", title: event.title.trim(), event_type: event.event_type || "college_event", start_date: event.start_date, end_date: event.end_date, description: String(event.description || "").trim(), status: "active" };
    events.push(created);
    if (!write(EVENTS_KEY, events)) return { ok: false, error: "Browser storage is unavailable, so the academic event was not saved." };
    return { ok: true, event: created };
  }

  function updateAcademicEvent(value) {
    var event = value || {};
    var events = getAcademicEvents(true);
    var current = events.find(function (item) { return item.id === event.id; });
    if (!current) return { ok: false, error: "Academic event not found." };
    if (!event.title || !event.start_date || !event.end_date || event.end_date < event.start_date) return { ok: false, error: "Complete the event title and valid date range." };
    current.title = event.title.trim(); current.event_type = event.event_type || current.event_type; current.start_date = event.start_date; current.end_date = event.end_date; current.description = String(event.description || "").trim(); current.status = event.status === "archived" ? "archived" : "active";
    if (!write(EVENTS_KEY, events)) return { ok: false, error: "Browser storage is unavailable, so the academic event was not updated." };
    return { ok: true, event: current };
  }

  function archiveAcademicEvent(id) {
    var events = getAcademicEvents(true); var event = events.find(function (item) { return item.id === id; });
    if (!event) return { ok: false, error: "Academic event not found." };
    event.status = "archived";
    if (!write(EVENTS_KEY, events)) return { ok: false, error: "Browser storage is unavailable, so the academic event was not archived." };
    return { ok: true, event: event };
  }

  function createClassSchedule(value) {
    var schedule = value || {};
    if (!schedule.course_offering_id || schedule.day_of_week === "" || !schedule.start_time || !schedule.end_time || schedule.end_time <= schedule.start_time) return { ok: false, error: "Choose an active offering, weekday, and valid start/end times." };
    var schedules = getClassSchedules(true);
    var created = { id: "schedule-" + Date.now().toString(36), course_offering_id: schedule.course_offering_id, day_of_week: Number(schedule.day_of_week), start_time: schedule.start_time, end_time: schedule.end_time, room: String(schedule.room || "").trim(), status: "active" };
    schedules.push(created);
    if (!write(SCHEDULES_KEY, schedules)) return { ok: false, error: "Browser storage is unavailable, so the class schedule was not saved." };
    return { ok: true, schedule: created };
  }

  function updateClassSchedule(value) {
    var schedule = value || {};
    var schedules = getClassSchedules(true); var current = schedules.find(function (item) { return item.id === schedule.id; });
    if (!current) return { ok: false, error: "Class schedule not found." };
    if (schedule.end_time <= schedule.start_time) return { ok: false, error: "End time must be after start time." };
    current.day_of_week = Number(schedule.day_of_week); current.start_time = schedule.start_time; current.end_time = schedule.end_time; current.room = String(schedule.room || "").trim(); current.status = schedule.status === "archived" ? "archived" : "active";
    if (!write(SCHEDULES_KEY, schedules)) return { ok: false, error: "Browser storage is unavailable, so the class schedule was not updated." };
    return { ok: true, schedule: current };
  }

  function archiveClassSchedule(id) {
    var schedules = getClassSchedules(true); var schedule = schedules.find(function (item) { return item.id === id; });
    if (!schedule) return { ok: false, error: "Class schedule not found." };
    schedule.status = "archived";
    if (!write(SCHEDULES_KEY, schedules)) return { ok: false, error: "Browser storage is unavailable, so the class schedule was not archived." };
    return { ok: true, schedule: schedule };
  }

  function getAcademicYears() {
    return DEMO_ACADEMIC_YEARS.map(function (year) { return Object.assign({}, year); });
  }

  function getSemesters() {
    return DEMO_SEMESTERS.map(function (semester) { return Object.assign({}, semester); });
  }


  function getSections() {
    var sections = read(SECTIONS_KEY, null);
    if (!Array.isArray(sections)) {
      sections = DEMO_SECTIONS.map(function (section) { return Object.assign({}, section); });
      write(SECTIONS_KEY, sections);
    }
    return sections.filter(function (section) { return section.is_current !== false; });
  }

  function getOfferings(includeArchived) {
    var offerings = read(OFFERINGS_KEY, null);
    if (!Array.isArray(offerings)) {
      offerings = DEMO_OFFERINGS.map(function (offering) { return Object.assign({}, offering); });
      write(OFFERINGS_KEY, offerings);
    }
    return offerings.filter(function (offering) {
      return includeArchived === true || offering.status !== "archived";
    });
  }

  function validateOffering(value) {
    var offering = value || {};
    if (!offering.subject_code || !offering.semester_id || !offering.section_id || !offering.teacher_id) {
      return "Subject, semester, section, and teacher are required.";
    }
    if (!getSubjectRecords().some(function (subject) { return subject.code === offering.subject_code && subject.active !== false; })) {
      return "Choose an active subject.";
    }
    if (!getSections().some(function (section) { return section.id === offering.section_id && section.semester_id === offering.semester_id; })) {
      return "The selected section does not belong to the semester.";
    }
    if (!getFaculty().some(function (member) { return member.profile_id === offering.teacher_id; })) {
      return "Choose an active faculty account.";
    }
    return "";
  }

  function createOffering(value) {
    var offering = value || {};
    var error = validateOffering(offering);
    if (error) return { ok: false, error: error };
    var offerings = getOfferings(true);
    if (offerings.some(function (item) { return item.subject_code === offering.subject_code && item.semester_id === offering.semester_id && item.section_id === offering.section_id; })) {
      return { ok: false, error: "That subject is already assigned to this section." };
    }
    var created = {
      id: "offering-" + Date.now().toString(36),
      subject_code: offering.subject_code,
      semester_id: offering.semester_id,
      section_id: offering.section_id,
      teacher_id: offering.teacher_id,
      status: "active",
    };
    offerings.push(created);
    if (!write(OFFERINGS_KEY, offerings)) return { ok: false, error: "Browser storage is unavailable, so the course offering was not saved." };
    return { ok: true, offering: created };
  }

  function updateOffering(value) {
    var offering = value || {};
    if (!offering.id) return { ok: false, error: "Course offering is required." };
    var offerings = getOfferings(true);
    var current = offerings.find(function (item) { return item.id === offering.id; });
    if (!current) return { ok: false, error: "Course offering not found." };
    var error = validateOffering({ subject_code: offering.subject_code || current.subject_code, semester_id: offering.semester_id || current.semester_id, section_id: offering.section_id || current.section_id, teacher_id: offering.teacher_id || current.teacher_id });
    if (error) return { ok: false, error: error };
    current.teacher_id = offering.teacher_id || current.teacher_id;
    current.status = offering.status === "archived" ? "archived" : "active";
    if (!write(OFFERINGS_KEY, offerings)) return { ok: false, error: "Browser storage is unavailable, so the course offering was not updated." };
    return { ok: true, offering: current };
  }

  function archiveOffering(id) {
    var offerings = getOfferings(true);
    var offering = offerings.find(function (item) { return item.id === id; });
    if (!offering) return { ok: false, error: "Course offering not found." };
    offering.status = "archived";
    if (!write(OFFERINGS_KEY, offerings)) return { ok: false, error: "Browser storage is unavailable, so the course offering was not archived." };
    return { ok: true, offering: offering };
  }

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
    var faculty = null;
    if (input.role === "teacher") {
      var facultyRecords = getFacultyRecords();
      var facultyCode = String(input.faculty_id || "").trim();
      if (!facultyCode) {
        return { ok: false, error: "Enter the faculty ID." };
      }
      if (facultyRecords.some(function (item) {
        return item.faculty_id.toLowerCase() === facultyCode.toLowerCase();
      })) {
        return { ok: false, error: "That faculty ID is already in use." };
      }
      faculty = {
        id: "faculty-" + user.id,
        profile_id: user.id,
        faculty_id: facultyCode,
        name: user.name,
        email: user.email,
        department: String(input.department || input.program || "BSc CSIT").trim(),
        program: String(input.program || "BSc CSIT").trim(),
        designation: String(input.designation || "").trim(),
        status: "active",
        archived_at: null,
      };
      facultyRecords.push(faculty);
      if (!write(FACULTY_KEY, facultyRecords)) {
        return { ok: false, error: "Browser storage is unavailable, so the faculty record was not saved." };
      }
    }
    users.push(user);
    if (!write(USERS_KEY, users)) {
      if (faculty) {
        var rollback = getFacultyRecords().filter(function (item) { return item.id !== faculty.id; });
        write(FACULTY_KEY, rollback);
      }
      return {
        ok: false,
        error: "Browser storage is unavailable, so the account was not saved.",
      };
    }
    return { ok: true, user: user, faculty: faculty };
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
    getFaculty: getFaculty,
    updateFaculty: updateFaculty,
    archiveFaculty: archiveFaculty,
    getSubjects: getSubjects,
    createSubject: createSubject,
    updateSubject: updateSubject,
    archiveSubject: archiveSubject,
    getAcademicYears: getAcademicYears,
    getSemesters: getSemesters,
    getSections: getSections,
    getOfferings: getOfferings,
    createOffering: createOffering,
    updateOffering: updateOffering,
    archiveOffering: archiveOffering,
    getAcademicEvents: getAcademicEvents,
    createAcademicEvent: createAcademicEvent,
    updateAcademicEvent: updateAcademicEvent,
    archiveAcademicEvent: archiveAcademicEvent,
    getClassSchedules: getClassSchedules,
    createClassSchedule: createClassSchedule,
    updateClassSchedule: updateClassSchedule,
    archiveClassSchedule: archiveClassSchedule,
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
