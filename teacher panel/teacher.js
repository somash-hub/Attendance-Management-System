// Demo class roster and leave data used by the teacher portal.
const students = [
  ["Aryan Kumar", "2021CS0042", 84, "present"],
  ["Sneha Patel", "2021CS0043", 91, "present"],
  ["Riya Desai", "2021CS0044", 72, "absent"],
  ["Karan Singh", "2021CS0045", 68, "present"],
  ["Pooja Iyer", "2021CS0046", 88, "present"],
  ["Dev Malhotra", "2021CS0047", 55, "late"],
  ["Ananya Nair", "2021CS0048", 79, "present"],
  ["Vivek Rao", "2021CS0049", 94, "present"],
];
const leaves = [
  {
    id: 1,
    name: "Aryan Kumar",
    roll: "2021CS0042",
    type: "Medical",
    date: "Jul 10 → Jul 11",
    reason: "Fever and doctor visit",
    status: "pending",
    doc: true,
  },
  {
    id: 2,
    name: "Riya Desai",
    roll: "2021CS0044",
    type: "Personal",
    date: "Jul 09",
    reason: "Family function",
    status: "pending",
    doc: false,
  },
  {
    id: 3,
    name: "Dev Malhotra",
    roll: "2021CS0047",
    type: "Medical",
    date: "Jul 07 → Jul 08",
    reason: "Hospital visit",
    status: "approved",
    doc: true,
  },
];
// Attendance is kept in memory until the portal is connected to a backend.
let attendance = Object.fromEntries(students.map((s) => [s[1], s[3]]));

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
  $("#attendanceRows").innerHTML = students
    .map(
      (s) =>
        `<div class="attendance-row"><div class="student"><span class="student-avatar">${s[0]
          .split(" ")
          .map((x) => x[0])
          .join(
            "",
          )}</span><strong>${s[0]}<small>${s[1]}</small></strong></div><div class="attendance-options"><button class="${attendance[s[1]] === "present" ? "chosen present" : ""}" data-student="${s[1]}" data-status="present">Present</button><button class="${attendance[s[1]] === "absent" ? "chosen absent" : ""}" data-student="${s[1]}" data-status="absent">Absent</button><button class="${attendance[s[1]] === "late" ? "chosen late" : ""}" data-student="${s[1]}" data-status="late">Late</button></div></div>`,
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

// Render the semester attendance report.
function renderReports() {
  $("#reportRows").innerHTML = students
    .map((s) => {
      const total = 42,
        present = Math.round((total * s[2]) / 100),
        late = 1,
        absent = total - present - late;
      return `<tr><td class="mono">${s[1]}</td><td><strong>${s[0]}</strong></td><td>${total}</td><td class="positive">${present}</td><td class="danger">${absent}</td><td class="late-text">${late}</td><td><div class="progress"><i class="${s[2] < 75 ? "red-bar" : ""}" style="width:${s[2]}%"></i></div><b>${s[2]}%</b></td><td>${status(s[2] < 75 ? "at-risk" : "safe")}</td></tr>`;
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
    leaves.find((l) => l.id === Number(leave.dataset.leave)).status =
      leave.dataset.state;
    renderLeaves();
    toast("Leave request updated.");
  }
});
$("#markAll").addEventListener("click", () => {
  students.forEach((s) => (attendance[s[1]] = "present"));
  renderAttendance();
});
$("#saveAttendance").addEventListener("click", () => {
  $("#saved").textContent = "Saved just now";
  $("#saved").classList.add("is-saved");
  toast("Attendance saved successfully.");
});
$("#exportReport").addEventListener("click", () =>
  toast("CSV report prepared."),
);
renderAttendance();
renderReports();
renderLeaves();
