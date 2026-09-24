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
let attendanceReady = false;

// Shared DOM helpers.
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];

// Display temporary feedback for demo actions.
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("visible");
  setTimeout(() => $("#toast").classList.remove("visible"), 2300);
}

// Create a consistent status badge for reports and leave requests.
function status(s) {
  return `<span class="status status-${s}">${s}</span>`;
}

// Render each student's selectable attendance state.
function renderAttendance() {
  $("#attendanceRows").innerHTML = markingStudents
    .map(
      (student) =>
        `<div class="attendance-row"><div class="student"><span class="student-avatar">${student.name
          .split(" ")
          .map((part) => part[0])
          .join("")}</span><strong>${student.name}<small>${student.roll}</small></strong></div><div class="attendance-options"><button class="${attendance[student.id] === "present" ? "chosen present" : ""}" data-student="${student.id}" data-status="present">Present</button><button class="${attendance[student.id] === "absent" ? "chosen absent" : ""}" data-student="${student.id}" data-status="absent">Absent</button><button class="${attendance[student.id] === "late" ? "chosen late" : ""}" data-student="${student.id}" data-status="late">Late</button></div></div>`,
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
    option.value = subject.code;
    option.textContent = subject.code + " · " + subject.name;
    select.appendChild(option);
  });
}

function loadSelectedAttendance() {
  const dateAd = $("#markDate").value;
  const subjectCode = $("#markSubject").value;
  if (!dateAd || !subjectCode) return Promise.resolve();

  return AttendIQSupabase.getAttendance({ date_ad: dateAd, subject_code: subjectCode }).then(function (result) {
    if (!result.ok) {
      attendanceReady = false;
      if (window.AttendIQDb) toast(result.error);
      return;
    }
    const existing = {};
    result.data.forEach((record) => {
      existing[record.student_id] = displayStatus(record.status);
    });
    attendance = Object.fromEntries(
      markingStudents.map((student) => [student.id, existing[student.id] || "present"]),
    );
    attendanceReady = true;
    renderAttendance();
  });
}

function loadTeacherData() {
  if (!window.AttendIQDb) {
    attendanceReady = false;
    renderAttendance();
    return Promise.resolve();
  }
  return Promise.all([
    AttendIQSupabase.getStudents(),
    AttendIQSupabase.getSubjects({ teacher_id: session.id }),
  ]).then(function (results) {
    const studentsResult = results[0];
    const subjectsResult = results[1];
    if (!studentsResult.ok || !subjectsResult.ok) {
      attendanceReady = false;
      toast(studentsResult.error || subjectsResult.error || "Attendance data could not be loaded.");
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
    if (!subjectsResult.data.length) {
      attendanceReady = false;
      toast("No subjects are assigned to this teacher account.");
      return;
    }
    populateSubjectOptions(subjectsResult.data);
    return loadSelectedAttendance();
  });
}

// Render the semester attendance report.
function renderReports() {
  $("#reportRows").innerHTML = students
    .map((s) => {
      const total = 42,
        present = Math.round((total * s[2]) / 100),
        late = 1,
        absent = total - present - late;
      return `<tr><td class="mono">${s[1]}</td><td><strong>${s[0]}</strong></td><td>${total}</td><td class="positive">${present}</td><td class="danger">${absent}</td><td class="late-text">${late}</td><td><div class="progress"><i class="${s[2] < settings.threshold ? "red-bar" : ""}" style="width:${s[2]}%"></i></div><b>${s[2]}%</b></td><td>${status(s[2] < settings.threshold ? "at-risk" : "safe")}</td></tr>`;
    })
    .join("");
}

// Render leave requests with approve, reject, and undo controls.
function renderLeaves() {
  $("#leaveRows").innerHTML = leaves
    .map(
      (l) =>
        `<div class="leave-row"><div class="leave-main"><span class="student-avatar">${l.name
          .split(" ")
          .map((x) => x[0])
          .join(
            "",
          )}</span><div><div><strong>${l.name}</strong> <small class="mono">${l.roll}</small> ${status(l.status)}</div><p>${l.type} · ${l.date} · ${l.reason}</p>${l.doc ? '<small class="document">✓ Supporting document attached</small>' : ""}</div></div>${l.status === "pending" ? `<div class="leave-actions"><button class="approve" data-leave="${l.id}" data-state="approved">Approve</button><button class="reject" data-leave="${l.id}" data-state="rejected">Reject</button></div>` : `<button class="undo" data-leave="${l.id}" data-state="pending">Undo</button>`}</div>`,
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
  return AttendIQSupabase.getLeaves().then(function (result) {
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
        `<div><span class="student-avatar">${student[0]
          .split(" ")
          .map((part) => part[0])
          .join("")}</span><strong>${student[0]}<small>${student[1]}</small></strong><b class="danger">${student[2]}%</b><button class="link">Notify</button></div>`,
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

// Event delegation handles controls generated by the render functions.
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
  $("#markDate").addEventListener("change", loadSelectedAttendance);
  $("#markSubject").addEventListener("change", loadSelectedAttendance);
  $("#saveAttendance").addEventListener("click", async () => {
    if (!window.AttendIQDb) {
      toast("Supabase is not configured; attendance remains in the local demo.");
      return;
    }
    if (!attendanceReady) return toast("Attendance data is not ready yet.");

    const dateAd = $("#markDate").value;
    const dateBs = $("#markDateBs").value.trim();
    const subjectCode = $("#markSubject").value;
    if (!dateAd || !dateBs || !subjectCode) return toast("Choose a date, BS date, and subject.");

    const records = markingStudents.map((student) => ({
      student_id: student.id,
      subject_code: subjectCode,
      date_ad: dateAd,
      date_bs: dateBs,
      time: "09:00 AM",
      status: databaseStatus(attendance[student.id]),
    }));
    const result = await AttendIQSupabase.saveAttendance(records);
    if (!result.ok) return toast(result.error);
    $("#saved").textContent = "Saved just now";
    $("#saved").classList.add("is-saved");
    toast("Attendance saved successfully.");
  });
$("#exportReport").addEventListener("click", () =>
  toast("CSV report prepared."),
);
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
  return loadTeacherData().then(loadTeacherLeaves);
  });
}
