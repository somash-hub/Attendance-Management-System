// Access control: wait for the verified Supabase profile before initializing.
const PORTAL_ROLE = "admin";
let activeAdminEmail = "";
AttendIQSupabase.getCurrentProfile().then(function (result) {
  if (!result.ok || !result.data) {
    location.replace("../login/login.html");
    return;
  }

  const session = result.data;
  if (session.role !== PORTAL_ROLE) {
    const destination = AttendIQ.ROLE_PANELS[session.role];
    location.replace(destination ? "../" + destination : "../login/login.html");
    return;
  }
  initializePortal(session);
});

function initializePortal(session) {
  activeAdminEmail = String(session.email || "").trim().toLowerCase();
  // Load the shared threshold from Supabase before rendering the portal.
  return AttendIQSupabase.getSettings().then(function (result) {
    if (!result.ok) {
      console.error("Could not load attendance settings:", result.error);
      return;
    }
    let settings = result.data;

// Demo records used by the administrator portal before backend integration.
let students = [
  {
    name: "Aryan Kumar",
    email: "aryan.k@kct.edu.np",
    roll: "2079CSIT042",
    dept: "BSc CSIT",
    attendance: 84,
  },
  {
    name: "Sneha Patel",
    email: "sneha.p@kct.edu.np",
    roll: "2079CSIT043",
    dept: "BSc CSIT",
    attendance: 91,
  },
  {
    name: "Riya Desai",
    email: "riya.d@kct.edu.np",
    roll: "2079CSIT044",
    dept: "BSc CSIT",
    attendance: 72,
  },
  {
    name: "Karan Singh",
    email: "karan.s@kct.edu.np",
    roll: "2079CSIT045",
    dept: "BSc CSIT",
    attendance: 68,
  },
  {
    name: "Pooja Iyer",
    email: "pooja.i@kct.edu.np",
    roll: "2079CSIT046",
    dept: "BSc CSIT",
    attendance: 88,
  },
  {
    name: "Ananya Nair",
    email: "ananya.n@kct.edu.np",
    roll: "2079CSIT048",
    dept: "BSc CSIT",
    attendance: 79,
  },
];

let faculty = [];

// Subject rows are loaded from Supabase in normal mode and from the explicit
// demo store when the portal is opened with ?demo=1.
let courses = [];
let offerings = [];
let currentSemesters = [];
let currentAcademicYears = [];
let academicEvents = [];
let classSchedules = [];

// Local fallback rows; replaced by Supabase leave rows after initialization.
let leaves = [
  {
    id: 1,
    name: "Aryan Kumar",
    roll: "2079CSIT042",
    type: "Medical",
    dates: "Ashadh 26 → 27, 2082",
    reason: "Fever and doctor visit",
    status: "pending",
    doc: true,
  },
  {
    id: 2,
    name: "Riya Desai",
    roll: "2079CSIT044",
    type: "Personal",
    dates: "Ashadh 25, 2082",
    reason: "Family function",
    status: "pending",
    doc: false,
  },
  {
    id: 3,
    name: "Dev Malhotra",
    roll: "2079CSIT047",
    type: "Medical",
    dates: "Ashadh 23 → 24, 2082",
    reason: "Hospital visit",
    status: "approved",
    doc: true,
  },
  {
    id: 4,
    name: "Karan Singh",
    roll: "2079CSIT045",
    type: "Personal",
    dates: "Ashadh 21, 2082",
    reason: "Personal emergency",
    status: "rejected",
    doc: false,
  },
];

let currentFilter = "all";

// Shared DOM helpers.
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const h = AttendIQUtils.escapeHtml;

function statusBadge(status) {
  const value = String(status || "Unknown");
  const slug = value.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return `<span class="status status-${h(slug)}">${h(value)}</span>`;
}

// Render the student, faculty, and course management views.
function renderStudents(query = "") {
  const normalized = query.toLowerCase();
  const programFilter = $("#studentProgramFilter")?.value || "";
  const batchFilter = $("#studentBatchFilter")?.value || "";
  const semesterFilter = $("#studentSemesterFilter")?.value || "";
  const statusFilter = $("#studentStatusFilter")?.value || "";
  const rows = students
    .filter((student) => {
      const warned = student.attendance < settings.threshold;
      const status = warned ? "Warned" : "Active";
      const batch = student.batch || "";
      const semesterValue = String(student.semester || "");
      return (
        `${student.name} ${student.roll} ${student.email || ""}`.toLowerCase().includes(normalized) &&
        (!programFilter || student.dept === programFilter) &&
        (!batchFilter || batch === batchFilter) &&
        (!semesterFilter || semesterValue === semesterFilter) &&
        (!statusFilter || status === statusFilter)
      );
    })
    .map((student) => {
      // The warned status is derived from the administrator's threshold.
      const warned = student.attendance < settings.threshold;
      return `<tr><td><strong>${h(student.name)}</strong><small>${h(student.email)}</small></td><td class="mono">${h(student.roll)}</td><td>${h(student.dept)}</td><td>${h(student.batch || "—")}</td><td>Semester ${h(student.semester || "—")}</td><td><strong class="${warned ? "danger-text" : ""}">${h(student.attendance)}%</strong></td><td>${statusBadge(warned ? "Warned" : "Active")}</td><td><div class="student-row-actions"><button type="button" data-edit-student="${h(student.id)}">Edit</button><button type="button" data-archive-student="${h(student.id)}">Archive</button></div></td></tr>`;
    })
    .join("");
  $("#studentRows").innerHTML = rows || `<tr><td colspan="8" class="empty-state">No students match the selected filters.</td></tr>`;
}

function setFilterOptions(selector, values, label) {
  const select = $(selector);
  if (!select) return;
  const previous = select.value;
  select.innerHTML = `<option value="">${h(label)}</option>` +
    [...new Set(values.filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b)).map((value) => `<option value="${h(value)}">${h(value)}</option>`).join("");
  select.value = values.map(String).includes(previous) ? previous : "";
}

function renderFaculty() {
  setFilterOptions("#facultyDepartmentFilter", faculty.map((member) => member.department), "All departments");
  setFilterOptions("#facultyProgramFilter", faculty.map((member) => member.program), "All programs");
  setFilterOptions("#facultyDesignationFilter", faculty.map((member) => member.designation), "All designations");
  const query = ($("#facultySearch")?.value || "").toLowerCase();
  const department = $("#facultyDepartmentFilter")?.value || "";
  const program = $("#facultyProgramFilter")?.value || "";
  const designation = $("#facultyDesignationFilter")?.value || "";
  const status = $("#facultyStatusFilter")?.value || "";
  const visibleFaculty = faculty.filter((member) =>
    `${member.name} ${member.email || ""} ${member.faculty_id || ""}`.toLowerCase().includes(query) &&
    (!department || member.department === department) &&
    (!program || member.program === program) &&
    (!designation || member.designation === designation) &&
    (!status || member.status === status)
  );
  $("#facultyRows").innerHTML = visibleFaculty
    .map((member) =>
      `<tr><td><strong>${h(member.name)}</strong><small>${h(member.email || "")}</small></td><td class="mono">${h(member.faculty_id)}</td><td>${h(member.department)}</td><td>${h(member.designation || "—")}</td><td>${h(member.program)}</td><td>${statusBadge(member.status === "on_leave" ? "On leave" : "Active")}</td><td><div class="student-row-actions"><button type="button" data-edit-faculty="${h(member.id)}">Edit</button><button type="button" data-archive-faculty="${h(member.id)}">Archive</button></div></td></tr>`,
    )
    .join("") || `<tr><td colspan="7" class="empty-state">No faculty members match the selected filters.</td></tr>`;
  renderFacultyAssignments();
}

function renderFacultyAssignments() {
  const rows = offerings.map((offering) => {
    const subject = offeringSubject(offering) || {};
    const semester = offeringSemester(offering) || currentSemesters.find((item) => item.id === offering.semester_id);
    return `<tr><td>${h(offeringTeacherName(offering))}</td><td>${h(subject.program || "—")}</td><td>${h(semester?.name || semester?.number || "—")}</td><td><strong>${h(subject.code || offering.subject_code || "—")}</strong><small>${h(subject.name || "")}</small></td><td>${statusBadge(offering.status === "archived" ? "Archived" : "Active")}</td></tr>`;
  });
  $("#facultyAssignmentRows").innerHTML = rows.join("") || `<tr><td colspan="5" class="empty-state">No teaching assignments are available.</td></tr>`;
}

function renderCourses() {
  const query = ($("#courseSearch")?.value || "").toLowerCase();
  const programFilter = $("#courseProgramFilter")?.value || "";
  const semesterFilter = $("#courseSemesterFilter")?.value || "";
  const statusFilter = $("#courseStatusFilter")?.value || "";
  const filteredCourses = courses.filter((course) => {
    const status = course.active === false ? "archived" : "active";
    return (
      `${course.code} ${course.name}`.toLowerCase().includes(query) &&
      (!programFilter || course.program === programFilter) &&
      (!semesterFilter || String(course.semester) === semesterFilter) &&
      (!statusFilter || status === statusFilter)
    );
  });
  const visibleCards = filteredCourses.filter(
    (course) => statusFilter === "archived" || course.active !== false,
  );
  $("#courseCards").innerHTML = visibleCards
    .map(
      (course) =>
        `<article class="course-card"><div class="course-code">${h(course.code)}</div><h3>${h(course.name)}</h3><p>${h(course.program)} · Semester ${h(course.semester)}</p><div class="course-meta"><span>${h(course.credits || "—")} credits</span><strong>${h(course.course_type || "theory")}</strong></div><div class="course-meta"><span>${h(course.active === false ? "Archived" : "Active")}</span><span>${h(course.code)}</span></div></article>`,
    )
    .join("");
  $("#subjectRows").innerHTML = filteredCourses
    .map(
      (course) =>
        `<tr><td><strong>${h(course.code)}</strong><small>${h(course.name)}</small></td><td>${h(course.program)}</td><td>${h(course.semester)}</td><td>${h(course.credits || "—")}</td><td>${h(course.course_type || "theory")}</td><td>${statusBadge(course.active === false ? "Archived" : "Active")}</td><td><div class="student-row-actions"><button type="button" data-edit-subject="${h(course.code)}">Edit</button>${course.active !== false ? `<button type="button" data-archive-subject="${h(course.code)}">Archive</button>` : `<button type="button" data-restore-subject="${h(course.code)}">Restore</button>`}</div></td></tr>`,
    )
    .join("");
}

function loadAdminCourses() {
  return Promise.all([
    AttendIQSupabase.getSubjects({ include_archived: true }),
    AttendIQSupabase.getCourseOfferings({ include_archived: true }),
    AttendIQSupabase.getSemesters(),
  ]).then(function (results) {
    const subjectsResult = results[0];
    const offeringsResult = results[1];
    const semestersResult = results[2];
    if (!subjectsResult.ok || !offeringsResult.ok || !semestersResult.ok) {
      showToast(subjectsResult.error || offeringsResult.error || semestersResult.error);
      return;
    }
    courses = subjectsResult.data;
    offerings = offeringsResult.data;
    currentSemesters = semestersResult.data;
    renderCourses();
    renderOfferings();
    renderFacultyAssignments();
    renderAdminMetrics();
    return Promise.all([
      AttendIQSupabase.getAcademicYears(),
      AttendIQSupabase.getAcademicEvents({ include_archived: true }),
      AttendIQSupabase.getClassSchedules({ include_archived: true }),
    ]).then(function (planningResults) {
      var yearsResult = planningResults[0];
      var eventsResult = planningResults[1];
      var schedulesResult = planningResults[2];
      if (!yearsResult.ok || !eventsResult.ok || !schedulesResult.ok) {
        showToast(yearsResult.error || eventsResult.error || schedulesResult.error);
        return;
      }
      currentAcademicYears = yearsResult.data;
      academicEvents = eventsResult.data;
      classSchedules = schedulesResult.data;
      const currentYear = currentAcademicYears.find((year) => year.is_current);
      const yearValue = Number(currentYear?.name);
      $("#currentAcademicYear").value = Number.isInteger(yearValue) && yearValue >= 2020
        ? String(yearValue)
        : String(new Date().getFullYear());
      renderAcademicEvents();
      renderClassSchedules();
    });
  });
}

function offeringSubject(offering) {
  const subject = offering.subjects;
  return Array.isArray(subject) ? subject[0] : subject;
}

function offeringSemester(offering) {
  const semester = offering.semesters;
  return Array.isArray(semester) ? semester[0] : semester;
}

function offeringIsInCurrentSemester(offering) {
  const semester = offeringSemester(offering) ||
    currentSemesters.find((item) => item.id === offering.semester_id);
  return Boolean(semester?.is_current);
}

function offeringTeacherName(offering) {
  const member = faculty.find((item) => item.profile_id === offering.teacher_id);
  return member ? member.name : "Unassigned";
}

function teacherWorkload(profileId, excludeOfferingId) {
  return offerings.filter((offering) =>
    offering.teacher_id === profileId &&
    offering.status !== "archived" &&
    offering.id !== excludeOfferingId
  ).length;
}

function updateOfferingTeacherWorkload() {
  const teacherSelect = $("#offeringTeacher");
  const workloadCopy = $("#offeringTeacherWorkload");
  if (!teacherSelect || !workloadCopy || !teacherSelect.value) {
    if (workloadCopy) workloadCopy.textContent = "Select a teacher to view their current assignments.";
    return;
  }
  const currentOfferingId = $("#offeringId")?.value || "";
  const count = teacherWorkload(teacherSelect.value, currentOfferingId);
  const member = faculty.find((item) => item.profile_id === teacherSelect.value);
  const status = member?.status === "on_leave" ? " This teacher is currently on leave." : "";
  workloadCopy.textContent = `${count} active ${count === 1 ? "assignment" : "assignments"} after this change.${status}`;
}

function renderOfferings() {
  $("#offeringRows").innerHTML = offerings
    .map((offering) => {
      const subject = offeringSubject(offering) || { code: offering.subject_code, name: "" };
      const semester = offeringSemester(offering) || currentSemesters.find((item) => item.id === offering.semester_id);
      const actions = offeringIsInCurrentSemester(offering)
        ? `<button type="button" data-edit-offering="${h(offering.id)}">Edit</button>${offering.status !== "archived" ? `<button type="button" data-archive-offering="${h(offering.id)}">Archive</button>` : `<button type="button" data-restore-offering="${h(offering.id)}">Restore</button>`}`
        : "";
      return `<tr><td><strong>${h(subject.code || offering.subject_code)}</strong><small>${h(subject.name || "")}</small></td><td>${h(semester?.name || semester?.number || "—")}</td><td>${h(offeringTeacherName(offering))}</td><td>${statusBadge(offering.status === "archived" ? "Archived" : "Active")}</td><td><div class="student-row-actions">${actions}</div></td></tr>`;
    })
    .join("");
}

function eventYear(event) {
  const year = event.academic_years;
  const resolved = Array.isArray(year) ? year[0] : year;
  return resolved || currentAcademicYears.find((item) => item.id === event.academic_year_id);
}

function eventSemester(event) {
  const semester = event.semesters;
  const resolved = Array.isArray(semester) ? semester[0] : semester;
  return resolved || currentSemesters.find((item) => item.id === event.semester_id);
}

function renderAcademicEvents() {
  $("#eventRows").innerHTML = academicEvents.map(function (event) {
    const year = eventYear(event);
    const semester = eventSemester(event);
    const dates = event.start_date === event.end_date ? event.start_date : event.start_date + " → " + event.end_date;
    return `<tr><td><strong>${h(event.title)}</strong><small>${h(year ? year.name : "Academic year")} · ${h(semester ? semester.name : "All semesters")}</small></td><td>${h(String(event.event_type || "").replaceAll("_", " "))}</td><td>${h(dates)}</td><td>${statusBadge(event.status === "archived" ? "Archived" : "Active")}</td><td><div class="student-row-actions"><button type="button" data-edit-event="${h(event.id)}">Edit</button>${event.status !== "archived" ? `<button type="button" data-archive-event="${h(event.id)}">Archive</button>` : `<button type="button" data-restore-event="${h(event.id)}">Restore</button>`}</div></td></tr>`;
  }).join("");
}

function scheduleOffering(schedule) {
  const offering = schedule.course_offerings;
  const resolved = Array.isArray(offering) ? offering[0] : offering;
  return resolved || offerings.find((item) => item.id === schedule.course_offering_id);
}

function scheduleDayName(day) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][Number(day)] || "—";
}

function renderClassSchedules() {
  const rows = classSchedules.map(function (schedule) {
    const offering = scheduleOffering(schedule) || {};
    const subject = Array.isArray(offering.subjects) ? offering.subjects[0] : offering.subjects || {};
    const semester = Array.isArray(offering.semesters) ? offering.semesters[0] : offering.semesters || {};
    const manageable = offering.status !== "archived" && offeringIsInCurrentSemester(offering);
    const status = schedule.status === "archived" || !manageable ? "Archived" : "Active";
    const actions = manageable
      ? `<button type="button" data-edit-schedule="${h(schedule.id)}">Edit</button>${schedule.status !== "archived" ? `<button type="button" data-archive-schedule="${h(schedule.id)}">Archive</button>` : `<button type="button" data-restore-schedule="${h(schedule.id)}">Restore</button>`}`
      : "";
    return `<tr><td><strong>${h(subject.code || offering.subject_code || "—")}</strong><small>${h(subject.name || "")}</small></td><td>${h(offeringTeacherName(offering))}</td><td>${h(subject.program || "—")} · ${h(semester.name || "Semester")}</td><td>${h(scheduleDayName(schedule.day_of_week))}<small>${h(schedule.start_time)} – ${h(schedule.end_time)}</small></td><td>${h(schedule.room || "—")}</td><td>${statusBadge(status)}</td><td><div class="student-row-actions">${actions}</div></td></tr>`;
  }).join("");
  $("#scheduleRows").innerHTML = rows || `<tr><td colspan="7" class="empty-state">No class schedules have been added yet.</td></tr>`;
}

function requestMarkup(request, actions = true) {
  const statusClass = String(request.status || "unknown").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const actionMarkup =
    actions && request.status === "pending"
      ? `<div class="request-actions"><button class="approve" data-leave="${h(request.id)}" data-status="approved">Approve</button><button class="reject" data-leave="${h(request.id)}" data-status="rejected">Reject</button></div>`
      : `<button class="undo" data-leave="${h(request.id)}" data-status="pending">Undo</button>`;
  const initials = String(request.name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("");
  return `<div class="request-row leave-${h(statusClass)}"><div class="request-main"><span class="request-avatar">${h(initials)}</span><div><div class="request-title"><strong>${h(request.name)}</strong><span class="mono">${h(request.roll)}</span>${statusBadge(request.status)}</div><p>${h(request.subjectLabel)} · ${h(request.type)} · ${h(request.dates)} · ${h(request.reason)}</p>${request.reviewComment ? `<small>Reviewer: ${h(request.reviewComment)}</small>` : ""}${request.doc ? `<small class="document">✓ Document submitted</small><button type="button" data-review-document="${h(request.docPath)}">Open document</button>` : ""}</div></div>${actionMarkup}</div>`;
}

function renderLeaves(target = "#leaveRequests", limit = false) {
  const pendingCount = leaves.filter((leave) => leave.status === "pending").length;
  document.querySelectorAll(".nav-count").forEach((node) => {
    node.textContent = String(pendingCount);
    node.hidden = pendingCount === 0;
  });
  const pendingButton = $("#pendingLeaveCount");
  if (pendingButton) pendingButton.textContent = String(pendingCount);
  const filtered = leaves.filter(
    (leave) => currentFilter === "all" || leave.status === currentFilter,
  );
  $(target).innerHTML = (limit ? filtered.slice(0, 3) : filtered)
    .map((leave) => requestMarkup(leave))
    .join("");
}

function formatLeaveDates(row) {
  return row.from_date === row.to_date
    ? row.from_date
    : row.from_date + " → " + row.to_date;
}

function leaveSubjectLabel(row) {
  const offering = Array.isArray(row.course_offerings) ? row.course_offerings[0] : row.course_offerings;
  const subject = offering && (Array.isArray(offering.subjects) ? offering.subjects[0] : offering.subjects);
  return subject ? `${subject.code} · ${subject.name}` : "All subjects";
}

// Load real leave requests and join them to the student roster by UUID.
function loadAdminLeaves() {
  if (!window.AttendIQDb) {
    renderLeaves();
    renderLeaves("#dashboardRequests", true);
    return Promise.resolve();
  }
  return Promise.all([
    AttendIQSupabase.getLeaves(),
    AttendIQSupabase.getStudents(),
  ]).then(function (results) {
    const leavesResult = results[0];
    const studentsResult = results[1];
    if (!leavesResult.ok || !studentsResult.ok) {
      showToast(leavesResult.error || studentsResult.error || "Leave requests could not be loaded.");
      return;
    }
    const directory = {};
    studentsResult.data.forEach(function (student) {
      directory[student.id] = { name: student.name, roll: student.roll };
    });
    leaves = leavesResult.data.map(function (row) {
      const student = directory[row.student_id] || { name: "Unknown student", roll: "—" };
      return {
        id: row.id,
        name: student.name,
        roll: student.roll,
        subjectLabel: leaveSubjectLabel(row),
        type: row.type,
        dates: formatLeaveDates(row),
        reason: row.reason,
        status: row.status,
        doc: !!row.document_url,
        docPath: row.document_url,
        reviewComment: row.review_comment || "",
      };
    });
    renderLeaves();
    renderLeaves("#dashboardRequests", true);
  });
}

// Load student directory and attendance data for administrator metrics.
function loadAdminStudents() {
  return Promise.all([
    AttendIQSupabase.getStudents(),
    AttendIQSupabase.getAttendance(),
    AttendIQSupabase.getSemesters(),
  ]).then(function (results) {
    const studentsResult = results[0];
    const attendanceResult = results[1];
    const semestersResult = results[2];
    if (!studentsResult.ok || !attendanceResult.ok || !semestersResult.ok) {
      showToast(studentsResult.error || attendanceResult.error || semestersResult.error || "Student records could not be loaded.");
      return;
    }
    currentSemesters = semestersResult.data;
    const totals = {};
    attendanceResult.data.forEach(function (row) {
      const entry = totals[row.student_id] || { total: 0, present: 0 };
      entry.total += 1;
      if (row.status === "Present") entry.present += 1;
      totals[row.student_id] = entry;
    });
    students = studentsResult.data.map(function (student) {
      const entry = totals[student.id] || { total: 0, present: 0 };
      return {
        id: student.id,
        name: student.name,
        email: student.email || "",
        roll: student.roll,
        dept: student.program,
        batch: student.batch,
        semester: student.semester,
        attendance: entry.total ? Math.round((entry.present / entry.total) * 100) : 0,
      };
    });
    setFilterOptions("#studentProgramFilter", students.map((student) => student.dept), "All programs");
    setFilterOptions("#studentBatchFilter", students.map((student) => student.batch), "All batches");
    setFilterOptions("#studentSemesterFilter", students.map((student) => String(student.semester)), "All semesters");
    renderStudents();
    renderThreshold();
    renderAdminMetrics();
  });
}

// Load the real faculty directory from Supabase.
function loadAdminFaculty() {
  return AttendIQSupabase.getFaculty().then(function (result) {
    if (!result.ok) {
      showToast(result.error);
      return;
    }

    faculty = result.data;
    renderFaculty();
    renderAdminMetrics();
  });
}

function setFacultyView(view) {
  const directory = view === "directory";
  $("#facultyDirectoryView").hidden = !directory;
  $("#facultyAssignmentsView").hidden = directory;
  $$("[data-faculty-view]").forEach((tab) => {
    const active = tab.dataset.facultyView === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2600);
}

function openNotificationComposer() {
  const composer = $("#notificationComposer");
  if (!composer) return showToast("Notification composer is unavailable.");
  composer.hidden = false;
  $("#notificationTitle").focus();
}

function closeNotificationComposer() {
  const composer = $("#notificationComposer");
  if (composer) composer.hidden = true;
  $("#notificationForm").reset();
}

$("#notificationCancel").addEventListener("click", closeNotificationComposer);
$("#notificationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await AttendIQSupabase.sendMassNotification({
    audience: $("#notificationAudience").value,
    title: $("#notificationTitle").value,
    message: $("#notificationMessage").value,
  });
  if (!result.ok) return showToast(result.error);
  closeNotificationComposer();
  showToast("Notification sent.");
});

// Update dashboard counts from the same current records used by the
// attendance table; no display metric is independent demo data.
function renderAdminMetrics() {
  const total = students.length;
  const present = students.reduce(function (sum, student) { return sum + Number(student.attendance || 0); }, 0);
  const average = total ? Math.round(present / total) : 0;
  $("#totalStudents").textContent = total;
  $("#facultyCount").textContent = faculty.length;
  $("#activeSubjectCount").textContent = courses.filter(function (course) { return course.active !== false; }).length;
  $("#averageAttendance").textContent = average + "%";
  $("#attendanceScopeCopy").textContent = "Current marks";
  $("#atRiskCount").textContent = students.filter(function (student) { return student.attendance < settings.threshold; }).length;
  const programGroups = {};
  students.forEach(function (student) {
    const entry = programGroups[student.dept] || { total: 0, present: 0 };
    entry.total += 1;
    entry.present += Number(student.attendance || 0);
    programGroups[student.dept] = entry;
  });
  $("#programChart").innerHTML = Object.entries(programGroups).map(function ([program, entry]) {
    const percent = entry.total ? Math.round(entry.present / entry.total) : 0;
    return `<div class="chart-row"><span>${h(program)}</span><i><b style="width:${Math.min(100, percent)}%"></b></i><strong>${percent}%</strong></div>`;
  }).join("") || "<p>No attendance data available.</p>";
}

function renderThreshold() {
  $("#threshold").value = settings.threshold;
  $("#thresholdValue").textContent = `${settings.threshold}%`;
  $("#thresholdCopy").textContent = `${settings.threshold}%`;
  $("#atRiskCopy").textContent = `Below ${settings.threshold}% threshold`;
  renderAdminMetrics();
}

// Role labels shared by the user table and its feedback messages.
const ROLE_LABELS = {
  student: "Student",
  teacher: "Teacher",
  admin: "Administrator",
};

// Cached account rows; the local fallback is replaced after initialization.
let users = [];

// Draw the account list with a role selector and remove control per user.
function renderUsers() {
  const roleFilter = $("#userRoleFilter")?.value || "";
  $("#userRows").innerHTML = users
    .filter((user) => !roleFilter || user.role === roleFilter)
    .map(
      (user) =>
        `<tr><td><strong>${h(user.name)}</strong><small>${h(user.email)}</small></td><td><select class="role-select" data-user-id="${h(user.id)}" aria-label="Role for ${h(user.name)}">${AttendIQSupabase.ROLES.map((role) => `<option value="${h(role)}"${role === user.role ? " selected" : ""}>${h(ROLE_LABELS[role])}</option>`).join("")}</select></td><td><button class="user-remove" type="button" data-remove-user="${h(user.id)}">Remove</button></td></tr>`,
    )
    .join("");
}

$("#userRoleFilter").addEventListener("change", renderUsers);

function setCourseView(view) {
  const subjects = view === "subjects";
  const offeringsView = view === "offerings";
  $("#courseSubjectsView").hidden = !subjects;
  $("#courseOfferingsView").hidden = !offeringsView;
  $("#courseSchedulesView").hidden = view !== "schedules";
  $$("[data-course-view]").forEach((tab) => {
    const active = tab.dataset.courseView === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

$$("[data-faculty-view]").forEach((tab) =>
  tab.addEventListener("click", () => setFacultyView(tab.dataset.facultyView)),
);
$$("[data-course-view]").forEach((tab) =>
  tab.addEventListener("click", () => setCourseView(tab.dataset.courseView)),
);

// Load the account list through the shared adapter.
function loadUsers() {
  return AttendIQSupabase.getUsers().then(function (result) {
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    users = result.data;
    renderUsers();
  });
}

const roleSelect = document.getElementById("newUserRole");
const accountFields = document.querySelectorAll("[data-account-field]");

function updateAccountFields() {
  const role = roleSelect.value;
  accountFields.forEach((field) => {
    field.hidden = field.dataset.accountField !== role;
  });
  document.getElementById("newUserRoll").required = role === "student";
  document.getElementById("newUserProgram").required = role === "student";
  document.getElementById("newUserBatch").required = role === "student";
  document.getElementById("newUserSemester").required = role === "student";
  document.getElementById("newFacultyId").required = role === "teacher";
}
roleSelect.addEventListener("change", updateAccountFields);
updateAccountFields();

// Create accounts from the settings form, reporting validation errors.
$("#userForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = await AttendIQSupabase.createUser({
    name: $("#newUserName").value,
    email: $("#newUserEmail").value,
    role: $("#newUserRole").value,
    password: $("#newUserPassword").value,
    roll: $("#newUserRoll").value,
    program: $("#newUserProgram").value,
    batch: $("#newUserBatch").value,
    semester: $("#newUserSemester").value,
    faculty_id: $("#newFacultyId").value,
  });
  if (!result.ok) return showToast(result.error);
  const created = result.data && (result.data.user || result.data);
  event.target.reset();
  updateAccountFields();
  await loadUsers();
  if (created.role === "student") await loadAdminStudents();
  if (created.role === "teacher") await loadAdminFaculty();
  showToast(`${created.name} added as ${ROLE_LABELS[created.role]}.`);
});

// Student create/edit/archive controls store each student's semester.
function openStudentEditor(student) {
  const editor = $("#studentEditor");
  const form = $("#studentForm");
  form.reset();
  $("#studentId").value = student ? student.id : "";
  $("#studentFormTitle").textContent = student ? "Edit student" : "Add student";
  $("#studentFormCopy").textContent = student
    ? "Update the student's directory information and semester."
    : "Enter the student's program, batch, official TU roll number, and semester.";
  $("#studentPasswordField").hidden = Boolean(student);
  $("#studentPassword").required = !student;
  $("#studentSave").textContent = student ? "Save changes" : "Create student";
  if (student) {
    $("#studentName").value = student.name;
    $("#studentEmail").value = student.email;
    $("#studentRoll").value = student.roll;
    $("#studentProgram").value = student.dept;
    $("#studentBatch").value = student.batch;
    $("#studentSemester").value = String(student.semester || "");
  }
  editor.hidden = false;
  $("#studentName").focus();
}

function closeStudentEditor() {
  $("#studentEditor").hidden = true;
  $("#studentForm").reset();
}

$("#studentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const studentId = $("#studentId").value.trim();
  const formData = {
    name: $("#studentName").value,
    email: $("#studentEmail").value,
    roll: $("#studentRoll").value,
    program: $("#studentProgram").value,
    batch: $("#studentBatch").value,
    semester: $("#studentSemester").value,
  };
  const result = studentId
    ? await AttendIQSupabase.updateStudent({ id: studentId, ...formData })
    : await AttendIQSupabase.createUser({ ...formData, password: $("#studentPassword").value, role: "student" });
  if (!result.ok) return showToast(result.error);
  closeStudentEditor();
  await loadAdminStudents();
  showToast(studentId ? "Student details updated." : "Student account created with the selected semester.");
});

// Faculty create/edit/archive controls use the linked account and faculty record.
function openFacultyEditor(member) {
  const editor = $("#facultyEditor");
  const form = $("#facultyForm");
  form.reset();
  $("#facultyId").value = member ? member.id : "";
  $("#facultyFormTitle").textContent = member ? "Edit faculty" : "Add faculty";
  $("#facultyFormCopy").textContent = member
    ? "Update faculty directory information and account status."
    : "Create a linked teacher login and faculty record.";
  $("#facultyPasswordField").hidden = Boolean(member);
  $("#facultyPassword").required = !member;
  $("#facultySave").textContent = member ? "Save changes" : "Create faculty";
  if (member) {
    $("#facultyName").value = member.name;
    $("#facultyEmail").value = member.email || "";
    $("#facultyCode").value = member.faculty_id;
    $("#facultyDepartment").value = member.department;
    $("#facultyProgram").value = member.program;
    $("#facultyDesignation").value = member.designation || "";
    $("#facultyStatus").value = member.status === "on_leave" ? "on_leave" : "active";
  }
  editor.hidden = false;
  $("#facultyName").focus();
}

function closeFacultyEditor() {
  $("#facultyEditor").hidden = true;
  $("#facultyForm").reset();
}

$("#facultyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const facultyId = $("#facultyId").value.trim();
  const formData = {
    name: $("#facultyName").value,
    email: $("#facultyEmail").value,
    faculty_id: $("#facultyCode").value,
    department: $("#facultyDepartment").value,
    program: $("#facultyProgram").value,
    designation: $("#facultyDesignation").value,
    status: $("#facultyStatus").value,
  };
  const result = facultyId
    ? await AttendIQSupabase.updateFaculty({ id: facultyId, ...formData })
    : await AttendIQSupabase.createUser({ ...formData, role: "teacher", password: $("#facultyPassword").value, faculty_id: formData.faculty_id, department: formData.department });
  if (!result.ok) return showToast(result.error);
  closeFacultyEditor();
  await Promise.all([loadAdminFaculty(), loadUsers()]);
  showToast(facultyId ? "Faculty record updated." : "Faculty account created.");
});

$("#currentSemesterForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#currentSemesterSave");
  button.disabled = true;
  const result = await AttendIQSupabase.setCurrentAcademicYear({
    year: $("#currentAcademicYear").value,
  });
  button.disabled = false;
  if (!result.ok) return showToast(result.error);
  await Promise.all([loadAdminStudents(), loadAdminCourses()]);
  showToast("Active academic year updated. Choose each student's semester in the student form.");
});

  $("#facultyCancel").addEventListener("click", closeFacultyEditor);

function openSubjectEditor(subject) {
  const editor = $("#subjectEditor");
  const form = $("#subjectForm");
  form.reset();
  $("#subjectCodeExisting").value = subject ? subject.code : "";
  $("#subjectFormTitle").textContent = subject ? "Edit subject" : "Add subject";
  $("#subjectFormCopy").textContent = subject
    ? "Update subject metadata without changing its permanent code."
    : "Create a subject for later course-offering assignments.";
  $("#subjectCode").disabled = Boolean(subject);
  $("#subjectSave").textContent = subject ? "Save subject" : "Create subject";
  if (subject) {
    $("#subjectCode").value = subject.code;
    $("#subjectName").value = subject.name;
    $("#subjectSemester").value = subject.semester;
    $("#subjectProgram").value = subject.program;
    $("#subjectCredits").value = subject.credits || 3;
    $("#subjectType").value = subject.course_type || "theory";
  }
  editor.hidden = false;
  $("#subjectName").focus();
}

function closeSubjectEditor() {
  $("#subjectEditor").hidden = true;
  $("#subjectForm").reset();
  $("#subjectCode").disabled = false;
}

$("#subjectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const existingCode = $("#subjectCodeExisting").value.trim();
  const formData = {
    code: $("#subjectCode").value.trim(),
    name: $("#subjectName").value,
    semester: $("#subjectSemester").value,
    program: $("#subjectProgram").value,
    credits: $("#subjectCredits").value,
    course_type: $("#subjectType").value,
  };
  const result = existingCode
    ? await AttendIQSupabase.updateSubject({
        ...formData,
        code: existingCode,
        active: courses.find((subject) => subject.code === existingCode)?.active !== false,
      })
    : await AttendIQSupabase.createSubject(formData);
  if (!result.ok) return showToast(result.error);
  closeSubjectEditor();
  await loadAdminCourses();
  showToast(existingCode ? "Subject updated." : "Subject created.");
});

function populateOfferingSelectors() {
  const subjectSelect = $("#offeringSubject");
  const semesterSelect = $("#offeringSemester");
  const teacherSelect = $("#offeringTeacher");
  const previous = {
    subject: subjectSelect.value,
    semester: semesterSelect.value,
    teacher: teacherSelect.value,
  };
  teacherSelect.innerHTML = faculty.filter((member) => member.profile_id).map((member) => {
    const count = teacherWorkload(member.profile_id);
    const leaveLabel = member.status === "on_leave" ? " · On leave" : "";
    return `<option value="${h(member.profile_id)}">${h(member.name)} · ${count} active ${count === 1 ? "assignment" : "assignments"}${leaveLabel}</option>`;
  }).join("");
  semesterSelect.value = previous.semester || String(currentSemesters[0]?.number || "");
  populateOfferingSubjectOptions(previous.subject);
  if (previous.teacher) teacherSelect.value = previous.teacher;
  updateOfferingTeacherWorkload();
}

function populateOfferingSubjectOptions(selectedCode) {
  const semesterNumber = Number($("#offeringSemester").value);
  const available = courses.filter((subject) =>
    subject.active !== false && subject.semester === semesterNumber
  );
  $("#offeringSubject").innerHTML = available.map((subject) =>
    `<option value="${h(subject.code)}">${h(subject.code)} · ${h(subject.name)}</option>`
  ).join("");
  if (selectedCode && available.some((subject) => subject.code === selectedCode)) {
    $("#offeringSubject").value = selectedCode;
  }
}

function openOfferingEditor(offering) {
  populateOfferingSelectors();
  const editor = $("#offeringEditor");
  const form = $("#offeringForm");
  form.reset();
  $("#offeringSemester").value = String(currentSemesters[0]?.number || "");
  populateOfferingSubjectOptions();
  $("#offeringId").value = offering ? offering.id : "";
  $("#offeringFormTitle").textContent = offering ? "Edit course offering" : "Assign course offering";
  $("#offeringSave").textContent = offering ? "Save offering" : "Create offering";
  if (offering) {
    $("#offeringSubject").value = offering.subject_code;
    const subject = offeringSubject(offering);
    const semester = offeringSemester(offering) || currentSemesters.find((item) => item.id === offering.semester_id);
    $("#offeringSemester").value = String(semester?.number || subject?.semester || "");
    populateOfferingSubjectOptions(offering.subject_code);
    $("#offeringTeacher").value = offering.teacher_id || "";
    $("#offeringStatus").value = offering.status === "archived" ? "archived" : "active";
    ["offeringSubject", "offeringSemester"].forEach((id) => { $("#" + id).disabled = true; });
  } else {
    ["offeringSubject", "offeringSemester"].forEach((id) => { $("#" + id).disabled = false; });
  }
  editor.hidden = false;
  updateOfferingTeacherWorkload();
  $("#offeringTeacher").focus();
}

$("#offeringSemester").addEventListener("input", () => populateOfferingSubjectOptions());
$("#offeringSemester").addEventListener("change", () => populateOfferingSubjectOptions());

function closeOfferingEditor() {
  $("#offeringEditor").hidden = true;
  $("#offeringForm").reset();
  ["offeringSubject", "offeringSemester"].forEach((id) => { $("#" + id).disabled = false; });
}

$("#offeringForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#offeringId").value.trim();
  const semesterNumber = Number($("#offeringSemester").value);
  if (!Number.isInteger(semesterNumber) || semesterNumber < 1 || semesterNumber > 8) {
    showToast("Enter a whole semester number from 1 to 8.");
    $("#offeringSemester").focus();
    return;
  }
  const semester = currentSemesters.find((item) => item.number === semesterNumber && item.is_current);
  if (!semester && !id) {
    showToast(`Semester ${semesterNumber} is not available in the current academic records.`);
    $("#offeringSemester").focus();
    return;
  }
  const formData = {
    subject_code: $("#offeringSubject").value,
    semester_id: semester?.id || offerings.find((offering) => offering.id === id)?.semester_id,
    teacher_id: $("#offeringTeacher").value,
    status: $("#offeringStatus").value,
  };
  const result = id
    ? await AttendIQSupabase.updateCourseOffering({ id, ...formData })
    : await AttendIQSupabase.createCourseOffering(formData);
  if (!result.ok) return showToast(result.error);
  closeOfferingEditor();
  await loadAdminCourses();
  showToast(id ? "Course offering updated." : "Course offering created for the selected semester.");
});

$("#offeringTeacher").addEventListener("change", updateOfferingTeacherWorkload);

function populateEventSelectors() {
  const yearSelect = $("#eventAcademicYear");
  const semesterSelect = $("#eventSemester");
  const previousYear = yearSelect.value;
  const previousSemester = semesterSelect.value;
  yearSelect.innerHTML = currentAcademicYears.map((year) => `<option value="${h(year.id)}">${h(year.name)}</option>`).join("");
  const selectedYear = yearSelect.value || previousYear;
  semesterSelect.innerHTML = currentSemesters.map((semester) => `<option value="${h(semester.id)}">${h(semester.name)}</option>`).join("");
  if (previousYear) yearSelect.value = previousYear;
  if (previousSemester) semesterSelect.value = previousSemester;
  if (selectedYear && currentSemesters.length) {
    const matching = currentSemesters.find((semester) => semester.academic_year_id === selectedYear);
    if (matching) semesterSelect.value = matching.id;
  }
}

function openEventEditor(event) {
  populateEventSelectors();
  const editor = $("#eventEditor");
  const form = $("#eventForm");
  form.reset();
  $("#eventId").value = event ? event.id : "";
  $("#eventFormTitle").textContent = event ? "Edit academic event" : "Add academic event";
  $("#eventFormCopy").textContent = event ? "Update the calendar event without affecting attendance history." : "Create a date range for the academic calendar.";
  $("#eventSave").textContent = event ? "Save event" : "Create event";
  if (event) {
    $("#eventAcademicYear").value = event.academic_year_id;
    $("#eventSemester").value = event.semester_id || "";
    $("#eventTitle").value = event.title;
    $("#eventType").value = event.event_type;
    $("#eventStart").value = event.start_date;
    $("#eventEnd").value = event.end_date;
    $("#eventDescription").value = event.description || "";
    $("#eventStatus").value = event.status === "archived" ? "archived" : "active";
  }
  editor.hidden = false;
  $("#eventTitle").focus();
}

function closeEventEditor() {
  $("#eventEditor").hidden = true;
  $("#eventForm").reset();
}

$("#eventForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#eventId").value.trim();
  const formData = {
    academic_year_id: $("#eventAcademicYear").value,
    semester_id: $("#eventSemester").value,
    title: $("#eventTitle").value.trim(),
    event_type: $("#eventType").value,
    start_date: $("#eventStart").value,
    end_date: $("#eventEnd").value,
    description: $("#eventDescription").value.trim(),
    status: $("#eventStatus").value,
  };
  const result = id ? await AttendIQSupabase.updateAcademicEvent({ id, ...formData }) : await AttendIQSupabase.createAcademicEvent(formData);
  if (!result.ok) return showToast(result.error);
  closeEventEditor();
  await loadAdminCourses();
  showToast(id ? "Academic event updated." : "Academic event created.");
});
$("#eventCancel").addEventListener("click", closeEventEditor);

function populateScheduleSelectors() {
  const offeringSelect = $("#scheduleOffering");
  const previous = offeringSelect.value;
  const assignedOfferings = offerings.filter((offering) =>
    offering.status !== "archived" &&
    offering.teacher_id &&
    offeringIsInCurrentSemester(offering)
  );
  offeringSelect.innerHTML = `<option value="">${assignedOfferings.length ? "Choose course and teacher" : "No active teacher-assigned courses available"}</option>` +
    assignedOfferings.map((offering) => {
    const subject = offeringSubject(offering) || { code: offering.subject_code, name: "" };
    const semester = offeringSemester(offering) || currentSemesters.find((item) => item.id === offering.semester_id);
    return `<option value="${h(offering.id)}">${h(subject.code || offering.subject_code)} · ${h(offeringTeacherName(offering))} · ${h(semester?.name || "Semester")}</option>`;
  }).join("");
  if (previous) offeringSelect.value = previous;
}

function openScheduleEditor(schedule) {
  populateScheduleSelectors();
  const editor = $("#scheduleEditor");
  const form = $("#scheduleForm");
  form.reset();
  $("#scheduleId").value = schedule ? schedule.id : "";
  $("#scheduleFormTitle").textContent = schedule ? "Edit class schedule" : "Add class schedule";
  $("#scheduleFormCopy").textContent = schedule ? "Update the weekly class time and room." : "Select a course with an assigned teacher and set its weekly time.";
  $("#scheduleSave").textContent = schedule ? "Save schedule" : "Create schedule";
  $("#scheduleSave").disabled = !$("#scheduleOffering").value && !schedule;
  if (schedule) {
    $("#scheduleOffering").value = schedule.course_offering_id;
    $("#scheduleOffering").disabled = true;
    $("#scheduleDay").value = schedule.day_of_week;
    $("#scheduleStart").value = schedule.start_time;
    $("#scheduleEnd").value = schedule.end_time;
    $("#scheduleRoom").value = schedule.room || "";
  }
  editor.hidden = false;
  $("#scheduleOffering").focus();
}

function closeScheduleEditor() {
  $("#scheduleEditor").hidden = true;
  $("#scheduleForm").reset();
  $("#scheduleOffering").disabled = false;
}

$("#scheduleOffering").addEventListener("change", () => {
  $("#scheduleSave").disabled = !$("#scheduleOffering").value;
});

$("#scheduleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#scheduleId").value.trim();
  const formData = {
    course_offering_id: $("#scheduleOffering").value,
    day_of_week: $("#scheduleDay").value,
    start_time: $("#scheduleStart").value,
    end_time: $("#scheduleEnd").value,
    room: $("#scheduleRoom").value.trim(),
    status: id ? classSchedules.find((schedule) => schedule.id === id)?.status : "active",
  };
  const result = id ? await AttendIQSupabase.updateClassSchedule({ id, ...formData }) : await AttendIQSupabase.createClassSchedule(formData);
  if (!result.ok) return showToast(result.error);
  closeScheduleEditor();
  await loadAdminCourses();
  showToast(id ? "Class schedule updated." : "Class schedule created.");
});
$("#scheduleCancel").addEventListener("click", closeScheduleEditor);


$("#offeringCancel").addEventListener("click", closeOfferingEditor);

document.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-user-id]");
  if (!select) return;
  const result = await AttendIQSupabase.assignRole(select.dataset.userId, select.value);
  if (!result.ok) {
    showToast(result.error);
    return loadUsers();
  }
  const user = result.data && (result.data.user || result.data);
  await loadUsers();
  showToast(`${user.name} is now ${ROLE_LABELS[user.role]}.`);
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-user]");
  if (!button) return;
  if (session && button.dataset.removeUser === session.id)
    return showToast("You cannot remove your own account.");
  const user = users.find(
    (item) => item.id === button.dataset.removeUser,
  );
  if (!user) return;
  if (!window.confirm(`Remove the account for ${user.name}?`)) return;
  const result = await AttendIQSupabase.removeUser(user.id);
  if (!result.ok) return showToast(result.error);
  await loadUsers();
  showToast("Account removed.");
});

// Update the visible admin section and page heading.
function openTab(tab) {
  $$(".nav-item").forEach((item) =>
    item.classList.toggle("active", item.dataset.tab === tab),
  );
  $$(".tab-panel").forEach((panel) =>
    panel.classList.toggle("active", panel.dataset.panel === tab),
  );
  const titles = {
    dashboard: "Admin Overview",
    students: "Student Management",
    faculty: "Faculty Management",
    courses: "Course Management",
    leaves: "Leave Management",
    settings: "System Settings",
  };
  $("#pageTitle").textContent = titles[tab];
  $("#breadcrumbPage").textContent =
    tab === "dashboard" ? "OVERVIEW" : tab.toUpperCase();
  $("#headerAction").hidden = ![
    "dashboard",
    "students",
    "faculty",
    "courses",
  ].includes(tab);
  $("#sidebar").classList.remove("open");
  $("#menuButton").setAttribute("aria-expanded", "false");
}

// Register navigation, filters, settings controls, and delegated actions.
$$(".nav-item").forEach((item) =>
  item.addEventListener("click", () => openTab(item.dataset.tab)),
);
$("#menuButton").addEventListener("click", () => {
  const open = $("#sidebar").classList.toggle("open");
  $("#menuButton").setAttribute("aria-expanded", String(open));
});
$("#resetCancel").addEventListener("click", () => $("#resetDialog").close());
$("#resetForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#resetEmail").value.trim().toLowerCase();
  if (!activeAdminEmail || email !== activeAdminEmail) {
    return showToast("The reset email must match the signed-in administrator account.");
  }
  const button = event.submitter;
  if (button) button.disabled = true;
  const result = await AttendIQSupabase.resetApplicationData(
    email,
    $("#resetPassword").value,
    $("#resetConfirmation").value.trim(),
  );
  if (button) button.disabled = false;
  if (!result.ok) return showToast(result.error);
  $("#resetDialog").close();
  showToast("Application data reset completed. Reloading...");
  setTimeout(() => window.location.reload(), 900);
});
$("#studentSearch").addEventListener("input", (event) =>
  renderStudents(event.target.value),
);
["#studentProgramFilter", "#studentBatchFilter", "#studentSemesterFilter", "#studentStatusFilter"].forEach((selector) => {
  $(selector).addEventListener("change", () =>
    renderStudents($("#studentSearch").value),
  );
});
["#facultySearch", "#facultyDepartmentFilter", "#facultyProgramFilter", "#facultyDesignationFilter", "#facultyStatusFilter"].forEach((selector) => {
  $(selector).addEventListener("input", renderFaculty);
  $(selector).addEventListener("change", renderFaculty);
});
["#courseSearch", "#courseProgramFilter", "#courseSemesterFilter", "#courseStatusFilter"].forEach(
  (selector) => {
    $(selector).addEventListener("input", renderCourses);
    $(selector).addEventListener("change", renderCourses);
  },
);
$$("[data-jump]").forEach((button) =>
  button.addEventListener("click", () => openTab(button.dataset.jump)),
);
$$("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    $$("[data-filter]").forEach((item) =>
      item.classList.toggle("selected", item === button),
    );
    renderLeaves();
  }),
);
document.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]");
  if (action) {
    const target = action.dataset.action;
    if (target === "student") {
      openTab("students");
      openStudentEditor();
    }
    if (target === "faculty") {
      openTab("faculty");
      openFacultyEditor();
    }
    if (target === "offering") {
      openTab("courses");
      setCourseView("offerings");
      openOfferingEditor();
    }
    if (target === "course") {
      openTab("courses");
      openSubjectEditor();
    }
    if (target === "event") {
      openTab("settings");
      openEventEditor();
      return;
    }
    if (target === "schedule") {
      openTab("courses");
      setCourseView("schedules");
      openScheduleEditor();
      return;
    }
    if (target === "report") {
      if (!students.length) return showToast("There is no student attendance data to export.");
      try {
        AttendIQCsv.download("attendiq-institution-attendance-report.csv", [
          ["Name", "Email", "Roll number", "Program", "Attendance %", "Status"],
          ...students.map(function (student) {
            return [student.name, student.email, student.roll, student.dept, student.attendance, student.attendance < settings.threshold ? "Warned" : "Active"];
          }),
        ]);
        showToast("Attendance report downloaded.");
      } catch (error) {
        showToast(error.message);
      }
    }
    if (target === "notify") openNotificationComposer();
    if (target === "reset") {
      if (window.AttendIQDemoMode === true) return showToast("Application reset is available only in live mode.");
      $("#resetForm").reset();
      $("#resetEmail").value = activeAdminEmail;
      $("#resetDialog").showModal();
      $("#resetPassword").focus();
    }
    if (target === "archive")
      showToast("Archive requires backend confirmation.");
  }
  const editButton = event.target.closest("[data-edit-student]");
  if (editButton) {
    const student = students.find((item) => item.id === editButton.dataset.editStudent);
    if (student) openStudentEditor(student);
    return;
  }
  const editFacultyButton = event.target.closest("[data-edit-faculty]");
  if (editFacultyButton) {
    const member = faculty.find((item) => item.id === editFacultyButton.dataset.editFaculty);
    if (member) openFacultyEditor(member);
    return;
  }
  const archiveFacultyButton = event.target.closest("[data-archive-faculty]");
  if (archiveFacultyButton) {
    const member = faculty.find((item) => item.id === archiveFacultyButton.dataset.archiveFaculty);
    if (!member || !window.confirm(`Archive ${member.name}? The linked login will be removed; the faculty record and historical data will be preserved.`)) return;
    const result = await AttendIQSupabase.archiveFaculty(member.id, member.profile_id);
    if (!result.ok) return showToast(result.error);
    await Promise.all([loadAdminFaculty(), loadUsers()]);
    showToast(`${member.name} archived.`);
    return;
  }
  const archiveButton = event.target.closest("[data-archive-student]");
  if (archiveButton) {
    const student = students.find((item) => item.id === archiveButton.dataset.archiveStudent);
    if (!student || !window.confirm(`Archive ${student.name}? Historical attendance and leave records will be preserved.`)) return;
    const result = await AttendIQSupabase.archiveStudent(student.id);
    if (!result.ok) return showToast(result.error);
    await loadAdminStudents();
    showToast(`${student.name} archived.`);
    return;
  }
  const editOfferingButton = event.target.closest("[data-edit-offering]");
  if (editOfferingButton) {
    const offering = offerings.find((item) => item.id === editOfferingButton.dataset.editOffering);
    if (offering) openOfferingEditor(offering);
    return;
  }
  const archiveOfferingButton = event.target.closest("[data-archive-offering]");
  if (archiveOfferingButton) {
    const offering = offerings.find((item) => item.id === archiveOfferingButton.dataset.archiveOffering);
    if (!offering || !window.confirm("Archive this course offering? Existing attendance history will be preserved.")) return;
    const result = await AttendIQSupabase.archiveCourseOffering(offering.id);
    if (!result.ok) return showToast(result.error);
    await loadAdminCourses();
    showToast("Course offering archived.");
    return;
  }
  const restoreOfferingButton = event.target.closest("[data-restore-offering]");
  if (restoreOfferingButton) {
    const offering = offerings.find((item) => item.id === restoreOfferingButton.dataset.restoreOffering);
    if (!offering) return;
    const result = await AttendIQSupabase.updateCourseOffering({ id: offering.id, teacher_id: offering.teacher_id, status: "active" });
    if (!result.ok) return showToast(result.error);
    await loadAdminCourses();
    showToast("Course offering restored.");
    return;
  }
  const editSubjectButton = event.target.closest("[data-edit-subject]");
  if (editSubjectButton) {
    const subject = courses.find((item) => item.code === editSubjectButton.dataset.editSubject);
    if (subject) openSubjectEditor(subject);
    return;
  }
  const archiveSubjectButton = event.target.closest("[data-archive-subject]");
  if (archiveSubjectButton) {
    const subject = courses.find((item) => item.code === archiveSubjectButton.dataset.archiveSubject);
    if (!subject || !window.confirm(`Archive ${subject.code}? Historical attendance and course-offering records will be preserved.`)) return;
    const result = await AttendIQSupabase.archiveSubject(subject.code);
    if (!result.ok) return showToast(result.error);
    await loadAdminCourses();
    showToast(`${subject.code} archived.`);
    return;
  }
  const restoreSubjectButton = event.target.closest("[data-restore-subject]");
  if (restoreSubjectButton) {
    const subject = courses.find((item) => item.code === restoreSubjectButton.dataset.restoreSubject);
    if (!subject) return;
    const result = await AttendIQSupabase.updateSubject({
      code: subject.code,
      name: subject.name,
      semester: subject.semester,
      program: subject.program,
      credits: subject.credits,
      course_type: subject.course_type,
      active: true,
    });
    if (!result.ok) return showToast(result.error);
    await loadAdminCourses();
    showToast(`${subject.code} restored.`);
    return;
  }
  const editEventButton = event.target.closest("[data-edit-event]");
  if (editEventButton) {
    const eventRow = academicEvents.find((item) => item.id === editEventButton.dataset.editEvent);
    if (eventRow) openEventEditor(eventRow);
    return;
  }
  const archiveEventButton = event.target.closest("[data-archive-event]");
  if (archiveEventButton) {
    const eventRow = academicEvents.find((item) => item.id === archiveEventButton.dataset.archiveEvent);
    if (!eventRow || !window.confirm(`Archive ${eventRow.title}? The calendar entry will be preserved.`)) return;
    const result = await AttendIQSupabase.archiveAcademicEvent(eventRow.id);
    if (!result.ok) return showToast(result.error);
    await loadAdminCourses();
    showToast("Academic event archived.");
    return;
  }
  const restoreEventButton = event.target.closest("[data-restore-event]");
  if (restoreEventButton) {
    const eventRow = academicEvents.find((item) => item.id === restoreEventButton.dataset.restoreEvent);
    if (!eventRow) return;
    const result = await AttendIQSupabase.updateAcademicEvent({ ...eventRow, status: "active" });
    if (!result.ok) return showToast(result.error);
    await loadAdminCourses();
    showToast("Academic event restored.");
    return;
  }
  const editScheduleButton = event.target.closest("[data-edit-schedule]");
  if (editScheduleButton) {
    const schedule = classSchedules.find((item) => item.id === editScheduleButton.dataset.editSchedule);
    if (schedule) openScheduleEditor(schedule);
    return;
  }
  const archiveScheduleButton = event.target.closest("[data-archive-schedule]");
  if (archiveScheduleButton) {
    const schedule = classSchedules.find((item) => item.id === archiveScheduleButton.dataset.archiveSchedule);
    if (!schedule || !window.confirm("Archive this class schedule? Existing attendance history will be preserved.")) return;
    const result = await AttendIQSupabase.archiveClassSchedule(schedule.id);
    if (!result.ok) return showToast(result.error);
    await loadAdminCourses();
    showToast("Class schedule archived.");
    return;
  }
  const restoreScheduleButton = event.target.closest("[data-restore-schedule]");
  if (restoreScheduleButton) {
    const schedule = classSchedules.find((item) => item.id === restoreScheduleButton.dataset.restoreSchedule);
    if (!schedule) return;
    const result = await AttendIQSupabase.updateClassSchedule({ ...schedule, status: "active" });
    if (!result.ok) return showToast(result.error);
    await loadAdminCourses();
    showToast("Class schedule restored.");
    return;
  }
  const leaveButton = event.target.closest("[data-leave]");
  if (leaveButton) {
    const comment = window.prompt("Optional reviewer note:", "") || "";
    AttendIQSupabase.reviewLeave(leaveButton.dataset.leave, leaveButton.dataset.status, comment).then(function (result) {
      if (!result.ok) return showToast(result.error);
      showToast(`Leave request ${leaveButton.dataset.status}.`);
      return loadAdminLeaves();
    });
    return;
  }
  const documentButton = event.target.closest("[data-review-document]");
  if (documentButton) {
    AttendIQSupabase.getLeaveDocumentUrl(documentButton.dataset.reviewDocument).then(function (result) {
      if (!result.ok) return showToast(result.error);
      window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
    });
  }
});
$("#threshold").addEventListener("input", (event) => {
  $("#thresholdValue").textContent = `${event.target.value}%`;
  $("#thresholdCopy").textContent = `${event.target.value}%`;
});
$("#notifySwitch").addEventListener("click", (event) => {
  const enabled = event.currentTarget.classList.toggle("on");
  event.currentTarget.setAttribute("aria-pressed", String(enabled));
});
$("#saveSettings").addEventListener("click", async () => {
  const result = await AttendIQSupabase.saveSettings({
    threshold: Number($("#threshold").value),
  });
  if (!result.ok) return showToast(result.error);
  settings = result.data;
  renderThreshold();
  renderStudents();
  showToast("Attendance threshold saved.");
});
$("#headerAction").addEventListener("click", () =>
  showToast("This form will connect to the backend."),
);

// Reflect the signed-in administrator in the topbar and support sign-out.
if (session) {
  $("#profileName").textContent = session.name;
  $("#userAvatar").textContent = session.name
    .split(" ")
    .filter((part) => !part.endsWith("."))
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
$("#signOut").addEventListener("click", async (event) => {
  event.preventDefault();
  await AttendIQSupabase.signOut();
  location.href = "../login/login.html";
});

  renderStudents();
  renderFaculty();
  renderCourses();
  renderOfferings();
  renderLeaves();
  renderLeaves("#dashboardRequests", true);
  renderThreshold();
  return Promise.all([
    loadUsers(),
    loadAdminFaculty(),
    loadAdminLeaves(),
    loadAdminStudents(),
    loadAdminCourses(),
  ]);
  });
}
