// Access control: wait for the verified Supabase profile before initializing.
const PORTAL_ROLE = "admin";
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
    let settings = result.data;

// Demo records used by the administrator portal before backend integration.
const students = [
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

const faculty = [
  [
    "Dr. Priya Mehta",
    "FAC001",
    "BSc CSIT",
    "Advanced Java Programming",
    "6",
    "Active",
  ],
  [
    "Prof. Arjun Sharma",
    "FAC002",
    "BSc CSIT",
    "Data Warehousing and Data Mining",
    "5",
    "Active",
  ],
  [
    "Dr. Sunita Rao",
    "FAC003",
    "BSc CSIT",
    "Principles of Management",
    "4",
    "Active",
  ],
  ["Prof. Rahul Gupta", "FAC004", "BSc CSIT", "Project Work", "6", "Active"],
  [
    "Dr. Neha Verma",
    "FAC005",
    "BSc CSIT",
    "Software Project Management",
    "3",
    "On leave",
  ],
];

const courses = [
  ["CSC419", "Advanced Java Programming", "Dr. Priya Mehta", 42, 90],
  ["CSC420", "Data Warehousing and Data Mining", "Prof. Arjun Sharma", 40, 85],
  ["CSC421", "Principles of Management", "Dr. Sunita Rao", 38, 73],
  ["CSC422", "Project Work", "Prof. Rahul Gupta", 44, 93],
  ["CSC425", "Software Project Management", "Dr. Neha Verma", 36, 83],
];

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

function statusBadge(status) {
  return `<span class="status status-${status.toLowerCase().replace(" ", "-")}">${status}</span>`;
}

// Render the student, faculty, and course management views.
function renderStudents(query = "") {
  const normalized = query.toLowerCase();
  $("#studentRows").innerHTML = students
    .filter((student) =>
      `${student.name} ${student.roll}`.toLowerCase().includes(normalized),
    )
    .map((student) => {
      // The warned status is derived from the administrator's threshold.
      const warned = student.attendance < settings.threshold;
      return `<tr><td><strong>${student.name}</strong><small>${student.email}</small></td><td class="mono">${student.roll}</td><td>${student.dept}</td><td><strong class="${warned ? "danger-text" : ""}">${student.attendance}%</strong></td><td>${statusBadge(warned ? "Warned" : "Active")}</td><td><button class="row-action" type="button">•••</button></td></tr>`;
    })
    .join("");
}

function renderFaculty() {
  $("#facultyRows").innerHTML = faculty
    .map(
      (member) =>
        `<tr><td><strong>${member[0]}</strong><small>${member[1].toLowerCase()}@kct.edu.np</small></td><td class="mono">${member[1]}</td><td>${member[2]}</td><td>${member[3]}</td><td>${member[4]}</td><td>${statusBadge(member[5])}</td></tr>`,
    )
    .join("");
}

function renderCourses() {
  $("#courseCards").innerHTML = courses
    .map(
      (course) =>
        `<article class="course-card"><div class="course-code">${course[0]}</div><h3>${course[1]}</h3><p>${course[2]}</p><div class="course-meta"><span>${course[3]} classes</span><strong class="${course[4] < 75 ? "danger-text" : "positive"}">${course[4]}% avg.</strong></div><div class="progress"><i style="width:${course[4]}%"></i></div></article>`,
    )
    .join("");
}

// Build leave-request rows with approve, reject, and undo actions.
function requestMarkup(request, actions = true) {
  const actionMarkup =
    actions && request.status === "pending"
      ? `<div class="request-actions"><button class="approve" data-leave="${request.id}" data-status="approved">Approve</button><button class="reject" data-leave="${request.id}" data-status="rejected">Reject</button></div>`
      : `<button class="undo" data-leave="${request.id}" data-status="pending">Undo</button>`;
  return `<div class="request-row"><div class="request-main"><span class="request-avatar">${request.name
    .split(" ")
    .map((part) => part[0])
    .join(
      "",
    )}</span><div><div class="request-title"><strong>${request.name}</strong><span class="mono">${request.roll}</span>${statusBadge(request.status)}</div><p>${request.type} · ${request.dates} · ${request.reason}</p>${request.doc ? '<small class="document">✓ Document submitted</small>' : ""}</div></div>${actionMarkup}</div>`;
}

function renderLeaves(target = "#leaveRequests", limit = false) {
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
        type: row.type,
        dates: formatLeaveDates(row),
        reason: row.reason,
        status: row.status,
        doc: !!row.document_url,
      };
    });
    renderLeaves();
    renderLeaves("#dashboardRequests", true);
  });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2600);
}

// Keep the rules form and the at-risk dashboard metric aligned with the
// shared attendance settings.
function renderThreshold() {
  $("#threshold").value = settings.threshold;
  $("#thresholdValue").textContent = `${settings.threshold}%`;
  $("#thresholdCopy").textContent = `${settings.threshold}%`;
  $("#atRiskCopy").textContent = `Below ${settings.threshold}% threshold`;
  $("#atRiskCount").textContent = students.filter(
    (student) => student.attendance < settings.threshold,
  ).length;
}

// Role labels shared by the user table and its feedback messages.
const ROLE_LABELS = {
  student: "Student",
  teacher: "Teacher",
  admin: "Administrator",
};

// Draw the account list with a role selector and remove control per user.
function renderUsers() {
  $("#userRows").innerHTML = AttendIQ.getUsers()
    .map(
      (user) =>
        `<tr><td><strong>${user.name}</strong><small>${user.email}</small></td><td><select class="role-select" data-user-id="${user.id}" aria-label="Role for ${user.name}">${AttendIQ.ROLES.map((role) => `<option value="${role}"${role === user.role ? " selected" : ""}>${ROLE_LABELS[role]}</option>`).join("")}</select></td><td><button class="user-remove" type="button" data-remove-user="${user.id}">Remove</button></td></tr>`,
    )
    .join("");
}

// Create accounts from the settings form, reporting validation errors.
$("#userForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const result = AttendIQ.addUser({
    name: $("#newUserName").value,
    email: $("#newUserEmail").value,
    role: $("#newUserRole").value,
    password: $("#newUserPassword").value,
  });
  if (!result.ok) return showToast(result.error);
  event.target.reset();
  renderUsers();
  showToast(`${result.user.name} added as ${ROLE_LABELS[result.user.role]}.`);
});

// Delegated events update roles and remove accounts from rendered rows.
document.addEventListener("change", (event) => {
  const select = event.target.closest("[data-user-id]");
  if (!select) return;
  const result = AttendIQ.assignRole(select.dataset.userId, select.value);
  if (!result.ok) {
    showToast(result.error);
    renderUsers();
    return;
  }
  showToast(`${result.user.name} is now ${ROLE_LABELS[result.user.role]}.`);
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-user]");
  if (!button) return;
  if (session && button.dataset.removeUser === session.id)
    return showToast("You cannot remove your own account.");
  const user = AttendIQ.getUsers().find(
    (item) => item.id === button.dataset.removeUser,
  );
  if (!user) return;
  if (!window.confirm(`Remove the account for ${user.name}?`)) return;
  AttendIQ.removeUser(user.id);
  renderUsers();
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
$("#studentSearch").addEventListener("input", (event) =>
  renderStudents(event.target.value),
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
document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (action) {
    const target = action.dataset.action;
    if (target === "student") openTab("students");
    if (target === "faculty") openTab("faculty");
    if (target === "course") openTab("courses");
    if (target === "report")
      showToast("Attendance report is ready to download.");
    if (target === "notify") showToast("Notification composer opened.");
    if (target === "reset") showToast("Reset requires backend confirmation.");
    if (target === "archive")
      showToast("Archive requires backend confirmation.");
  }
  const leaveButton = event.target.closest("[data-leave]");
  if (leaveButton) {
    AttendIQSupabase.reviewLeave(leaveButton.dataset.leave, leaveButton.dataset.status).then(function (result) {
      if (!result.ok) return showToast(result.error);
      showToast(`Leave request ${leaveButton.dataset.status}.`);
      return loadAdminLeaves();
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
  renderLeaves();
  renderLeaves("#dashboardRequests", true);
  renderUsers();
  renderThreshold();
  return loadAdminLeaves();
  });
}
