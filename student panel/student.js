// Access control: wait for the verified Supabase profile before initializing.
const PORTAL_ROLE = "student";
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

// Demo attendance data used as the local fallback until Supabase is configured.
let records = [
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
  $$ = (s) => [...document.querySelectorAll(s)],
  h = AttendIQUtils.escapeHtml;

// Subject percentages are the source for the threshold warning banner. The
// database load below replaces the demo rows when Supabase is configured.
let subjectNames = {
  CSC419: "Advanced Java Programming",
  CSC420: "Data Warehousing and Data Mining",
  CSC421: "Principles of Management",
  CSC422: "Project Work",
  CSC425: "Software Project Management",
};
let subjectAttendance = [
  ["CSC419", "Advanced Java Programming", 90, 38, 42],
  ["CSC420", "Data Warehousing and Data Mining", 85, 34, 40],
  ["CSC421", "Principles of Management", 73, 28, 38],
  ["CSC422", "Project Work", 93, 39, 42],
  ["CSC425", "Software Project Management", 83, 30, 36],
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
  const value = String(status || "Unknown");
  return `<span class="status status-${h(value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))}">${h(value)}</span>`;
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
        `<tr><td class="mono">${h(r[0])}</td><td>${h(r[1])}</td><td><strong>${h(r[2])}</strong><small>${h(subjectNames[r[2]] || "")}</small></td><td>${h(r[3])}</td><td>${badge(r[4])}</td></tr>`,
    )
    .join("");
}

// The demo timetable is used only when no Supabase client is configured. In
// live mode loadStudentDashboard replaces it with schedules for this student's
// enrolled course offerings.
let liveSchedule = null;
let liveNotifications = [];
let liveLeaves = [];

// Render live leave history with secure document and cancellation actions.
function renderLeaves() {
  const list = $("#studentLeaveList");
  if (!list) return;
  list.innerHTML = liveLeaves.length ? liveLeaves.map(function (leave) {
    const dates = leave.from_date === leave.to_date ? leave.from_date : leave.from_date + " → " + leave.to_date;
    const documentButton = leave.document_url ? `<button type="button" data-leave-document="${h(leave.document_url)}">Open document</button>` : "";
    const cancelButton = leave.status === "pending" ? `<button type="button" data-cancel-leave="${h(leave.id)}">Cancel</button>` : "";
    return `<div class="request-row"><div><strong>${h(leave.type)}</strong>${badge(leave.status)}<p>${h(dates)} · ${h(leave.reason)}</p>${leave.review_comment ? `<small>Reviewer: ${h(leave.review_comment)}</small>` : ""}</div><div class="request-actions">${documentButton}${cancelButton}</div></div>`;
  }).join("") : "<p><small>No leave requests submitted.</small></p>";
}

function loadLeaves() {
  if (!window.AttendIQDb) return Promise.resolve();
  return AttendIQSupabase.getMyLeaves().then(function (result) {
    if (!result.ok) return toast(result.error);
    liveLeaves = result.data;
    renderLeaves();
  });
}

// Render the database-backed notification list. Unread rows are marked only
// after the user opens the notification panel.
function renderNotifications() {
  const list = $("#notificationList");
  if (!list) return;
  list.innerHTML = liveNotifications.length
    ? liveNotifications.map(function (item) {
        return `<p>${h(item.title)}<small>${h(item.message)}</small></p>`;
      }).join("")
    : "<p><small>No notifications yet.</small></p>";
  const unread = liveNotifications.filter(function (item) { return !item.read_at; }).length;
  $("#notificationCount").textContent = unread;
  $("#notificationCount").hidden = unread === 0;
}

// Build the weekly schedule cards from the active timetable.
function renderSchedule() {
  const source = liveSchedule || schedule;
  const groups = Object.entries(source).filter(([, slots]) => slots.length);
  if (!groups.length) {
    $("#scheduleGrid").innerHTML = '<div class="empty-state"><h2>No class schedule published yet</h2><p>Your administrator will publish the timetable here.</p></div>';
    return;
  }
  $("#scheduleGrid").innerHTML = groups
    .map(
      ([day, slots]) =>
        `<article class="card day-card"><h2>${h(day)}</h2><p>${h(slots.length)} classes</p>${slots.map((s) => `<div class="class-slot"><span>◷</span><div><strong>${h(s[2])}</strong><small>${h(s[0])} · ${h(s[1])} · ${h(s[3])}</small></div></div>`).join("")}</article>`,
    )
    .join("");
}

var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var BAR_CLASSES = ["", "bar-green", "bar-red", "bar-purple", "bar-yellow"];

function weekdayName(value) {
  var parts = String(value || "").split("-");
  if (parts.length !== 3) return "";
  var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return WEEKDAYS[date.getDay()] || "";
}

// Recalculate subject percentages and all dashboard metrics from real marks.
function renderDashboard(attendanceRows, subjects) {
  var totals = {};
  attendanceRows.forEach(function (row) {
    var entry = totals[row.subject_code] || { total: 0, present: 0 };
    entry.total += 1;
    if (row.status === "Present") entry.present += 1;
    totals[row.subject_code] = entry;
  });

  subjectNames = Object.fromEntries(subjects.map(function (subject) {
    return [subject.code, subject.name];
  }));
  subjectAttendance = subjects.map(function (subject) {
    var entry = totals[subject.code] || { total: 0, present: 0 };
    var percent = entry.total ? Math.round((entry.present / entry.total) * 100) : 0;
    return [subject.code, subject.name, percent, entry.present, entry.total];
  });

  var totalClasses = attendanceRows.length;
  var presentCount = attendanceRows.filter(function (row) { return row.status === "Present"; }).length;
  var absentCount = attendanceRows.filter(function (row) { return row.status === "Absent"; }).length;
  var months = {};
  attendanceRows.forEach(function (row) {
    var month = String(row.date_ad || "").slice(0, 7);
    if (!month) return;
    var entry = months[month] || { total: 0, present: 0 };
    entry.total += 1;
    if (row.status === "Present") entry.present += 1;
    months[month] = entry;
  });
  var monthKeys = Object.keys(months).sort().slice(-5);
  $("#trendChart").innerHTML = monthKeys.map(function (month) {
    var entry = months[month];
    var percent = entry.total ? Math.round((entry.present / entry.total) * 100) : 0;
    return `<b style="height:${Math.max(4, percent)}%"></b>`;
  }).join("") || "<small>No trend data available.</small>";
  $("#trendMonths").innerHTML = monthKeys.map(function (month) {
    return `<span>${h(month.slice(5))}</span>`;
  }).join("");

  $("#overallPercent").textContent = (totalClasses ? Math.round((presentCount / totalClasses) * 100) : 0) + "%";
  $("#overallClasses").textContent = presentCount + " / " + totalClasses + " classes";
  $("#presentCount").textContent = presentCount;
  $("#absentCount").textContent = absentCount;
  $("#subjectCount").textContent = subjectAttendance.length;

  $("#subjectBars").innerHTML = subjectAttendance
    .map(function (subject, index) {
      var barClass = subject[2] < settings.threshold ? "bar-red" : BAR_CLASSES[index] || "";
      return `<div><span>${h(subject[0])}</span><i><b class="${barClass}" style="width:${Math.min(100, Math.max(0, Number(subject[2]) || 0))}%"></b></i><strong class="${subject[2] < settings.threshold ? "danger" : ""}">${h(subject[2])}%</strong></div>`;
    })
    .join("");

  $("#breakdownRows").innerHTML = subjectAttendance
    .map(function (subject) {
      var atRisk = subject[2] < settings.threshold;
      return `<tr><td class="mono">${h(subject[0])}</td><td>${h(subject[1])}</td><td>Assigned faculty</td><td>${h(subject[3])} / ${h(subject[4])}</td><td class="${atRisk ? "danger" : ""}">${h(subject[2])}%</td><td><span class="${atRisk ? "risk" : "safe"}">${atRisk ? "At risk" : "Safe"}</span></td></tr>`;
    })
    .join("");
}

// Load the signed-in student's own rows and replace the demo dashboard.
function loadStudentDashboard() {
  if (!window.AttendIQDb) {
    renderWarning();
    renderRecords();
    return Promise.resolve();
  }
  return Promise.all([
    AttendIQSupabase.getMyStudentProfile(),
    AttendIQSupabase.getMySubjects(),
  ]).then(function (results) {
    var studentsResult = results[0];
    var subjectsResult = results[1];
    if (!studentsResult.ok || !subjectsResult.ok) {
      toast(studentsResult.error || subjectsResult.error || "Attendance data could not be loaded.");
      return;
    }
    var student = studentsResult.data;
    if (!student) {
      toast("Your student record is not linked to this login.");
      return;
    }
    return Promise.all([
      AttendIQSupabase.getMyAttendance(),
      AttendIQSupabase.getMyClassSchedules(),
      AttendIQSupabase.getNotifications(true),
    ]).then(function (results) {
      var attendanceResult = results[0];
      var schedulesResult = results[1];
      var notificationsResult = results[2];
      if (!attendanceResult.ok || !schedulesResult.ok || !notificationsResult.ok) {
        toast(attendanceResult.error || schedulesResult.error || notificationsResult.error || "Attendance data could not be loaded.");
        return;
      }
      liveNotifications = notificationsResult.data;
      renderNotifications();
      return loadLeaves().then(function () {
      records = attendanceResult.data.map(function (row) {
        return [row.date_bs || row.date_ad, weekdayName(row.date_ad), row.subject_code, row.time, row.status];
      });
      liveSchedule = schedulesResult.data.reduce(function (grouped, row) {
        var offering = Array.isArray(row.course_offerings) ? row.course_offerings[0] : row.course_offerings || {};
        var subject = offering.subjects && (Array.isArray(offering.subjects) ? offering.subjects[0] : offering.subjects);
        var day = WEEKDAYS[Number(row.day_of_week)] || "Unscheduled";
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push([
          String(row.start_time || "").slice(0, 5) + "–" + String(row.end_time || "").slice(0, 5),
          subject ? subject.name : offering.subject_code || "Class",
          subject ? subject.code : offering.subject_code || "—",
          row.room || "Room TBA",
        ]);
        return grouped;
      }, {});
      renderSchedule();
      renderDashboard(attendanceResult.data, subjectsResult.data);
      renderWarning();
      renderRecords();
      return renderLeaves();
      });
    });
  });
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
$("#notification").addEventListener("click", async () => {
  $("#notificationPop").classList.toggle("open");
  if (!$("#notificationPop").classList.contains("open")) return;
  const unreadIds = liveNotifications.filter(function (item) { return !item.read_at; }).map(function (item) { return item.id; });
  if (!unreadIds.length || !window.AttendIQDb) return;
  const result = await AttendIQSupabase.markNotificationsRead(unreadIds);
  if (!result.ok) return toast(result.error);
  liveNotifications = liveNotifications.map(function (item) {
    return Object.assign({}, item, { read_at: new Date().toISOString() });
  });
  renderNotifications();
});
$("#export").addEventListener("click", () => {
  if (!records.length) return toast("There are no attendance records to export.");
  try {
    AttendIQCsv.download("attendiq-attendance-records.csv", [
      ["Date", "Day", "Subject code", "Time", "Status"],
      ...records,
    ]);
    toast("Attendance CSV downloaded.");
  } catch (error) {
    toast(error.message);
  }
});
let selectedLeaveType = "Medical";
$$(".choice").forEach((choice) =>
  choice.addEventListener("click", () => {
    $$(".choice").forEach((c) => c.classList.remove("selected"));
    choice.classList.add("selected");
    selectedLeaveType = choice.textContent.trim();
  }),
);
$("#leaveForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!window.AttendIQDb) {
    toast("Supabase is not configured; leave requests cannot be submitted yet.");
    return;
  }

  const fromDate = $("#leaveFrom").value;
  const toDate = $("#leaveTo").value;
  const reason = $("#leaveReason").value.trim();
  if (!fromDate || !toDate) return toast("Choose both leave dates.");
  if (toDate < fromDate) return toast("The to date cannot be before the from date.");
  if (!reason) return toast("Enter a reason for the leave.");

  let documentUrl = null;
  const fileInput = $("#leaveDocument");
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  if (file) {
    const upload = await AttendIQSupabase.uploadLeaveDocument(file);
    if (!upload.ok) return toast(upload.error);
    documentUrl = upload.data.path;
  }

  const result = await AttendIQSupabase.createLeave({
    type: selectedLeaveType,
    from_date: fromDate,
    to_date: toDate,
    reason: reason,
    document_url: documentUrl,
  });
  if (!result.ok) return toast(result.error);
  await loadLeaves();

  $("#leaveCard").innerHTML =
    `<div class="success-state"><span>✓</span><h2>Request Submitted</h2><p>Your leave application has been forwarded to your class advisor for approval.</p><button class="button primary" id="another">Submit another request</button></div>`;
  $("#another").addEventListener("click", () => location.reload());
});
document.addEventListener("click", async (event) => {
  const documentButton = event.target.closest("[data-leave-document]");
  if (documentButton) {
    const result = await AttendIQSupabase.getLeaveDocumentUrl(documentButton.dataset.leaveDocument);
    if (!result.ok) return toast(result.error);
    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
    return;
  }
  const cancelButton = event.target.closest("[data-cancel-leave]");
  if (cancelButton) {
    if (!window.confirm("Cancel this pending leave request?")) return;
    const result = await AttendIQSupabase.cancelLeave(cancelButton.dataset.cancelLeave);
    if (!result.ok) return toast(result.error);
    await loadLeaves();
    toast("Leave request cancelled.");
  }
});
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

  renderSchedule();
  return loadStudentDashboard();
  });
}
