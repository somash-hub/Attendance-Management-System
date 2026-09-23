// Access control: only signed-in students may use this portal.
const session = AttendIQ.getSession();
if (!session) {
  location.replace("../login/login.html");
} else if (session.role !== "student") {
  location.replace("../" + AttendIQ.ROLE_PANELS[session.role]);
}

// Portal-wide attendance settings (threshold) shared by every panel.
const settings = AttendIQ.getSettings();

// Demo attendance data used until the student portal is connected to an API.
const records = [
  ["Ashadh 24, 2082", "Tuesday", "CSC419", "09:00 AM", "Present"],
  ["Ashadh 24, 2082", "Tuesday", "CSC420", "11:00 AM", "Present"],
  ["Ashadh 24, 2082", "Tuesday", "CSC421", "02:00 PM", "Absent"],
  ["Ashadh 23, 2082", "Monday", "CSC422", "10:00 AM", "Present"],
  ["Ashadh 23, 2082", "Monday", "CSC425", "12:00 PM", "Present"],
  ["Ashadh 23, 2082", "Monday", "CSC419", "09:00 AM", "Late"],
  ["Ashadh 20, 2082", "Friday", "CSC420", "11:00 AM", "Absent"],
  ["Ashadh 20, 2082", "Friday", "CSC421", "02:00 PM", "Present"],
];
// Nepali colleges run Sunday through Friday; Saturday is the weekly holiday.
const schedule = {
  Sunday: [
    ["09:00-10:00", "CSC419", "Advanced Java Programming", "LH-201"],
    ["11:00-12:00", "CSC420", "Data Warehousing and Data Mining", "LH-104"],
  ],
  Monday: [
    ["09:00-10:00", "CSC419", "Advanced Java Programming", "LH-201"],
    ["10:00-11:00", "CSC422", "Project Work", "LH-103"],
    ["12:00-13:00", "CSC425", "Software Project Management", "LH-302"],
  ],
  Tuesday: [
    ["09:00-10:00", "CSC419", "Advanced Java Programming", "LH-201"],
    ["11:00-12:00", "CSC420", "Data Warehousing and Data Mining", "LH-104"],
    ["14:00-15:00", "CSC421", "Principles of Management", "Lab-3"],
  ],
  Wednesday: [
    ["09:00-10:00", "CSC419", "Advanced Java Programming", "LH-201"],
    ["11:00-12:00", "CSC420", "Data Warehousing and Data Mining", "LH-104"],
  ],
  Thursday: [
    ["10:00-11:00", "CSC422", "Project Work", "LH-103"],
    ["12:00-13:00", "CSC425", "Software Project Management", "LH-302"],
  ],
  Friday: [
    ["11:00-12:00", "CSC420", "Data Warehousing and Data Mining", "LH-104"],
    ["14:00-15:00", "CSC421", "Principles of Management", "Lab-3"],
  ],
};

// Small DOM helpers keep selectors concise throughout this file.
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];

// Subject percentages are the source for the threshold warning banner.
const subjectAttendance = [
  ["CSC419", "Advanced Java Programming", 90],
  ["CSC420", "Data Warehousing and Data Mining", 85],
  ["CSC421", "Principles of Management", 73],
  ["CSC422", "Project Work", 93],
  ["CSC425", "Software Project Management", 83],
];

// Point the warning banner at the weakest subject while it is below the
// administrator's threshold, and hide the banner when every subject passes.
function renderWarning() {
  const below = subjectAttendance
    .filter((subject) => subject[2] < settings.threshold)
    .sort((a, b) => a[2] - b[2]);
  const banner = $("#warning");

  if (!below.length) {
    banner.style.display = "none";
    return;
  }
  banner.style.display = "";
  $("#warningText").textContent = `Your attendance in ${below[0][1]} is below the ${settings.threshold}% threshold.`;
}

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
        `<tr><td class="mono">${r[0]}</td><td>${r[1]}</td><td><strong>${r[2]}</strong><small>${{ CSC419: "Advanced Java Programming", CSC420: "Data Warehousing and Data Mining", CSC421: "Principles of Management", CSC422: "Project Work", CSC425: "Software Project Management" }[r[2]]}</small></td><td>${r[3]}</td><td>${badge(r[4])}</td></tr>`,
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

renderWarning();
renderRecords();
renderSchedule();
