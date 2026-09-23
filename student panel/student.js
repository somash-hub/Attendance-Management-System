// Access control: only signed-in students may use this portal.
const session = AttendIQ.getSession();
if (!session) {
  location.replace("../login/login.html");
} else if (session.role !== "student") {
  location.replace("../" + AttendIQ.ROLE_PANELS[session.role]);
}

// Demo attendance data used until the student portal is connected to an API.
const records = [
  ["Jul 08, 2025", "Tuesday", "CS401", "09:00 AM", "Present"],
  ["Jul 08, 2025", "Tuesday", "CS402", "11:00 AM", "Present"],
  ["Jul 08, 2025", "Tuesday", "CS403", "02:00 PM", "Absent"],
  ["Jul 07, 2025", "Monday", "CS404", "10:00 AM", "Present"],
  ["Jul 07, 2025", "Monday", "CS405", "12:00 PM", "Present"],
  ["Jul 07, 2025", "Monday", "CS401", "09:00 AM", "Late"],
  ["Jul 04, 2025", "Friday", "CS402", "11:00 AM", "Absent"],
  ["Jul 04, 2025", "Friday", "CS403", "02:00 PM", "Present"],
];
const schedule = {
  Monday: [
    ["09:00-10:00", "CS401", "Data Structures", "LH-201"],
    ["10:00-11:00", "CS404", "Computer Networks", "LH-103"],
    ["12:00-13:00", "CS405", "Software Engineering", "LH-302"],
  ],
  Tuesday: [
    ["09:00-10:00", "CS401", "Data Structures", "LH-201"],
    ["11:00-12:00", "CS402", "Operating Systems", "LH-104"],
    ["14:00-15:00", "CS403", "Database Management", "Lab-3"],
  ],
  Wednesday: [
    ["09:00-10:00", "CS401", "Data Structures", "LH-201"],
    ["11:00-12:00", "CS402", "Operating Systems", "LH-104"],
  ],
  Thursday: [
    ["10:00-11:00", "CS404", "Computer Networks", "LH-103"],
    ["12:00-13:00", "CS405", "Software Engineering", "LH-302"],
  ],
  Friday: [
    ["11:00-12:00", "CS402", "Operating Systems", "LH-104"],
    ["14:00-15:00", "CS403", "Database Management", "Lab-3"],
  ],
};

// Small DOM helpers keep selectors concise throughout this file.
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];

// Render a reusable status badge for attendance records.
function badge(status) {
  return `<span class="status status-${status.toLowerCase()}">${status}</span>`;
}

// Draw the searchable and filterable attendance log.
function renderRecords() {
  const q = ($("#recordSearch").value || "").toLowerCase(),
    status = $("#statusFilter").value;
  $("#recordRows").innerHTML = records
    .filter(
      (r) =>
        (!q || r.join(" ").toLowerCase().includes(q)) &&
        (status === "All statuses" || r[4] === status),
    )
    .map(
      (r) =>
        `<tr><td class="mono">${r[0]}</td><td>${r[1]}</td><td><strong>${r[2]}</strong><small>${{ CS401: "Data Structures", CS402: "Operating Systems", CS403: "Database Management", CS404: "Computer Networks", CS405: "Software Engineering" }[r[2]]}</small></td><td>${r[3]}</td><td>${badge(r[4])}</td></tr>`,
    )
    .join("");
}

// Build the weekly schedule cards from the schedule data above.
function renderSchedule() {
  $("#scheduleGrid").innerHTML = Object.entries(schedule)
    .map(
      ([day, slots]) =>
        `<article class="card day-card"><h2>${day}</h2><p>${slots.length} classes</p>${slots.map((s) => `<div class="class-slot"><span>◷</span><div><strong>${s[2]}</strong><small>${s[0]} · ${s[1]} · ${s[3]}</small></div></div>`).join("")}</article>`,
    )
    .join("");
}

// Switch between the four student portal views.
function openTab(tab) {
  $$(".nav-item").forEach((n) =>
    n.classList.toggle("active", n.dataset.tab === tab),
  );
  $$(".panel").forEach((p) =>
    p.classList.toggle("active", p.dataset.panel === tab),
  );
  const titles = {
    dashboard: "Attendance Overview",
    records: "Attendance Records",
    schedule: "Class Schedule",
    leave: "Leave Request",
  };
  $("#title").textContent = titles[tab];
  $("#crumb").textContent =
    tab === "dashboard" ? "OVERVIEW" : tab.toUpperCase();
  $("#sidebar").classList.remove("open");
}

// Temporary feedback for actions that will later call backend services.
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("visible");
  setTimeout(() => $("#toast").classList.remove("visible"), 2400);
}

// Wire sidebar links, search, filters, notifications, and form actions.
$$(".nav-item").forEach((n) =>
  n.addEventListener("click", () => openTab(n.dataset.tab)),
);
$$("[data-tab-link]").forEach((n) =>
  n.addEventListener("click", () => openTab(n.dataset.tabLink)),
);
$("#menuButton").addEventListener("click", () =>
  $("#sidebar").classList.toggle("open"),
);
$("#recordSearch").addEventListener("input", renderRecords);
$("#statusFilter").addEventListener("change", renderRecords);
$("#search").addEventListener("input", (e) => {
  if (e.target.value) {
    openTab("records");
    $("#recordSearch").value = e.target.value;
    renderRecords();
  }
});
$("#notification").addEventListener("click", () =>
  $("#notificationPop").classList.toggle("open"),
);
$("#export").addEventListener("click", () =>
  toast("Attendance export prepared."),
);
$$(".choice").forEach((choice) =>
  choice.addEventListener("click", () => {
    $$(".choice").forEach((c) => c.classList.remove("selected"));
    choice.classList.add("selected");
  }),
);
$("#leaveForm").addEventListener("submit", (e) => {
  e.preventDefault();
  $("#leaveCard").innerHTML =
    `<div class="success-state"><span>✓</span><h2>Request Submitted</h2><p>Your leave application has been forwarded to your class advisor for approval.</p><button class="button primary" id="another">Submit another request</button></div>`;
  $("#another").addEventListener("click", () => location.reload());
});
// Reflect the signed-in student in the topbar and support sign-out.
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
$("#signOut").addEventListener("click", () => AttendIQ.clearSession());

renderRecords();
renderSchedule();
