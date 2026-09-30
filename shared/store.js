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
  var OFFERINGS_KEY = "attendiq.offerings";
  var EVENTS_KEY = "attendiq.academic-events";
  var SCHEDULES_KEY = "attendiq.class-schedules";
  var DEMO_DATASET_VERSION = "tu-bachelors-150-v4";

  // TU requires 80% attendance per subject; administrators can adjust it.
  var DEFAULT_THRESHOLD = 80;

  // Student accounts use the college-issued email domain.
  var STUDENT_EMAIL_DOMAIN = "@kct.edu.np";

  // Roles the login redirect and the admin user manager understand.
  var ROLES = ["student", "teacher", "admin"];

  // Seeded accounts keep the system usable before an administrator signs in.
  // These demo credentials are intentionally visible only in explicit demo mode.
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

  var DEMO_SEMESTERS = Array.from({ length: 8 }, function (_, index) {
    var number = index + 1;
    return {
      id: "tu-sem-" + number,
      academic_year_id: "year-2026",
      name: "Semester " + number,
      number: number,
      is_current: true,
    };
  });

  var DEMO_OFFERINGS = [
    { id: "offering-csc419", subject_code: "CSC419", semester_id: "tu-sem-7", teacher_id: "u-teacher", status: "active" },
    { id: "offering-csc420", subject_code: "CSC420", semester_id: "tu-sem-7", teacher_id: "u-teacher", status: "active" },
    { id: "offering-csc421", subject_code: "CSC421", semester_id: "tu-sem-7", teacher_id: "u-teacher", status: "active" },
    { id: "offering-csc422", subject_code: "CSC422", semester_id: "tu-sem-7", teacher_id: "u-teacher", status: "active" },
    { id: "offering-csc425", subject_code: "CSC425", semester_id: "tu-sem-7", teacher_id: "u-teacher", status: "active" },
  ];

  var DEMO_ACADEMIC_YEARS = [
    { id: "year-2026", name: "2026", start_date: "2026-01-01", end_date: "2026-12-31", is_current: true },
  ];

  var DEMO_EVENTS = [
    { id: "event-1", academic_year_id: "year-2026", semester_id: "tu-sem-7", title: "Semester 7 begins", event_type: "semester", start_date: "2026-06-01", end_date: "2026-06-01", description: "Classes begin", status: "active" },
    { id: "event-2", academic_year_id: "year-2026", semester_id: "tu-sem-7", title: "Mid-semester break", event_type: "holiday", start_date: "2026-08-10", end_date: "2026-08-16", description: "College holiday", status: "active" },
  ];

  var DEMO_SCHEDULES = [
    { id: "schedule-1", course_offering_id: "offering-csc419", day_of_week: 1, start_time: "09:00", end_time: "10:00", room: "A-201", status: "active" },
    { id: "schedule-2", course_offering_id: "offering-csc420", day_of_week: 2, start_time: "10:15", end_time: "11:15", room: "A-202", status: "active" },
  ];

  function ensureDemoAcademicDataset() {
    if (root.AttendIQDemoMode !== true) return;
    var marker = read("attendiq.demo-dataset-version", "");
    if (marker === DEMO_DATASET_VERSION) return;

    var users = getUsers();
    var faculty = read(FACULTY_KEY, null) || DEMO_FACULTY.map(function (member) { return Object.assign({}, member); });
    var subjects = read(SUBJECTS_KEY, null) || DEMO_SUBJECTS.map(function (subject) { return Object.assign({}, subject); });
    var semesters = read("attendiq.semesters", null) || DEMO_SEMESTERS.map(function (semester) { return Object.assign({}, semester); });
    var offerings = read(OFFERINGS_KEY, null) || DEMO_OFFERINGS.map(function (offering) { return Object.assign({}, offering); });
    var schedules = read(SCHEDULES_KEY, null) || DEMO_SCHEDULES.map(function (schedule) { return Object.assign({}, schedule); });

    users.forEach(function (user) {
      if (user.role === "student") {
        delete user.section;
        delete user.section_id;
      }
    });
    offerings.forEach(function (offering) {
      delete offering.section_id;
      var legacySemester = /^sem-(\d+)$/.exec(String(offering.semester_id || ""));
      if (legacySemester) offering.semester_id = "tu-sem-" + legacySemester[1];
      var semester = semesters.find(function (item) { return item.id === offering.semester_id; });
      if (semester && String(offering.id || "").indexOf("tu-offering-") === 0) {
        offering.status = "active";
      }
    });
    semesters = semesters.filter(function (semester) {
      return !/^sem-\d+$/.test(String(semester.id || ""));
    });
    schedules.forEach(function (schedule) {
      var offering = offerings.find(function (item) { return item.id === schedule.course_offering_id; });
      if (offering && offering.status === "archived" && String(schedule.id || "").indexOf("tu-schedule-") === 0) {
        schedule.status = "archived";
      }
    });
    var programs = [
      { code: "CSIT", name: "BSc CSIT", semesters: 8, subjects: ["Programming Fundamentals", "Data Structures", "Computer Architecture", "Database Management"] },
      { code: "BCA", name: "BCA", semesters: 8, subjects: ["Computer Fundamentals", "Web Technology", "Software Engineering", "Object Oriented Programming"] },
      { code: "BBS", name: "BBS", semesters: 4, subjects: ["Business English", "Financial Accounting", "Business Mathematics", "Principles of Management"] },
    ];
    var teachers = [
      ["Dr. Suman Adhikari", "Computer Science", "Associate Professor"],
      ["Ms. Nisha Karki", "Computer Science", "Assistant Professor"],
      ["Mr. Ramesh Shrestha", "Management", "Lecturer"],
      ["Dr. Anil Poudel", "Computer Science", "Associate Professor"],
      ["Ms. Kabita Thapa", "Management", "Assistant Professor"],
      ["Mr. Deepak Gurung", "Computer Science", "Lecturer"],
      ["Dr. Sunita Joshi", "Management", "Associate Professor"],
      ["Mr. Bikash Rai", "Computer Science", "Lecturer"],
      ["Ms. Asha Bhandari", "Management", "Assistant Professor"],
      ["Dr. Manoj KC", "Computer Science", "Associate Professor"],
    ];
    var studentFirstNames = [
      "Aashish", "Aastha", "Anil", "Anisha", "Bikash", "Binita",
      "Bishal", "Deepak", "Gita", "Hari", "Kabita", "Kiran",
      "Krishna", "Manisha", "Milan", "Nabin", "Nisha", "Prakash",
      "Rabin", "Rachana", "Rajesh", "Ramesh", "Roshan", "Sabina",
      "Sagar", "Samir", "Sandhya", "Sanjay", "Sarita", "Saugat",
      "Sharmila", "Shreya", "Sita", "Sunil", "Suraj", "Sushil",
      "Ujjwal", "Usha", "Bibek", "Pooja",
    ];
    var studentLastNames = [
      "Adhikari", "Bhandari", "Dahal", "Gautam", "Ghimire",
      "Gurung", "Karki", "KC", "Khadka", "Lama", "Magar",
      "Poudel", "Rai", "Regmi", "Sharma", "Shrestha", "Thapa",
      "Tamang", "Tiwari", "Yadav",
    ];

    for (var semesterNumber = 1; semesterNumber <= 8; semesterNumber += 1) {
      var semesterId = "tu-sem-" + semesterNumber;
      if (!semesters.some(function (semester) { return semester.id === semesterId; })) {
        semesters.push({ id: semesterId, academic_year_id: "year-2026", name: "Semester " + semesterNumber, number: semesterNumber, is_current: true });
      }
    }
    semesters.forEach(function (semester) {
      if (String(semester.id || "").indexOf("tu-sem-") === 0) {
        semester.academic_year_id = "year-2026";
        semester.is_current = true;
      }
    });
    teachers.forEach(function (teacher, index) {
      var teacherId = "u-demo-teacher-" + (index + 1);
      if (!users.some(function (user) { return user.id === teacherId; })) {
        users.push({
          id: teacherId,
          name: teacher[0],
          email: "teacher" + (index + 1) + "@kct.edu.np",
          password: "Teacher@" + (index + 1) + "Demo",
          role: "teacher",
          program: teacher[1],
        });
        faculty.push({
          id: "faculty-demo-" + (index + 3),
          profile_id: teacherId,
          faculty_id: "TU-FAC-" + String(index + 1).padStart(3, "0"),
          name: teacher[0],
          email: "teacher" + (index + 1) + "@kct.edu.np",
          department: teacher[1],
          program: teacher[1],
          designation: teacher[2],
          status: "active",
        });
      }
    });

    var subjectIndex = 0;
    programs.forEach(function (program) {
      for (var sem = 1; sem <= program.semesters; sem += 1) {
        var semesterId = "tu-sem-" + sem;
        program.subjects.forEach(function (subjectName, subjectOffset) {
          var code = program.code + String(sem).padStart(2, "0") + String(subjectOffset + 1).padStart(2, "0");
          if (!subjects.some(function (subject) { return subject.code === code; })) {
            subjects.push({ code: code, name: subjectName + " " + sem, semester: sem, program: program.name, credits: subjectOffset === 0 ? 4 : 3, course_type: "theory", active: true, archived_at: null });
          }
          var offeringId = "tu-offering-" + code.toLowerCase();
          if (!offerings.some(function (offering) { return offering.id === offeringId; })) {
            var status = "active";
            offerings.push({ id: offeringId, subject_code: code, semester_id: semesterId, teacher_id: "u-demo-teacher-" + ((subjectIndex % teachers.length) + 1), status: status });
            schedules.push({ id: "tu-schedule-" + code.toLowerCase(), course_offering_id: offeringId, day_of_week: ((subjectIndex % 6) + 1), start_time: (8 + (subjectIndex % 5)) + ":00", end_time: (9 + (subjectIndex % 5)) + ":00", room: program.code + "-" + (101 + (subjectIndex % 10)), status: status });
          }
          subjectIndex += 1;
        });
      }
    });

    var studentNumber = 0;
    for (var i = 0; i < 150; i += 1) {
      var program = programs[i % programs.length];
      var semester = (i % program.semesters) + 1;
      var studentId = "u-tu-student-" + String(i + 1).padStart(3, "0");
      if (!users.some(function (user) { return user.id === studentId; })) {
        studentNumber += 1;
        users.push({
          id: studentId,
          name: studentFirstNames[i % studentFirstNames.length] + " " +
            studentLastNames[Math.floor(i / studentFirstNames.length) % studentLastNames.length],
          email: "student" + String(i + 1).padStart(3, "0") + "@kct.edu.np",
          password: "Student@" + String(i + 1).padStart(3, "0") + "Demo",
          role: "student",
          roll: "TU-" + program.code + "-" + String(i + 1).padStart(3, "0"),
          program: program.name,
          batch: "208" + (2 - Math.floor((semester - 1) / 2)),
        });
      }
    }
    write(USERS_KEY, users);
    write(FACULTY_KEY, faculty);
    write(SUBJECTS_KEY, subjects);
    write("attendiq.semesters", semesters);
    write(OFFERINGS_KEY, offerings);
    write(SCHEDULES_KEY, schedules);
    write("attendiq.demo-dataset-version", DEMO_DATASET_VERSION);
  }

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

  function getStudents() {
    ensureDemoAcademicDataset();
    return getUsers().filter(function (user) {
      return user.role === "student" && user.active !== false;
    }).map(function (user) {
      return {
        id: user.id,
        profile_id: user.id,
        roll: user.roll || "—",
        name: user.name,
        email: user.email,
        program: user.program || "BSc CSIT",
        batch: user.batch || "2079",
        semester: Number(user.semester) || 1,
        active: true,
        archived_at: null,
      };
    });
  }

  function updateStudent(input) {
    var value = input || {};
    var users = getUsers();
    var user = users.find(function (item) { return item.id === value.id && item.role === "student"; });
    if (!user) return { ok: false, error: "Student record not found." };
    user.name = String(value.name || "").trim();
    user.email = normalizeEmail(value.email);
    user.roll = String(value.roll || "").trim();
    user.program = String(value.program || "BSc CSIT").trim();
    user.batch = String(value.batch || "").trim();
    user.semester = Number(value.semester);
    if (!user.name || !user.email || !user.roll || !user.batch ||
        !Number.isInteger(user.semester) || user.semester < 1 || user.semester > 8) {
      return { ok: false, error: "Complete every student field and choose a semester from 1 to 8." };
    }
    if (!write(USERS_KEY, users)) return { ok: false, error: "Browser storage is unavailable, so the student was not updated." };
    return { ok: true, student: user };
  }

  function getFacultyRecords() {
    ensureDemoAcademicDataset();
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
    ensureDemoAcademicDataset();
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
    ensureDemoAcademicDataset();
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
    var created = { id: "event-" + Date.now().toString(36), academic_year_id: event.academic_year_id || "year-2026", semester_id: event.semester_id || "tu-sem-7", title: event.title.trim(), event_type: event.event_type || "college_event", start_date: event.start_date, end_date: event.end_date, description: String(event.description || "").trim(), status: "active" };
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
    var offering = getOfferings(true).find(function (item) { return item.id === schedule.course_offering_id && item.status !== "archived"; });
    if (!offering) return { ok: false, error: "Choose an active course offering before creating a class schedule." };
    var semester = getSemesters().find(function (item) { return item.id === offering.semester_id && item.is_current; });
    if (!semester) return { ok: false, error: "Choose an active course offering in the current semester." };
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
    var years = DEMO_ACADEMIC_YEARS.map(function (year) { return Object.assign({}, year); });
    var semesters = read("attendiq.semesters", null) || DEMO_SEMESTERS;
    var generatedYears = {};
    semesters.forEach(function (semester) {
      var match = /^year-(\d{4})$/.exec(String(semester.academic_year_id || ""));
      if (!match) return;
      var yearNumber = Number(match[1]);
      if (!generatedYears[yearNumber]) {
        generatedYears[yearNumber] = {
          id: semester.academic_year_id,
          name: String(yearNumber),
          start_date: yearNumber + "-01-01",
          end_date: yearNumber + "-12-31",
          is_current: false,
        };
      }
      if (semester.is_current) {
        years.forEach(function (year) { year.is_current = false; });
        generatedYears[yearNumber].is_current = true;
      }
    });
    Object.keys(generatedYears).forEach(function (yearNumber) {
      var generated = generatedYears[yearNumber];
      var existing = years.find(function (year) { return year.id === generated.id; });
      if (existing) existing.is_current = generated.is_current;
      else years.push(generated);
    });
    return years;
  }

  function getSemesters() {
    ensureDemoAcademicDataset();
    var semesters = read("attendiq.semesters", null) || DEMO_SEMESTERS;
    return semesters.map(function (semester) { return Object.assign({}, semester); })
      .sort(function (left, right) {
        return Number(left.number) - Number(right.number);
      });
  }

  function setCurrentSemester(year, semesterNumber) {
    var yearNumber = Number(year);
    var number = Number(semesterNumber);
    if (!Number.isInteger(yearNumber) || yearNumber < 2020 || yearNumber > 9999 ||
        !Number.isInteger(number) || number < 1 || number > 8) {
      return { ok: false, error: "Choose a year from 2020 onward and a semester from 1 to 8." };
    }
    var semesters = read("attendiq.semesters", null) || DEMO_SEMESTERS.map(function (semester) {
      return Object.assign({}, semester);
    });
    semesters.forEach(function (semester) { semester.is_current = false; });
    var selected;
    for (var index = 1; index <= 8; index += 1) {
      var yearSemester = semesters.find(function (item) {
        return item.number === index && item.academic_year_id === "year-" + yearNumber;
      });
      if (!yearSemester) {
        yearSemester = {
          id: "sem-" + yearNumber + "-" + index,
          academic_year_id: "year-" + yearNumber,
          name: "Semester " + index,
          number: index,
          start_date: yearNumber + "-01-01",
          end_date: yearNumber + "-12-31",
          is_current: false,
        };
        semesters.push(yearSemester);
      }
      yearSemester.is_current = true;
      if (index === number) selected = yearSemester;
    }
    selected.is_current = true;
    if (!write("attendiq.semesters", semesters)) {
      return { ok: false, error: "Browser storage is unavailable, so the current semester was not changed." };
    }
    return { ok: true, semester: selected };
  }


  function getOfferings(includeArchived) {
    ensureDemoAcademicDataset();
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
    if (!offering.subject_code || !offering.semester_id || !offering.teacher_id) {
      return "Subject, semester, and teacher are required.";
    }
    if (!getSubjectRecords().some(function (subject) { return subject.code === offering.subject_code && subject.active !== false; })) {
      return "Choose an active subject.";
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
    var semester = getSemesters().find(function (item) {
      return item.id === offering.semester_id && item.is_current;
    });
    var subject = getSubjectRecords().find(function (item) {
      return item.code === offering.subject_code;
    });
    if (!semester || !subject || subject.semester !== semester.number) {
      return { ok: false, error: "Choose an active subject in the college's current semester." };
    }
    var offerings = getOfferings(true);
    if (offerings.some(function (item) { return item.subject_code === offering.subject_code && item.semester_id === offering.semester_id && item.status !== "archived"; })) {
      return { ok: false, error: "That subject already has an offering in this semester." };
    }
    var created = {
      id: "offering-" + Date.now().toString(36),
      subject_code: offering.subject_code,
      semester_id: offering.semester_id,
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
    var error = validateOffering({ subject_code: offering.subject_code || current.subject_code, semester_id: offering.semester_id || current.semester_id, teacher_id: offering.teacher_id || current.teacher_id });
    if (error) return { ok: false, error: error };
    if (offering.status !== "archived") {
      var semester = getSemesters().find(function (item) {
        return item.id === current.semester_id && item.is_current;
      });
      var subject = getSubjectRecords().find(function (item) {
        return item.code === current.subject_code && item.active !== false;
      });
      if (!semester || !subject || subject.semester !== semester.number) {
        return { ok: false, error: "Only offerings in the college's current semester can be active." };
      }
    }
    if (offerings.some(function (item) { return item.id !== current.id && item.subject_code === current.subject_code && item.semester_id === current.semester_id && item.status !== "archived" && offering.status !== "archived"; })) {
      return { ok: false, error: "That subject already has an offering in this semester." };
    }
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
    var semester = Number(input.semester);
    if (role === "student" && (!Number.isInteger(semester) || semester < 1 || semester > 8))
      return "Choose a semester from 1 to 8.";
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
      roll: String(input.roll || "").trim(),
      program: String(input.program || "BSc CSIT").trim(),
      batch: String(input.batch || "").trim(),
      semester: input.role === "student" ? Number(input.semester) : undefined,
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
    getStudents: getStudents,
    updateStudent: updateStudent,
    getFaculty: getFaculty,
    updateFaculty: updateFaculty,
    archiveFaculty: archiveFaculty,
    getSubjects: getSubjects,
    createSubject: createSubject,
    updateSubject: updateSubject,
    archiveSubject: archiveSubject,
    getAcademicYears: getAcademicYears,
    getSemesters: getSemesters,
    setCurrentSemester: setCurrentSemester,
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
