// Access control: wait for the verified Supabase profile before initializing.
const PORTAL_ROLE = "teacher";
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
  // Load the shared threshold from Supabase before rendering the portal.
  return AttendIQSupabase.getSettings().then(function (result) {
    if (!result.ok) {
      console.error("Could not load attendance settings:", result.error);
      return;
    }
    const settings = result.data;

// Demo class roster and leave data used by the teacher portal.
const students = [
  ["Aryan Kumar", "2079CSIT042", 84, "present"],
  ["Sneha Patel", "2079CSIT043", 91, "present"],
  ["Riya Desai", "2079CSIT044", 72, "absent"],
  ["Karan Singh", "2079CSIT045", 68, "present"],
  ["Pooja Iyer", "2079CSIT046", 88, "present"],
  ["Dev Malhotra", "2079CSIT047", 55, "late"],
  ["Ananya Nair", "2079CSIT048", 79, "present"],
  ["Vivek Rao", "2079CSIT049", 94, "present"],
];
let reportRows = students.map((s) => {
  const total = 42,
    present = Math.round((total * s[2]) / 100),
    late = 1,
    absent = total - present - late;
  return { name: s[0], roll: s[1], total: total, present: present, absent: absent, late: late, percent: s[2] };
});
let leaves = [
  {
    id: 1,
    name: "Aryan Kumar",
    roll: "2079CSIT042",
    type: "Medical",
    date: "Ashadh 26 → 27, 2082",
    reason: "Fever and doctor visit",
    status: "pending",
    doc: true,
  },
  {
    id: 2,
    name: "Riya Desai",
    roll: "2079CSIT044",
    type: "Personal",
    date: "Ashadh 25, 2082",
    reason: "Family function",
    status: "pending",
    doc: false,
  },
  {
    id: 3,
    name: "Dev Malhotra",
    roll: "2079CSIT047",
    type: "Medical",
    date: "Ashadh 23 → 24, 2082",
    reason: "Hospital visit",
    status: "approved",
    doc: true,
  },
];
// Attendance is kept in memory until the portal is connected to a backend.
let attendance = Object.fromEntries(students.map((s) => [s[1], s[3]]));
let markingStudents = students.map((s) => ({ id: s[1], name: s[0], roll: s[1] }));
let studentDirectory = {};
let classSchedules = [];
let currentSession = null;
let attendanceReady = false;

// Shared DOM helpers.
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)],
  h = AttendIQUtils.escapeHtml;

// Display temporary feedback for demo actions.
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("visible");
  setTimeout(() => $("#toast").classList.remove("visible"), 2300);
}

// Create a consistent status badge for reports and leave requests.
function status(s) {
  const value = String(s || "Unknown");
  return `<span class="status status-${h(value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))}">${h(value)}</span>`;
}

// Render each student's selectable attendance state.
function renderAttendance() {
  $("#attendanceRows").innerHTML = markingStudents
    .map(
      (student) => {
        const locked = window.AttendIQDb && !(currentSession && currentSession.status === "open");
        return `<div class="attendance-row"><div class="student"><span class="student-avatar">${h(student.name
          .split(" ")
          .map((part) => part[0])
          .join(""))}</span><strong>${h(student.name)}<small>${h(student.roll)}</small></strong></div><div class="attendance-options"><button${locked ? " disabled" : ""} class="${attendance[student.id] === "present" ? "chosen present" : ""}" data-student="${h(student.id)}" data-status="present">Present</button><button${locked ? " disabled" : ""} class="${attendance[student.id] === "absent" ? "chosen absent" : ""}" data-student="${h(student.id)}" data-status="absent">Absent</button><button${locked ? " disabled" : ""} class="${attendance[student.id] === "late" ? "chosen late" : ""}" data-student="${h(student.id)}" data-status="late">Late</button></div></div>`;
      },
    )
    .join("");
  updateCounts();
}

// Keep the attendance summary synchronized with selected statuses.
function updateCounts() {
  const values = Object.values(attendance);
  $("#presentCount").textContent = values.filter((x) => x === "present").length;
  $("#absentCount").textContent = values.filter((x) => x === "absent").length;
  $("#lateCount").textContent = values.filter((x) => x === "late").length;
}

function displayStatus(value) {
  return String(value || "Present").toLowerCase();
}

function databaseStatus(value) {
  const normalized = String(value || "present").toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function populateSubjectOptions(subjects) {
  const select = $("#markSubject");
  select.replaceChildren();
  subjects.forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject.course_offering_id;
    option.dataset.subjectCode = subject.code;
    option.textContent = subject.code + " · " + subject.name;
    select.appendChild(option);
  });
}

function scheduleSubject(schedule) {
  const offering = schedule && schedule.course_offerings;
  return Array.isArray(offering) ? offering[0] : offering;
}

function populateScheduleOptions(schedules) {
  const select = $("#markSchedule");
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = schedules.length ? "Select a schedule" : "No schedules assigned";
  select.appendChild(empty);
  schedules.forEach((schedule) => {
    const offering = scheduleSubject(schedule);
    const subject = offering && (Array.isArray(offering.subjects) ? offering.subjects[0] : offering.subjects);
    const section = offering && (Array.isArray(offering.sections) ? offering.sections[0] : offering.sections);
    const option = document.createElement("option");
    option.value = schedule.id;
    option.dataset.offeringId = schedule.course_offering_id;
    option.dataset.subjectCode = subject && subject.code || "";
    option.textContent = `${subject && subject.code || "Course"} · ${subject && subject.name || "Scheduled class"} · ${section && section.name || "Section"} · ${schedule.start_time}-${schedule.end_time}`;
    select.appendChild(option);
  });
}

function updateSessionUi() {
  const open = Boolean(currentSession && currentSession.status === "open");
  const statusElement = $("#sessionStatus");
  const openButton = $("#openSession");
  const closeButton = $("#closeSession");
  if (currentSession) {
    statusElement.textContent = `Session ${currentSession.status} · ${currentSession.date_bs || currentSession.date_ad}`;
    statusElement.className = open ? "session-status open" : "session-status closed";
  } else {
    statusElement.textContent = "No attendance session open.";
    statusElement.className = "session-status";
  }
  openButton.hidden = Boolean(currentSession);
  closeButton.hidden = !open;
  $("#saveAttendance").disabled = window.AttendIQDb && !open;
}

function resetSessionState() {
  currentSession = null;
  updateSessionUi();
}

function loadSelectedAttendance() {
  const dateAd = $("#markDate").value;
  const selectedSchedule = $("#markSchedule").value;
  if (!dateAd || !selectedSchedule) return Promise.resolve();
  const schedule = classSchedules.find((item) => item.id === selectedSchedule);
  const offering = scheduleSubject(schedule);
  const courseOfferingId = offering && offering.id || schedule.course_offering_id;
  if (!courseOfferingId) return Promise.resolve();
  const subjectCode = offering && offering.subject_code || (selectedSchedule && $("#markSchedule").selectedOptions[0] && $("#markSchedule").selectedOptions[0].dataset.subjectCode);
  if (!subjectCode) return Promise.resolve();
  $("#markSubject").value = courseOfferingId;

  return AttendIQSupabase.getTeacherAttendanceSessions({ course_offering_id: courseOfferingId, date_ad: dateAd }).then(function (sessionResult) {
    if (!sessionResult.ok) return toast(sessionResult.error);
    currentSession = sessionResult.data.find((session) => session.schedule_id === selectedSchedule) || null;
    updateSessionUi();
    const attendanceFilter = currentSession
      ? { attendance_session_id: currentSession.id }
      : { date_ad: dateAd, subject_code: subjectCode, course_offering_id: courseOfferingId };
    return AttendIQSupabase.getTeacherAttendance(attendanceFilter).then(function (result) {
      if (!result.ok) {
        attendanceReady = false;
        return toast(result.error);
      }
      const existing = {};
      result.data.forEach((record) => { existing[record.student_id] = displayStatus(record.status); });
      attendance = Object.fromEntries(markingStudents.map((student) => [student.id, existing[student.id] || "present"]));
      attendanceReady = true;
      renderAttendance();
    });
  });
}

function loadTeacherData() {
  if (!window.AttendIQDb) {
    attendanceReady = false;
    populateScheduleOptions([]);
    updateSessionUi();
    renderAttendance();
    return Promise.resolve();
  }
  return Promise.all([
    AttendIQSupabase.getTeacherStudents(),
    AttendIQSupabase.getTeacherSubjects(),
    AttendIQSupabase.getTeacherClassSchedules(),
  ]).then(function (results) {
    const studentsResult = results[0];
    const subjectsResult = results[1];
    const schedulesResult = results[2];
    if (!studentsResult.ok || !subjectsResult.ok || !schedulesResult.ok) {
      attendanceReady = false;
      toast(studentsResult.error || subjectsResult.error || schedulesResult.error || "Attendance data could not be loaded.");
      return;
    }
    markingStudents = studentsResult.data.map((student) => ({
      id: student.id,
      name: student.name,
      roll: student.roll,
    }));
    studentDirectory = Object.fromEntries(
      studentsResult.data.map((student) => [student.id, { name: student.name, roll: student.roll }]),
    );
    classSchedules = schedulesResult.data;
    populateSubjectOptions(subjectsResult.data);
    populateScheduleOptions(classSchedules);
    updateSessionUi();
    if (!classSchedules.length) {
      attendanceReady = false;
      resetSessionState();
      toast("No active class schedules are assigned. Ask an administrator to add one.");
      renderAttendance();
      return;
    }
    if (!subjectsResult.data.length) {
      attendanceReady = false;
      resetSessionState();
      toast("No subjects are assigned to this teacher account.");
      renderAttendance();
      return;
    }
    return loadSelectedAttendance();
  });
}

// Render the semester attendance report.
function renderReports() {
  $("#reportRows").innerHTML = reportRows
    .map((row) => {
      return `<tr><td class="mono">${h(row.roll)}</td><td><strong>${h(row.name)}</strong></td><td>${h(row.total)}</td><td class="positive">${h(row.present)}</td><td class="danger">${h(row.absent)}</td><td class="late-text">${h(row.late)}</td><td><div class="progress"><i class="${row.percent < settings.threshold ? "red-bar" : ""}" style="width:${Math.min(100, Math.max(0, Number(row.percent) || 0))}%"></i></div><b>${h(row.percent)}%</b></td><td>${status(row.percent < settings.threshold ? "at-risk" : "safe")}</td></tr>`;
    })
    .join("");
}

// Build the semester report from all marks visible to this teacher.
function loadTeacherReports() {
  if (!window.AttendIQDb) {
    renderReports();
    return Promise.resolve();
  }
  return AttendIQSupabase.getTeacherAttendance().then(function (result) {
    if (!result.ok) {
      toast(result.error);
      return;
    }
    const totals = {};
    result.data.forEach(function (row) {
      const entry = totals[row.student_id] || { total: 0, present: 0, absent: 0, late: 0 };
      entry.total += 1;
      if (row.status === "Present") entry.present += 1;
      if (row.status === "Absent") entry.absent += 1;
      if (row.status === "Late") entry.late += 1;
      totals[row.student_id] = entry;
    });
    reportRows = markingStudents.map(function (student) {
      const entry = totals[student.id] || { total: 0, present: 0, absent: 0, late: 0 };
      return {
        name: student.name,
        roll: student.roll,
        total: entry.total,
        present: entry.present,
        absent: entry.absent,
        late: entry.late,
        percent: entry.total ? Math.round((entry.present / entry.total) * 100) : 0,
      };
    });
    renderReports();
  });
}

// Render leave requests with approve, reject, and undo controls.
function renderLeaves() {
  $("#leaveRows").innerHTML = leaves
    .map(
      (l) =>
        `<div class="leave-row"><div class="leave-main"><span class="student-avatar">${h(l.name
          .split(" ")
          .map((x) => x[0])
          .join(""))}</span><div><div><strong>${h(l.name)}</strong> <small class="mono">${h(l.roll)}</small> ${status(l.status)}</div><p>${h(l.type)} · ${h(l.date)} · ${h(l.reason)}</p>${l.doc ? '<small class="document">✓ Supporting document attached</small>' : ""}</div></div>${l.status === "pending" ? `<div class="leave-actions"><button class="approve" data-leave="${h(l.id)}" data-state="approved">Approve</button><button class="reject" data-leave="${h(l.id)}" data-state="rejected">Reject</button></div>` : `<button class="undo" data-leave="${h(l.id)}" data-state="pending">Undo</button>`}</div>`,
    )
    .join("");
}

function formatLeaveDates(row) {
  return row.from_date === row.to_date
    ? row.from_date
    : row.from_date + " → " + row.to_date;
}

// Load real leave requests and join them to the student roster by UUID.
function loadTeacherLeaves() {
  if (!window.AttendIQDb) {
    renderLeaves();
    return Promise.resolve();
  }
  return AttendIQSupabase.getTeacherLeaves().then(function (result) {
    if (!result.ok) {
      toast(result.error);
      return;
    }
    leaves = result.data.map(function (row) {
      const student = studentDirectory[row.student_id] || { name: "Unknown student", roll: "—" };
      return {
        id: row.id,
        name: student.name,
        roll: student.roll,
        type: row.type,
        date: formatLeaveDates(row),
        reason: row.reason,
        status: row.status,
        doc: !!row.document_url,
      };
    });
    renderLeaves();
  });
}

// Keep the at-risk metric, the section heading, and the risk list aligned
// with the shared attendance threshold.
function renderThreshold() {
  const atRisk = students
    .filter((student) => student[2] < settings.threshold)
    .sort((a, b) => a[2] - b[2]);
  $("#belowLabel").textContent = `Below ${settings.threshold}%`;
  $("#belowCount").textContent = atRisk.length;
  $("#riskLabel").textContent = `(<${settings.threshold}%)`;
  $("#riskList").innerHTML = atRisk
    .map(
      (student) =>
        `<div><span class="student-avatar">${h(student[0]
          .split(" ")
          .map((part) => part[0])
          .join(""))}</span><strong>${h(student[0])}<small>${h(student[1])}</small></strong><b class="danger">${h(student[2])}%</b><button class="link">Notify</button></div>`,
    )
    .join("");
}

// Switch between the teacher portal views.
function openTab(tab) {
  $$(".nav-item").forEach((n) =>
    n.classList.toggle("active", n.dataset.tab === tab),
  );
  $$(".panel").forEach((p) =>
    p.classList.toggle("active", p.dataset.panel === tab),
  );
  const titles = {
    dashboard: "Teacher Dashboard",
    mark: "Mark Attendance",
    reports: "Class Reports",
    leaves: "Leave Requests",
  };
  $("#title").textContent = titles[tab];
  $("#crumb").textContent =
    tab === "dashboard" ? "OVERVIEW" : tab.toUpperCase();
  $("#sidebar").classList.remove("open");
}

function openAttendanceSession() {
  if (!window.AttendIQDb) return toast("Supabase is required to open a live attendance session.");
  const scheduleId = $("#markSchedule").value;
  const dateAd = $("#markDate").value;
  const dateBs = $("#markDateBs").value.trim();
  if (!scheduleId || !dateAd || !dateBs) return toast("Choose a scheduled class, AD date, and BS date.");
  const result = AttendIQSupabase.createAttendanceSession({ schedule_id: scheduleId, date_ad: dateAd, date_bs: dateBs });
  $("#openSession").disabled = true;
  return result.then(function (response) {
    $("#openSession").disabled = false;
    if (!response.ok) return toast(response.error);
    currentSession = response.data;
    updateSessionUi();
    toast("Attendance session opened.");
    return loadSelectedAttendance();
  });
}

function closeAttendanceSession() {
  if (!currentSession || currentSession.status !== "open") return toast("There is no open session to close.");
  const result = AttendIQSupabase.closeAttendanceSession(currentSession.id);
  $("#closeSession").disabled = true;
  return result.then(function (response) {
    $("#closeSession").disabled = false;
    if (!response.ok) return toast(response.error);
    currentSession = response.data;
    updateSessionUi();
    toast("Attendance session closed.");
  });
}
$$(".nav-item").forEach((n) =>
  n.addEventListener("click", () => openTab(n.dataset.tab)),
);
$$("[data-tab-link]").forEach((n) =>
  n.addEventListener("click", () => openTab(n.dataset.tabLink)),
);
$("#menuButton").addEventListener("click", () =>
  $("#sidebar").classList.toggle("open"),
);
document.addEventListener("click", (e) => {
  const option = e.target.closest("[data-student]");
  if (option) {
    attendance[option.dataset.student] = option.dataset.status;
    renderAttendance();
  }
  const leave = e.target.closest("[data-leave]");
  if (leave) {
    AttendIQSupabase.reviewLeave(leave.dataset.leave, leave.dataset.state).then(function (result) {
      if (!result.ok) return toast(result.error);
      toast("Leave request updated.");
      return loadTeacherLeaves();
    });
  }
});
  $("#markAll").addEventListener("click", () => {
    markingStudents.forEach((student) => (attendance[student.id] = "present"));
    renderAttendance();
  });
  $("#markDate").addEventListener("change", function () {
    currentSession = null;
    updateSessionUi();
    loadSelectedAttendance();
  });
  $("#markDateBs").addEventListener("change", function () {
    currentSession = null;
    updateSessionUi();
  });
  $("#markSchedule").addEventListener("change", function () {
    currentSession = null;
    updateSessionUi();
    loadSelectedAttendance();
  });
  $("#openSession").addEventListener("click", openAttendanceSession);
  $("#closeSession").addEventListener("click", closeAttendanceSession);
  $("#saveAttendance").addEventListener("click", async () => {
    if (!window.AttendIQDb) {
      toast("Supabase is not configured; attendance remains in the local demo.");
      return;
    }
    if (!currentSession || currentSession.status !== "open") return toast("Open a scheduled attendance session before saving.");
    const records = markingStudents.map((student) => ({
      student_id: student.id,
      status: databaseStatus(attendance[student.id]),
    }));
    const result = await AttendIQSupabase.saveAttendanceSession({ session_id: currentSession.id, records: records });
    if (!result.ok) return toast(result.error);
    $("#saved").textContent = "Saved just now";
    $("#saved").classList.add("is-saved");
    toast("Attendance saved successfully.");
  });
$("#exportReport").addEventListener("click", () => {
  if (!reportRows.length) return toast("There is no report data to export.");
  try {
    AttendIQCsv.download("attendiq-attendance-report.csv", [
      ["Roll number", "Student", "Total", "Present", "Absent", "Late", "Attendance %", "Status"],
      ...reportRows.map(function (row) {
        return [row.roll, row.name, row.total, row.present, row.absent, row.late, row.percent, row.percent < settings.threshold ? "At risk" : "Safe"];
      }),
    ]);
    toast("CSV report downloaded.");
  } catch (error) {
    toast(error.message);
  }
});
// Reflect the signed-in teacher in the topbar and support sign-out.
if (session) {
  $("#userName").textContent = session.name;
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

  renderReports();
  renderLeaves();
  renderThreshold();
  return loadTeacherData().then(loadTeacherLeaves).then(loadTeacherReports);
  });
}
