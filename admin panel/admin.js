// Access control: only signed-in administrators may use this portal.
const session = AttendIQ.getSession();
if (!session) {
  location.replace("../login/login.html");
} else if (session.role !== "admin") {
  location.replace("../" + AttendIQ.ROLE_PANELS[session.role]);
}

// Demo records used by the administrator portal before backend integration.
const students = [
  {
    name: "Aryan Kumar",
    email: "aryan.k@univ.edu",
    roll: "2021CS0042",
    dept: "CSE",
    attendance: 84,
    status: "Active",
  },
  {
    name: "Sneha Patel",
    email: "sneha.p@univ.edu",
    roll: "2021CS0043",
    dept: "CSE",
    attendance: 91,
    status: "Active",
  },
  {
    name: "Riya Desai",
    email: "riya.d@univ.edu",
    roll: "2021CS0044",
    dept: "CSE",
    attendance: 72,
    status: "Warned",
  },
  {
    name: "Karan Singh",
    email: "karan.s@univ.edu",
    roll: "2021CS0045",
    dept: "CSE",
    attendance: 68,
    status: "Warned",
  },
  {
    name: "Pooja Iyer",
    email: "pooja.i@univ.edu",
    roll: "2021CS0046",
    dept: "CSE",
    attendance: 88,
    status: "Active",
  },
  {
    name: "Ananya Nair",
    email: "ananya.n@univ.edu",
    roll: "2021CS0047",
    dept: "ECE",
    attendance: 79,
    status: "Active",
  },
];

const faculty = [
  [
    "Dr. Priya Mehta",
    "FAC001",
    "CSE",
    "Data Structures & Algorithms",
    "6",
    "Active",
  ],
  ["Prof. Arjun Sharma", "FAC002", "CSE", "Operating Systems", "5", "Active"],
  ["Dr. Sunita Rao", "FAC003", "CSE", "Database Management", "4", "Active"],
  ["Prof. Rahul Gupta", "FAC004", "CSE", "Computer Networks", "6", "Active"],
  ["Dr. Neha Verma", "FAC005", "CSE", "Software Engineering", "3", "On leave"],
];

const courses = [
  ["CS401", "Data Structures & Algorithms", "Dr. Priya Mehta", 42, 90],
  ["CS402", "Operating Systems", "Prof. Arjun Sharma", 40, 85],
  ["CS403", "Database Management", "Dr. Sunita Rao", 38, 73],
  ["CS404", "Computer Networks", "Prof. Rahul Gupta", 44, 93],
  ["CS405", "Software Engineering", "Dr. Neha Verma", 36, 83],
];

const leaves = [
  {
    id: 1,
    name: "Aryan Kumar",
    roll: "2021CS0042",
    type: "Medical",
    dates: "Jul 10 → Jul 11",
    reason: "Fever and doctor visit",
    status: "pending",
    doc: true,
  },
  {
    id: 2,
    name: "Riya Desai",
    roll: "2021CS0044",
    type: "Personal",
    dates: "Jul 09",
    reason: "Family function",
    status: "pending",
    doc: false,
  },
  {
    id: 3,
    name: "Dev Malhotra",
    roll: "2021CS0047",
    type: "Medical",
    dates: "Jul 07 → Jul 08",
    reason: "Hospital visit",
    status: "approved",
    doc: true,
  },
  {
    id: 4,
    name: "Karan Singh",
    roll: "2021CS0045",
    type: "Personal",
    dates: "Jul 05",
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
    .map(
      (student) =>
        `<tr><td><strong>${student.name}</strong><small>${student.email}</small></td><td class="mono">${student.roll}</td><td>${student.dept}</td><td><strong class="${student.attendance < 75 ? "danger-text" : ""}">${student.attendance}%</strong></td><td>${statusBadge(student.status)}</td><td><button class="row-action" type="button">•••</button></td></tr>`,
    )
    .join("");
}

function renderFaculty() {
  $("#facultyRows").innerHTML = faculty
    .map(
      (member) =>
        `<tr><td><strong>${member[0]}</strong><small>${member[1].toLowerCase()}@univ.edu</small></td><td class="mono">${member[1]}</td><td>${member[2]}</td><td>${member[3]}</td><td>${member[4]}</td><td>${statusBadge(member[5])}</td></tr>`,
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

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2600);
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
    const leave = leaves.find(
      (item) => item.id === Number(leaveButton.dataset.leave),
    );
    leave.status = leaveButton.dataset.status;
    renderLeaves();
    renderLeaves("#dashboardRequests", true);
    showToast(`Leave request ${leave.status}.`);
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
$("#saveSettings").addEventListener("click", () =>
  showToast("Settings saved for this session."),
);
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
$("#signOut").addEventListener("click", () => AttendIQ.clearSession());

renderStudents();
renderFaculty();
renderCourses();
renderLeaves();
renderLeaves("#dashboardRequests", true);
renderUsers();
