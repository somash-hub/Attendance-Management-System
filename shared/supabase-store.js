// AttendIQ Supabase adapter (plain JavaScript).
//
// The pages may continue using AttendIQ during the gradual migration, but all
// live backend calls belong in this file. It exposes one small, async API and
// reports which source answered the request. Local results are used only when
// the page is explicitly opened in demo mode; a configured client never
// silently falls back after a network or database error.
(function (root) {
  "use strict";

  var ROLES = ["student", "teacher", "admin"];
  var LEAVE_TYPES = ["Medical", "Personal", "College Event"];
  var LEAVE_STATUSES = ["pending", "approved", "rejected"];
  var ATTENDANCE_STATUSES = ["Present", "Absent", "Late"];

  function client() {
    return root.AttendIQDb || null;
  }

  function localStore() {
    return root.AttendIQDemoMode === true ? root.AttendIQ || null : null;
  }

  function errorText(error, fallback) {
    if (error && typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
    if (typeof error === "string" && error.trim()) return error;
    return fallback || "The request could not be completed.";
  }

  function failure(error, source, fallback) {
    return {
      ok: false,
      error: errorText(error, fallback),
      source: source || "supabase",
    };
  }

  // Edge Function transport failures are usually caused by the page origin
  // (for example file://) or a missing ALLOWED_ORIGINS entry. Translate the
  // raw browser message into an actionable instruction.
  function functionFailure(error, fallback) {
    var message = errorText(error, fallback);
    if (/failed to send a request|failed to fetch|networkerror|load failed|fetch/i.test(message)) {
      var details = " The browser could not reach the Edge Function. Serve the page over http:// or https:// and make sure this origin is listed in the ALLOWED_ORIGINS secret.";
      return failure((fallback || "The request could not be completed.") + details, "supabase");
    }
    if (root.AttendIQRuntime && root.AttendIQRuntime.isFileOrigin && !root.AttendIQDemoMode) {
      return failure(
        (fallback || "The request could not be completed.") +
          " The page is running from a file:// origin, which is blocked. Serve the app over http:// or https:// and configure the front-end origin in ALLOWED_ORIGINS.",
        "supabase",
      );
    }
    return failure(error, "supabase", fallback);
  }

  function errorTextFromJson(text) {
    if (!text) return "";
    try {
      var parsed = JSON.parse(text);
      if (typeof parsed === "string") return parsed;
      if (!parsed || typeof parsed !== "object") return String(text);
      if (typeof parsed.error === "string") return parsed.error;
      if (parsed.error && typeof parsed.error.message === "string") return parsed.error.message;
      if (typeof parsed.message === "string") return parsed.message;
      return String(text);
    } catch (error) {
      return String(text);
    }
  }

  // The Supabase SDK represents non-2xx responses with error.context. Read the
  // cloned response body so validation and database errors reach the UI rather
  // than being replaced by the SDK's generic transport message.
  function functionErrorMessage(error) {
    var response = error && error.context;
    if (!response || typeof response.clone !== "function") return Promise.resolve("");
    return Promise.resolve(response.clone().text()).then(errorTextFromJson).catch(function () {
      return "";
    });
  }

  function success(data, source) {
    return { ok: true, data: data, source: source || "supabase" };
  }

  // Wrap a Supabase query and preserve its real error instead of returning an
  // empty array that could make a failed write look successful.
  function remote(operation, fallback) {
    return Promise.resolve()
      .then(operation)
      .then(function (response) {
        if (response && response.error) {
          return failure(response.error, "supabase", fallback);
        }
        return success(response ? response.data : undefined, "supabase");
      })
      .catch(function (error) {
        return failure(error, "supabase", fallback);
      });
  }

  // The old local store is synchronous. This wrapper gives the adapter one
  // promise-based contract and explicitly labels those results as local.
  function local(operation, fallback) {
    return Promise.resolve()
      .then(function () {
        var store = localStore();
        if (!store) throw new Error("The local fallback store is unavailable.");
        return operation(store);
      })
      .then(function (value) {
        if (value && value.ok === false) return failure(value.error, "local", fallback);
        return success(value, "local");
      })
      .catch(function (error) {
        return failure(error, "local", fallback);
      });
  }

  function requireSupabase() {
    if (client()) return null;
    if (root.AttendIQRuntime && root.AttendIQRuntime.isFileOrigin && !root.AttendIQDemoMode) {
      return new Error(
        "Supabase is unavailable because this page is running from a file:// origin. Serve the app over http:// or https:// and ensure the origin is listed in ALLOWED_ORIGINS.",
      );
    }
    return new Error("Supabase is not configured for this browser.");
  }

  function unsupportedLocal(name) {
    return failure(
      new Error(name + " is unavailable. Configure Supabase or open the explicit demo mode."),
      "local",
    );
  }

  function validRole(role) {
    return ROLES.indexOf(String(role)) === -1 ? "Choose a valid role." : "";
  }

  function validThreshold(value) {
    var number = Number(value);
    return !isFinite(number) || number < 40 || number > 100
      ? "Attendance threshold must be between 40 and 100."
      : "";
  }

  function validPassword(value) {
    var password = String(value || "");
    return password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
      ? "Password must include uppercase, lowercase, number, and symbol."
      : "";
  }

  function cleanEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getProfileForUser(userId) {
    return remote(function () {
      return client()
        .from("profiles")
        .select("id, name, email, role, created_at")
        .eq("id", userId)
        .single();
    }, "Your profile could not be loaded.");
  }

  function currentUser() {
    var missing = requireSupabase();
    if (missing) return Promise.resolve(failure(missing, "supabase"));
    return remote(function () {
      return client().auth.getUser();
    }, "The signed-in user could not be verified.");
  }

  function currentProfile() {
    return currentUser().then(function (userResult) {
      if (!userResult.ok) return userResult;
      var user = userResult.data && userResult.data.user;
      if (!user) return failure("You are not signed in.", "supabase");
      return getProfileForUser(user.id).then(function (profileResult) {
        if (!profileResult.ok) return profileResult;
        if (!profileResult.data) return failure("Your application profile is missing.", "supabase");
        return success({ user: user, profile: profileResult.data }, "supabase");
      });
    });
  }

  var api = {
    ROLES: ROLES,
    LEAVE_TYPES: LEAVE_TYPES,
    LEAVE_STATUSES: LEAVE_STATUSES,
    ATTENDANCE_STATUSES: ATTENDANCE_STATUSES,
  };


  function invokeFunction(name, body, fallback) {
    var missing = requireSupabase();
    if (missing) return Promise.resolve(failure(missing, "supabase", fallback));
    return Promise.resolve()
      .then(function () {
        return client().functions.invoke(name, { body: body });
      })
      .then(function (response) {
        if (response && response.error) {
          return functionErrorMessage(response.error).then(function (serverMessage) {
            return serverMessage
              ? failure(serverMessage, "supabase", fallback)
              : functionFailure(response.error, fallback);
          });
        }
        if (response && response.data && response.data.error) {
          return failure(response.data.error, "supabase", fallback);
        }
        return success(response ? response.data : undefined, "supabase");
      })
      .catch(function (error) {
        return functionFailure(error, fallback);
      });
  }

  function getSession() {
    if (!client()) return local(function (store) { return store.getSession(); });
    return remote(function () {
      return client().auth.getSession();
    }, "The session could not be read.").then(function (result) {
      return result.ok ? success(result.data ? result.data.session : null) : result;
    });
  }

  function signIn(email, password) {
    if (root.AttendIQDemoMode === true || !client()) {
      if (root.AttendIQDemoMode !== true) {
        return Promise.resolve(failure(new Error("Supabase is not configured for this browser. Use a served page or explicit demo mode."), "supabase"));
      }

      return local(function (store) {
        var user = store.authenticate(cleanEmail(email), password);
        if (!user) throw new Error("Invalid email or password.");
        if (!store.setSession(user)) throw new Error("The local session could not be saved.");
        return store.getSession();
      }, "Sign-in failed.");
    }

    var missing = requireSupabase();
    if (missing) return Promise.resolve(failure(missing, "supabase"));
    return remote(function () {
      return client().auth.signInWithPassword({
        email: cleanEmail(email),
        password: String(password || ""),
      });
    }, "Invalid email or password.").then(function (result) {
      if (!result.ok) return result;
      return currentProfile().then(function (profileResult) {
        if (!profileResult.ok) {
          return client().auth.signOut().then(function () { return profileResult; });
        }
        return success({
          session: result.data && result.data.session,
          user: result.data && result.data.user,
          profile: profileResult.data.profile,
        }, "supabase");
      });
    });
  }

  function resetApplicationData(email, password, confirmation) {
    if (String(confirmation || "") !== "RESET") {
      return Promise.resolve(failure("Type RESET to confirm this destructive action.", "supabase"));
    }
    if (!client()) return Promise.resolve(unsupportedLocal("Application reset"));
    return signIn(email, password).then(function (result) {
      if (!result.ok) return result;
      return invokeFunction("admin-reset-application", {
        confirmation: "RESET",
      }, "The application data could not be reset.");
    });
  }

  function requestPasswordReset(email) {
    var value = cleanEmail(email);
    if (!value) return Promise.resolve(failure("Enter your account email.", "supabase"));
    if (!client()) return Promise.resolve(unsupportedLocal("Password recovery"));
    return remote(function () {
      var redirectTo = window.location.origin + window.location.pathname;
      return client().auth.resetPasswordForEmail(value, { redirectTo: redirectTo });
    }, "The password reset email could not be sent.");
  }

  function updatePassword(password) {
    var value = String(password || "");
    var passwordError = validPassword(value);
    if (passwordError) {
      return Promise.resolve(failure(passwordError, client() ? "supabase" : "local"));
    }
    if (!client()) return Promise.resolve(unsupportedLocal("Password recovery"));
    return remote(function () {
      return client().auth.updateUser({ password: value });
    }, "The password could not be updated.");
  }

  function signOut() {
    if (!client()) {
      return local(function (store) { store.clearSession(); return null; }, "Sign-out failed.");
    }
    return remote(function () {
      return client().auth.signOut();
    }, "Sign-out failed.");
  }

  function getCurrentProfile() {
    if (!client()) {
      return local(function (store) { return store.getSession(); }, "Profile unavailable.");
    }
    return currentProfile().then(function (result) {
      return result.ok ? success(result.data.profile, "supabase") : result;
    });
  }

  function getSettings() {
    if (!client()) return local(function (store) { return store.getSettings(); });
    return remote(function () {
      return client().from("settings").select("threshold").eq("id", 1).single();
    }, "Attendance settings could not be loaded.").then(function (result) {
      return result.ok ? success({ threshold: result.data.threshold }) : result;
    });
  }

  function saveSettings(patch) {
    var threshold = patch && patch.threshold;
    var validationError = validThreshold(threshold);
    if (validationError) {
      return Promise.resolve(failure(validationError, client() ? "supabase" : "local"));
    }
    if (!client()) {
      return local(function (store) {
        var result = store.saveSettings({ threshold: Number(threshold) });
        return result.ok ? result.settings : result;
      }, "Settings could not be saved.");
    }
    return remote(function () {
      return client().from("settings")
        .update({ threshold: Number(threshold) })
        .eq("id", 1)
        .select("threshold")
        .single();
    }, "Attendance settings could not be saved.").then(function (result) {
      return result.ok ? success({ threshold: result.data.threshold }) : result;
    });
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    };
  }


  function createUser(input) {
    var value = input || {};
    var roleError = validRole(value.role);
    if (roleError) return Promise.resolve(failure(roleError, client() ? "supabase" : "local"));
    var studentSemester = Number(value.semester);
    if (value.role === "student" && (!Number.isInteger(studentSemester) || studentSemester < 1 || studentSemester > 8)) {
      return Promise.resolve(failure("Choose a semester from 1 to 8.", client() ? "supabase" : "local"));
    }
    var passwordError = validPassword(value.password);
    if (passwordError) return Promise.resolve(failure(passwordError, client() ? "supabase" : "local"));
    if (root.AttendIQDemoMode === true || !client()) {
      return local(function (store) {
        var result = store.addUser(value);
        return result.ok ? publicUser(result.user) : result;
      }, "The account could not be created.");
    }
    return invokeFunction("admin-create-user", {
      name: String(value.name || "").trim(),
      email: cleanEmail(value.email),
      password: String(value.password || ""),
      role: String(value.role || ""),
      roll: String(value.roll || "").trim(),
      program: String(value.program || "BSc CSIT").trim(),
      department: String(value.department || value.program || "BSc CSIT").trim(),
      batch: String(value.batch || "").trim(),
      semester: value.role === "student" ? studentSemester : undefined,
      faculty_id: String(value.faculty_id || "").trim(),
      designation: String(value.designation || "").trim(),
    }, "The account could not be created.");
  }

  function assignRole(userId, role) {
    var roleError = validRole(role);
    if (roleError) return Promise.resolve(failure(roleError, client() ? "supabase" : "local"));
    if (!client()) {
      return local(function (store) {
        var result = store.assignRole(userId, role);
        return result.ok ? publicUser(result.user) : result;
      }, "The role could not be changed.");
    }
    return remote(function () {
      return client().from("profiles")
        .update({ role: String(role) })
        .eq("id", userId)
        .select("id, name, email, role, created_at")
        .single();
    }, "The role could not be changed.");
  }

  function removeUser(userId) {
    if (!client()) {
      return local(function (store) {
        return store.removeUser(userId);
      }, "The account could not be removed.");
    }
    return invokeFunction("admin-delete-user", { id: userId }, "The account could not be removed.");
  }


  function getUsers() {
    if (!client()) {
      return local(function (store) {
        return store.getUsers().map(publicUser);
      }, "Users could not be loaded.");
    }
    return remote(function () {
      return client().from("profiles")
        .select("id, name, email, role, created_at")
        .order("name", { ascending: true });
    }, "Users could not be loaded.");
  }

  function getStudents() {
    if (root.AttendIQDemoMode === true || !client()) return local(function (store) { return store.getStudents(); }, "Student records could not be loaded.");
    return remote(function () {
      return client().from("students")
        .select("id, profile_id, roll, name, email, program, batch, semester, active, archived_at")
        .eq("active", true)
        .order("roll", { ascending: true });
    }, "Students could not be loaded.");
  }

  function normalizeAttendance(records) {
    var list = Array.isArray(records) ? records : [records];
    if (!list.length || list.some(function (record) { return !record; })) {
      throw new Error("Attendance records are required.");
    }
    return list.map(function (record) {
      var status = String(record.status || "");
      if (ATTENDANCE_STATUSES.indexOf(status) === -1) {
        throw new Error("Attendance status must be Present, Absent, or Late.");
      }
      if (!record.student_id || !record.subject_code || !record.date_ad || !record.date_bs || !record.time) {
        throw new Error("Each attendance record needs student, subject, AD date, BS date, and time.");
      }
      return {
        student_id: record.student_id,
        subject_code: record.subject_code,
        course_offering_id: record.course_offering_id || null,
        date_ad: record.date_ad,
        date_bs: record.date_bs,
        time: record.time,
        status: status,
        marked_by: record.marked_by || null,
      };
    });
  }

  function applyAttendanceFilters(query, filters) {
    if (filters.attendance_session_id) query = query.eq("attendance_session_id", filters.attendance_session_id);
    if (filters.student_id) query = query.eq("student_id", filters.student_id);
    if (filters.course_offering_id) query = query.eq("course_offering_id", filters.course_offering_id);
    if (filters.subject_code) query = query.eq("subject_code", filters.subject_code);
    if (filters.date_ad) query = query.eq("date_ad", filters.date_ad);
    if (filters.from_date) query = query.gte("date_ad", filters.from_date);
    if (filters.to_date) query = query.lte("date_ad", filters.to_date);
    return query;
  }

  function subjectFromOffering(offering) {
    var subject = offering.subjects;
    if (Array.isArray(subject)) subject = subject[0];
    return {
      course_offering_id: offering.id,
      code: offering.subject_code || (subject && subject.code) || "",
      name: (subject && subject.name) || "",
      semester: (subject && subject.semester) || null,
      program: (subject && subject.program) || "",
    };
  }

  function getTeacherCourseOfferings() {
    if (!client()) return Promise.resolve(unsupportedLocal("Teacher course offerings"));
    return currentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      return remote(function () {
        return client().from("course_offerings")
          .select("id, subject_code, semester_id, teacher_id, status, subjects!inner(code, name, semester, program), semesters!inner(is_current)")
          .eq("teacher_id", profileResult.data.user.id)
          .eq("status", "active")
          .eq("semesters.is_current", true)
          .order("subject_code", { ascending: true });
      }, "Assigned course offerings could not be loaded.");
    });
  }

  function getTeacherClassSchedules(filters) {
    return getTeacherCourseOfferings().then(function (offeringResult) {
      if (!offeringResult.ok) return offeringResult;
      var offeringIds = Array.from(new Set(offeringResult.data.map(function (row) { return row.id; }).filter(Boolean)));
      if (!offeringIds.length) return success([], "supabase");
      var value = filters || {};
      return remote(function () {
        var query = client().from("class_schedules")
          .select("id, course_offering_id, day_of_week, start_time, end_time, room, status, course_offerings!inner(id, subject_code, semester_id, teacher_id, status, subjects!inner(code, name, semester, program), semesters!inner(name, number))")
          .in("course_offering_id", offeringIds)
          .eq("status", "active")
          .order("day_of_week", { ascending: true })
          .order("start_time", { ascending: true });
        if (value.course_offering_id) query = query.eq("course_offering_id", value.course_offering_id);
        return query;
      }, "Assigned class schedules could not be loaded.");
    });
  }

  function getTeacherStudents() {
    return getTeacherCourseOfferings().then(function (offeringResult) {
      if (!offeringResult.ok) return offeringResult;
      var offeringScopes = new Set(offeringResult.data.map(function (row) {
        var subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
        return subject && subject.program + "|" + subject.semester;
      }).filter(Boolean));
      var programs = Array.from(new Set(Array.from(offeringScopes).map(function (scope) {
        return scope.split("|")[0];
      })));
      if (!programs.length) return success([], "supabase");
      return remote(function () {
        return client().from("students")
          .select("id, profile_id, roll, name, email, program, batch, semester, active")
          .eq("active", true)
          .in("program", programs)
          .order("roll", { ascending: true });
      }, "Assigned students could not be loaded.").then(function (studentsResult) {
        if (!studentsResult.ok) return studentsResult;
        return success(studentsResult.data.filter(function (student) {
          return offeringScopes.has(student.program + "|" + student.semester);
        }), studentsResult.source);
      });
    });
  }

  function getTeacherSubjects() {
    return getTeacherCourseOfferings().then(function (result) {
      if (!result.ok) return result;
      var seen = {};
      var subjects = [];
      result.data.forEach(function (offering) {
        var subject = subjectFromOffering(offering);
        if (subject.course_offering_id && !seen[subject.course_offering_id]) {
          seen[subject.course_offering_id] = true;
          subjects.push(subject);
        }
      });
      return success(subjects, "supabase");
    });
  }

  function getMyStudentProfile() {
    if (!client()) return Promise.resolve(unsupportedLocal("Student profile"));
    return currentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      return remote(function () {
        return client().from("students")
          .select("id, profile_id, roll, name, email, program, batch, semester, active")
          .eq("profile_id", profileResult.data.user.id)
          .eq("active", true)
          .limit(1)
          .single();
      }, "Your student profile could not be loaded.");
    });
  }

  function getMySubjects() {
    return getMyStudentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      return remote(function () {
        return client().from("course_offerings")
          .select("id, subject_code, semester_id, subjects!inner(code, name, semester, program), semesters!inner(is_current)")
          .eq("subjects.semester", profileResult.data.semester)
          .eq("subjects.program", profileResult.data.program)
          .eq("status", "active")
          .eq("semesters.is_current", true)
          .order("subject_code", { ascending: true });
      }, "Your subjects could not be loaded.");
    }).then(function (result) {
      if (!result.ok) return result;
      var seen = {};
      var subjects = [];
      result.data.forEach(function (offering) {
        var subject = subjectFromOffering(offering);
        if (subject.course_offering_id && !seen[subject.course_offering_id]) {
          seen[subject.course_offering_id] = true;
          subjects.push(subject);
        }
      });
      return success(subjects, result.source);
    });
  }

  function getMyClassSchedules() {
    return getMySubjects().then(function (subjectResult) {
      if (!subjectResult.ok) return subjectResult;
      var offeringIds = Array.from(new Set(subjectResult.data.map(function (row) {
        return row.course_offering_id;
      }).filter(Boolean)));
      if (!offeringIds.length) return success([], "supabase");
      return remote(function () {
        return client().from("class_schedules")
          .select("id, course_offering_id, day_of_week, start_time, end_time, room, status, course_offerings!inner(id, subject_code, semester_id, subjects!inner(code, name, semester, program), semesters!inner(name, number))")
          .in("course_offering_id", offeringIds)
          .eq("status", "active")
          .order("day_of_week", { ascending: true })
          .order("start_time", { ascending: true });
      }, "Your class schedules could not be loaded.");
    });
  }

  function getMyAttendance(filters) {
    return getMyStudentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      var value = filters || {};
      return remote(function () {
        var query = client().from("attendance")
          .select("id, student_id, subject_code, course_offering_id, attendance_session_id, date_ad, date_bs, time, status, marked_by, created_at")
          .eq("student_id", profileResult.data.id)
          .order("date_ad", { ascending: false })
          .order("time", { ascending: true });
        return applyAttendanceFilters(query, value);
      }, "Your attendance could not be loaded.");
    });
  }

  // Session reads are explicit so the student portal only loads sessions for
  // its program's current-semester offerings.
  function getMyAttendanceSessions(filters) {
    return getMyStudentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      return getMySubjects().then(function (subjectResult) {
        if (!subjectResult.ok) return subjectResult;
        var offeringIds = Array.from(new Set(subjectResult.data.map(function (row) {
          return row.course_offering_id;
        }).filter(Boolean)));
        if (!offeringIds.length) return success([], "supabase");
        var value = filters || {};
        return remote(function () {
          var query = client().from("attendance_sessions")
            .select("id, schedule_id, course_offering_id, date_ad, date_bs, status, created_at, closed_at")
            .in("course_offering_id", offeringIds)
            .order("date_ad", { ascending: false });
          if (value.course_offering_id) query = query.eq("course_offering_id", value.course_offering_id);
          if (value.date_ad) query = query.eq("date_ad", value.date_ad);
          if (value.status) query = query.eq("status", value.status);
          return query;
        }, "Your attendance sessions could not be loaded.");
      });
    });
  }

  function getTeacherAttendanceSessions(filters) {
    return getTeacherCourseOfferings().then(function (offeringResult) {
      if (!offeringResult.ok) return offeringResult;
      var offeringIds = Array.from(new Set(offeringResult.data.map(function (row) { return row.id; }).filter(Boolean)));
      if (!offeringIds.length) return success([], "supabase");
      var value = filters || {};
      return remote(function () {
        var query = client().from("attendance_sessions")
          .select("id, schedule_id, course_offering_id, date_ad, date_bs, status, created_at, closed_at")
          .in("course_offering_id", offeringIds)
          .order("date_ad", { ascending: false });
        if (value.course_offering_id) query = query.eq("course_offering_id", value.course_offering_id);
        if (value.date_ad) query = query.eq("date_ad", value.date_ad);
        if (value.status) query = query.eq("status", value.status);
        return query;
      }, "Assigned attendance sessions could not be loaded.");
    });
  }

  function createAttendanceSession(input) {
    var value = input || {};
    if (!client()) return Promise.resolve(unsupportedLocal("Attendance sessions"));
    if (!value.schedule_id || !value.date_ad || !String(value.date_bs || "").trim()) {
      return Promise.resolve(failure("Schedule, AD date, and BS date are required.", "supabase"));
    }
    return remote(function () {
      return client().rpc("create_attendance_session", {
        p_schedule_id: String(value.schedule_id).trim(),
        p_date_ad: value.date_ad,
        p_date_bs: String(value.date_bs).trim(),
      }).single();
    }, "The attendance session could not be created.");
  }

  function closeAttendanceSession(sessionId) {
    if (!client()) return Promise.resolve(unsupportedLocal("Attendance sessions"));
    if (!sessionId) return Promise.resolve(failure("Attendance session is required.", "supabase"));
    return remote(function () {
      return client().rpc("close_attendance_session", { p_session_id: String(sessionId).trim() }).single();
    }, "The attendance session could not be closed.");
  }

  function saveAttendanceSession(input) {
    var value = input || {};
    if (!client()) return Promise.resolve(unsupportedLocal("Attendance sessions"));
    if (!value.session_id || !Array.isArray(value.records) || !value.records.length) {
      return Promise.resolve(failure("An attendance session and records are required.", "supabase"));
    }
    return remote(function () {
      return client().rpc("save_attendance_session", {
        p_session_id: String(value.session_id).trim(),
        p_records: value.records.map(function (record) {
          return { student_id: String(record.student_id || "").trim(), status: String(record.status || "").trim() };
        }),
      });
    }, "The attendance session could not be saved.");
  }

  function getMyLeaves(filters) {
    return getMyStudentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      var value = filters || {};
      return remote(function () {
        var query = client().from("leaves")
          .select("id, student_id, type, from_date, to_date, reason, status, document_url, review_comment, reviewed_at, reviewed_by, cancelled_at, created_at")
          .eq("student_id", profileResult.data.id)
          .order("created_at", { ascending: false });
        if (value.status) query = query.eq("status", value.status);
        return query;
      }, "Your leave requests could not be loaded.");
    });
  }

  function getFaculty() {
    if (!client()) {
      return local(function (store) { return store.getFaculty(); }, "Faculty could not be loaded.");
    }
    return remote(function () {
      return client().from("faculty")
        .select("id, profile_id, faculty_id, name, email, department, program, designation, status, archived_at, created_at")
        .neq("status", "archived")
        .order("name", { ascending: true });
    }, "Faculty could not be loaded.");
  }

  function updateFaculty(input) {
    var value = input || {};
    var required = [value.id, value.faculty_id, value.name, value.email, value.department, value.program, value.status];
    if (required.some(function (item) { return !String(item || "").trim(); })) {
      return Promise.resolve(failure("Complete every faculty field before saving.", client() ? "supabase" : "local"));
    }
    if (!client()) {
      return local(function (store) {
        var result = store.updateFaculty(value);
        return result.ok ? result.faculty : result;
      }, "The faculty record could not be updated.");
    }
    return invokeFunction("admin-update-faculty", {
      id: String(value.id).trim(),
      faculty_id: String(value.faculty_id).trim(),
      name: String(value.name).trim(),
      email: cleanEmail(value.email),
      department: String(value.department).trim(),
      program: String(value.program).trim(),
      designation: String(value.designation || "").trim(),
      status: String(value.status).trim(),
    }, "The faculty record could not be updated.");
  }

  function archiveFaculty(facultyId, profileId) {
    if (!facultyId) return Promise.resolve(failure("Faculty record is required.", client() ? "supabase" : "local"));
    if (!client()) {
      return local(function (store) {
        var result = store.archiveFaculty(facultyId);
        if (!result.ok) return result;
        if (profileId) {
          var removed = store.removeUser(profileId);
          if (!removed.ok) return removed;
        }
        return result.faculty;
      }, "The faculty record could not be archived.");
    }
    if (profileId) return removeUser(profileId);
    return remote(function () {
      return client().rpc("admin_archive_faculty", { p_faculty_id: String(facultyId) }).single();
    }, "The faculty record could not be archived.");
  }

  function getAcademicYears() {
    if (!client()) return local(function (store) { return store.getAcademicYears(); }, "Academic years could not be loaded.");
    return remote(function () {
      return client().from("academic_years")
        .select("id, name, start_date, end_date, is_current, created_at")
        .order("start_date", { ascending: false });
    }, "Academic years could not be loaded.");
  }

  function getAcademicEvents(filters) {
    if (!client()) return local(function (store) { return store.getAcademicEvents(filters && filters.include_archived); }, "Academic events could not be loaded.");
    var value = filters || {};
    return remote(function () {
      var query = client().from("academic_events")
        .select("id, academic_year_id, semester_id, title, event_type, start_date, end_date, description, status, created_at, updated_at, academic_years(id, name, is_current), semesters(id, name, number, is_current)")
        .order("start_date", { ascending: true });
      if (!value.include_archived) query = query.eq("status", "active");
      if (value.academic_year_id) query = query.eq("academic_year_id", value.academic_year_id);
      return query;
    }, "Academic events could not be loaded.");
  }

  function createAcademicEvent(input) {
    var value = input || {};
    if (!client()) return local(function (store) { return store.createAcademicEvent(value); }, "The academic event could not be created.");
    return remote(function () {
      return client().rpc("admin_create_academic_event", {
        p_academic_year_id: String(value.academic_year_id || "").trim(),
        p_semester_id: value.semester_id ? String(value.semester_id).trim() : null,
        p_title: String(value.title || "").trim(),
        p_event_type: String(value.event_type || "").trim(),
        p_start_date: value.start_date,
        p_end_date: value.end_date,
        p_description: String(value.description || "").trim(),
      }).single();
    }, "The academic event could not be created.");
  }

  function updateAcademicEvent(input) {
    var value = input || {};
    if (!client()) return local(function (store) { return store.updateAcademicEvent(value); }, "The academic event could not be updated.");
    return remote(function () {
      return client().rpc("admin_update_academic_event", {
        p_event_id: String(value.id || "").trim(),
        p_title: String(value.title || "").trim(),
        p_event_type: String(value.event_type || "").trim(),
        p_start_date: value.start_date,
        p_end_date: value.end_date,
        p_description: String(value.description || "").trim(),
        p_status: value.status === "archived" ? "archived" : "active",
      }).single();
    }, "The academic event could not be updated.");
  }

  function archiveAcademicEvent(id) {
    if (!client()) return local(function (store) { return store.archiveAcademicEvent(id); }, "The academic event could not be archived.");
    return remote(function () {
      return client().rpc("admin_archive_academic_event", { p_event_id: String(id || "").trim() }).single();
    }, "The academic event could not be archived.");
  }

  function getSemesters() {
    if (!client()) return local(function (store) { return store.getSemesters(); }, "Semesters could not be loaded.");
    return remote(function () {
      return client().from("semesters")
        .select("id, academic_year_id, name, number, start_date, end_date, is_current")
        .eq("is_current", true)
        .order("number", { ascending: true });
    }, "Semesters could not be loaded.");
  }

  function setCurrentSemester(input) {
    var value = input || {};
    var year = Number(value.year);
    var semester = Number(value.semester);
    if (!Number.isInteger(year) || year < 2020 || year > 9999 ||
        !Number.isInteger(semester) || semester < 1 || semester > 8) {
      return Promise.resolve(failure("Choose a year from 2020 onward and a semester from 1 to 8.", client() ? "supabase" : "local"));
    }
    if (root.AttendIQDemoMode === true || !client()) {
      return local(function (store) {
        return store.setCurrentSemester(year, semester);
      }, "The current semester could not be changed.");
    }
    return remote(function () {
      return client().rpc("admin_set_current_semester", {
        p_year: year,
        p_semester: semester,
      }).single();
    }, "The current semester could not be changed.");
  }

  function setCurrentAcademicYear(input) {
    var year = Number(input && input.year);
    if (!Number.isInteger(year) || year < 2020 || year > 9999) {
      return Promise.resolve(failure("Choose a Gregorian year from 2020 onward.", client() ? "supabase" : "local"));
    }
    if (root.AttendIQDemoMode === true || !client()) {
      return local(function (store) {
        return store.setCurrentSemester(year, 1);
      }, "The active academic year could not be changed.");
    }
    return remote(function () {
      return client().rpc("admin_set_current_semester", {
        p_year: year,
        p_semester: 1,
      }).single();
    }, "The active academic year could not be changed.");
  }

  function getCourseOfferings(filters) {
    if (!client()) return local(function (store) { return store.getOfferings(filters && filters.include_archived); }, "Course offerings could not be loaded.");
    var value = filters || {};
    return remote(function () {
      var query = client().from("course_offerings")
        .select("id, subject_code, semester_id, teacher_id, status, created_at, updated_at, subjects!inner(code, name, semester, program, credits, course_type, active), semesters!inner(name, number, is_current)")
        .order("subject_code", { ascending: true });
      if (!value.include_archived) query = query.eq("status", "active");
      if (value.semester_id) query = query.eq("semester_id", value.semester_id);
      return query;
    }, "Course offerings could not be loaded.");
  }

  function createCourseOffering(input) {
    var value = input || {};
    if (!client()) return local(function (store) { return store.createOffering(value); }, "The course offering could not be created.");
    return remote(function () {
      return client().rpc("admin_create_course_offering", {
        p_subject_code: String(value.subject_code || "").trim(),
        p_semester_id: String(value.semester_id || "").trim(),
        p_section_id: null,
        p_teacher_id: String(value.teacher_id || "").trim(),
      }).single();
    }, "The course offering could not be created.");
  }

  function updateCourseOffering(input) {
    var value = input || {};
    if (!client()) return local(function (store) { return store.updateOffering(value); }, "The course offering could not be updated.");
    return remote(function () {
      return client().rpc("admin_update_course_offering", {
        p_offering_id: String(value.id || "").trim(),
        p_teacher_id: value.teacher_id ? String(value.teacher_id).trim() : null,
        p_status: value.status === "archived" ? "archived" : "active",
        p_section_id: null,
      }).single();
    }, "The course offering could not be updated.");
  }

  function archiveCourseOffering(id) {
    if (!client()) return local(function (store) { return store.archiveOffering(id); }, "The course offering could not be archived.");
    return remote(function () {
      return client().rpc("admin_archive_course_offering", { p_offering_id: String(id || "").trim() }).single();
    }, "The course offering could not be archived.");
  }

  function getClassSchedules(filters) {
    if (!client()) return local(function (store) { return store.getClassSchedules(filters && filters.include_archived); }, "Class schedules could not be loaded.");
    var value = filters || {};
    return remote(function () {
      var query = client().from("class_schedules")
        .select("id, course_offering_id, day_of_week, start_time, end_time, room, status, created_at, updated_at, course_offerings(id, subject_code, semester_id, teacher_id, status, subjects(code, name, semester, program), semesters(name, number, is_current))")
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });
      if (!value.include_archived) query = query.eq("status", "active");
      return query;
    }, "Class schedules could not be loaded.");
  }

  function createClassSchedule(input) {
    var value = input || {};
    var day = Number(value.day_of_week);
    if (!String(value.course_offering_id || "").trim() ||
        value.day_of_week === "" || !Number.isInteger(day) || day < 0 || day > 6 ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value.start_time || "")) ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value.end_time || "")) ||
        value.end_time <= value.start_time) {
      return Promise.resolve(failure("Choose a course and weekday, then enter a valid start and end time.", client() ? "supabase" : "local"));
    }
    if (!client()) return local(function (store) { return store.createClassSchedule(value); }, "The class schedule could not be created.");
    return remote(function () {
      return client().rpc("admin_create_class_schedule", {
        p_offering_id: String(value.course_offering_id || "").trim(),
        p_day_of_week: day,
        p_start_time: value.start_time,
        p_end_time: value.end_time,
        p_room: String(value.room || "").trim(),
      }).single();
    }, "The class schedule could not be created.");
  }

  function updateClassSchedule(input) {
    var value = input || {};
    var day = Number(value.day_of_week);
    if (!String(value.id || "").trim() ||
        value.day_of_week === "" || !Number.isInteger(day) || day < 0 || day > 6 ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value.start_time || "")) ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value.end_time || "")) ||
        value.end_time <= value.start_time) {
      return Promise.resolve(failure("Choose a weekday, then enter a valid start and end time.", client() ? "supabase" : "local"));
    }
    if (!client()) return local(function (store) { return store.updateClassSchedule(value); }, "The class schedule could not be updated.");
    return remote(function () {
      return client().rpc("admin_update_class_schedule", {
        p_schedule_id: String(value.id || "").trim(),
        p_day_of_week: day,
        p_start_time: value.start_time,
        p_end_time: value.end_time,
        p_room: String(value.room || "").trim(),
        p_status: value.status === "archived" ? "archived" : "active",
      }).single();
    }, "The class schedule could not be updated.");
  }

  function archiveClassSchedule(id) {
    if (!client()) return local(function (store) { return store.archiveClassSchedule(id); }, "The class schedule could not be archived.");
    return remote(function () {
      return client().rpc("admin_archive_class_schedule", { p_schedule_id: String(id || "").trim() }).single();
    }, "The class schedule could not be archived.");
  }

  function updateStudent(input) {
    if (root.AttendIQDemoMode === true || !client()) return local(function (store) { return store.updateStudent(input); }, "The student could not be updated.");
    var value = input || {};
    var required = [value.id, value.name, value.email, value.roll, value.program, value.batch, value.semester];
    if (required.some(function (item) { return !String(item || "").trim(); })) {
      return Promise.resolve(failure("Complete every student field, including semester, before saving.", "supabase"));
    }
    var semester = Number(value.semester);
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
      return Promise.resolve(failure("Choose a semester from 1 to 8.", "supabase"));
    }
    return remote(function () {
      return client().rpc("admin_update_student", {
        p_student_id: String(value.id).trim(),
        p_name: String(value.name).trim(),
        p_email: String(value.email).trim(),
        p_roll: String(value.roll).trim(),
        p_program: String(value.program).trim(),
        p_batch: String(value.batch).trim(),
        p_semester: semester,
        p_section_id: null,
      }).single();
    }, "The student could not be updated.");
  }

  function archiveStudent(studentId) {
    if (!client()) return Promise.resolve(unsupportedLocal("Student records"));
    if (!studentId) return Promise.resolve(failure("Student is required.", "supabase"));
    return remote(function () {
      return client().rpc("admin_archive_student", { p_student_id: String(studentId) }).single();
    }, "The student could not be archived.");
  }

  function getTeacherAttendance(filters) {
    return getTeacherCourseOfferings().then(function (offeringResult) {
      if (!offeringResult.ok) return offeringResult;
      var offeringIds = Array.from(new Set(offeringResult.data.map(function (row) {
        return row.id;
      }).filter(Boolean)));
      if (!offeringIds.length) return success([], "supabase");
      var value = filters || {};
      return remote(function () {
        var query = client().from("attendance")
          .select("id, student_id, subject_code, course_offering_id, attendance_session_id, date_ad, date_bs, time, status, marked_by, created_at")
          .in("course_offering_id", offeringIds)
          .order("date_ad", { ascending: false })
          .order("time", { ascending: true });
        return applyAttendanceFilters(query, value);
      }, "Assigned attendance could not be loaded.");
    });
  }

  function getTeacherLeaves(filters) {
    return getTeacherStudents().then(function (studentsResult) {
      if (!studentsResult.ok) return studentsResult;
      var studentIds = Array.from(new Set(studentsResult.data.map(function (student) {
        return student.id;
      }).filter(Boolean)));
      if (!studentIds.length) return success([], "supabase");
      var value = filters || {};
      return remote(function () {
        var query = client().from("leaves")
          .select("id, student_id, type, from_date, to_date, reason, status, document_url, review_comment, reviewed_at, reviewed_by, cancelled_at, created_at")
          .in("student_id", studentIds)
          .order("created_at", { ascending: false });
        if (value.status) query = query.eq("status", value.status);
        return query;
      }, "Assigned leave requests could not be loaded.");
    });
  }

  function getSubjects(filters) {
    if (!client()) return local(function (store) { return store.getSubjects(filters && filters.include_archived); }, "Subjects could not be loaded.");
    var value = filters || {};
    return remote(function () {
      var query = client().from("subjects")
        .select("code, name, semester, program, teacher_id, credits, course_type, active, archived_at, updated_at")
        .order("code", { ascending: true });
      if (value.teacher_id) query = query.eq("teacher_id", value.teacher_id);
      if (value.semester) query = query.eq("semester", value.semester);
      if (!value.include_archived) query = query.eq("active", true);
      return query;
    }, "Subjects could not be loaded.");
  }

  function createSubject(input) {
    var value = input || {};
    if (!client()) {
      return local(function (store) { return store.createSubject(value); }, "The subject could not be created.");
    }
    return remote(function () {
      return client().rpc("admin_create_subject", {
        p_code: String(value.code || "").trim(),
        p_name: String(value.name || "").trim(),
        p_semester: Number(value.semester),
        p_program: String(value.program || "").trim(),
        p_credits: Number(value.credits),
        p_course_type: String(value.course_type || "theory").trim().toLowerCase(),
      }).single();
    }, "The subject could not be created.");
  }

  function updateSubject(input) {
    var value = input || {};
    if (!client()) {
      return local(function (store) { return store.updateSubject(value); }, "The subject could not be updated.");
    }
    return remote(function () {
      return client().rpc("admin_update_subject", {
        p_code: String(value.code || "").trim(),
        p_name: String(value.name || "").trim(),
        p_semester: Number(value.semester),
        p_program: String(value.program || "").trim(),
        p_credits: Number(value.credits),
        p_course_type: String(value.course_type || "theory").trim().toLowerCase(),
        p_active: value.active !== false,
      }).single();
    }, "The subject could not be updated.");
  }

  function archiveSubject(code) {
    if (!code) return Promise.resolve(failure("Subject code is required.", client() ? "supabase" : "local"));
    if (!client()) {
      return local(function (store) { return store.archiveSubject(code); }, "The subject could not be archived.");
    }
    return remote(function () {
      return client().rpc("admin_archive_subject", { p_code: String(code).trim() }).single();
    }, "The subject could not be archived.");
  }

  function getAttendance(filters) {
    if (root.AttendIQDemoMode === true || !client()) return Promise.resolve(success([], "local"));
    var value = filters || {};
    return remote(function () {
      var query = client().from("attendance")
        .select("id, student_id, subject_code, course_offering_id, attendance_session_id, date_ad, date_bs, time, status, marked_by, created_at")
        .order("date_ad", { ascending: false })
        .order("time", { ascending: true });
      return applyAttendanceFilters(query, value);
    }, "Attendance could not be loaded.");
  }

  function saveAttendance(records) {
    if (!client()) return Promise.resolve(unsupportedLocal("Attendance records"));
    var normalized;
    try {
      normalized = normalizeAttendance(records);
    } catch (error) {
      return Promise.resolve(failure(error, "supabase"));
    }
    return currentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      var userId = profileResult.data.user.id;
      var rows = normalized.map(function (record) {
        var copy = Object.assign({}, record);
        copy.marked_by = userId;
        return copy;
      });
      return remote(function () {
        return client().from("attendance")
          .upsert(rows, { onConflict: "student_id,subject_code,date_ad,time" })
          .select("id, student_id, subject_code, course_offering_id, attendance_session_id, date_ad, date_bs, time, status, marked_by, created_at");
      }, "Attendance could not be saved.");
    });
  }

  function getLeaves(filters) {
    if (!client()) return Promise.resolve(unsupportedLocal("Leave requests"));
    var value = filters || {};
    return remote(function () {
      var query = client().from("leaves")
        .select("id, student_id, type, from_date, to_date, reason, status, document_url, review_comment, reviewed_at, reviewed_by, cancelled_at, created_at")
        .order("created_at", { ascending: false });
      if (value.student_id) query = query.eq("student_id", value.student_id);
      if (value.status) query = query.eq("status", value.status);
      return query;
    }, "Leave requests could not be loaded.");
  }

  function createLeave(input) {
    if (!client()) return Promise.resolve(unsupportedLocal("Leave requests"));
    var value = input || {};
    var type = String(value.type || "");
    var reason = String(value.reason || "").trim();
    var error = LEAVE_TYPES.indexOf(type) === -1
      ? "Choose a valid leave type."
      : !value.from_date || !value.to_date
        ? "Choose both leave dates."
        : !reason
          ? "Enter a reason for the leave."
          : "";
    if (error) return Promise.resolve(failure(error, "supabase"));
    return currentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      var userId = profileResult.data.user.id;
      return remote(function () {
        return client().from("students")
          .select("id")
          .eq("profile_id", userId)
          .eq("active", true)
          .limit(1)
          .single();
      }, "Your student record could not be found.").then(function (studentResult) {
        if (!studentResult.ok) return studentResult;
        var row = {
          student_id: studentResult.data.id,
          type: type,
          from_date: value.from_date,
          to_date: value.to_date,
          reason: reason,
          status: "pending",
          reviewed_by: null,
          document_url: value.document_url || null,
        };
        return remote(function () {
          return client().from("leaves").insert(row)
            .select("id, student_id, type, from_date, to_date, reason, status, document_url, review_comment, reviewed_at, reviewed_by, cancelled_at, created_at")
            .single();
        }, "The leave request could not be saved.");
      });
    });
  }

  function reviewLeave(leaveId, status, comment) {
    if (!client()) return Promise.resolve(unsupportedLocal("Leave review"));
    if (LEAVE_STATUSES.indexOf(status) === -1) {
      return Promise.resolve(failure("Choose pending, approved, or rejected.", "supabase"));
    }
    return remote(function () {
      return client().rpc("review_leave_request", {
        p_leave_id: leaveId,
        p_status: status,
        p_comment: String(comment || "").trim(),
      }).single();
    }, "The leave request could not be reviewed.");
  }

  function cancelLeave(leaveId) {
    if (!client()) return Promise.resolve(unsupportedLocal("Leave cancellation"));
    return remote(function () {
      return client().rpc("cancel_leave_request", { p_leave_id: leaveId }).single();
    }, "The leave request could not be cancelled.");
  }

  function getNotifications(includeRead) {
    if (!client()) return Promise.resolve(unsupportedLocal("Notifications"));
    return remote(function () {
      var query = client().from("notifications")
        .select("id, notification_type, title, message, related_table, related_id, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!includeRead) query = query.is("read_at", null);
      return query;
    }, "Notifications could not be loaded.");
  }

  function sendMassNotification(input) {
    var value = input || {};
    if (!String(value.title || "").trim() || !String(value.message || "").trim()) {
      return Promise.resolve(failure("Title and message are required.", client() ? "supabase" : "local"));
    }
    if (!client()) return Promise.resolve(success({ audience: value.audience || "all" }, "local"));
    return Promise.resolve(failure("Mass notifications require the notification delivery Edge Function to be deployed.", "supabase"));
  }

  function markNotificationsRead(ids) {
    if (!client()) return Promise.resolve(unsupportedLocal("Notifications"));
    if (!Array.isArray(ids) || !ids.length) return Promise.resolve(failure("No notifications were selected.", "supabase"));
    return remote(function () {
      return client().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids).select("id, read_at");
    }, "Notifications could not be updated.");
  }

  function getLeaveDocumentUrl(path) {
    if (!client()) return Promise.resolve(unsupportedLocal("Leave documents"));
    if (!path) return Promise.resolve(failure("No document is attached to this request.", "supabase"));
    return remote(function () {
      return client().storage.from("leave-documents").createSignedUrl(String(path), 300);
    }, "The leave document could not be opened.");
  }

  function uploadLeaveDocument(file) {
    if (!client()) return Promise.resolve(unsupportedLocal("Leave documents"));
    var allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    var extension = String(file && file.name || "").toLowerCase().split(".").pop();
    if (!file || !file.name || file.size > 5 * 1024 * 1024 ||
        allowedTypes.indexOf(String(file.type || "").toLowerCase()) === -1 ||
        [".pdf", ".jpg", ".jpeg", ".png"].indexOf("." + extension) === -1) {
      return Promise.resolve(failure("Choose a PDF, JPG, or PNG file smaller than 5 MB.", "supabase"));
    }
    var form = new FormData();
    form.append("file", file, file.name);
    return invokeFunction("upload-leave-document", form, "The leave document could not be uploaded.");
  }

  api.signIn = signIn;
  api.resetApplicationData = resetApplicationData;
  api.requestPasswordReset = requestPasswordReset;
  api.updatePassword = updatePassword;
  api.signOut = signOut;
  api.getSession = getSession;
  api.getCurrentProfile = getCurrentProfile;
  api.getSettings = getSettings;
  api.saveSettings = saveSettings;
  api.getUsers = getUsers;
  api.createUser = createUser;
  api.assignRole = assignRole;
  api.removeUser = removeUser;
  api.getStudents = getStudents;
  api.getFaculty = getFaculty;
  api.updateFaculty = updateFaculty;
  api.archiveFaculty = archiveFaculty;
  api.getTeacherCourseOfferings = getTeacherCourseOfferings;
  api.getTeacherClassSchedules = getTeacherClassSchedules;
  api.getTeacherStudents = getTeacherStudents;
  api.getTeacherSubjects = getTeacherSubjects;
  api.getTeacherAttendance = getTeacherAttendance;
  api.getTeacherLeaves = getTeacherLeaves;
  api.getMyStudentProfile = getMyStudentProfile;
  api.getMySubjects = getMySubjects;
  api.getMyClassSchedules = getMyClassSchedules;
  api.getMyAttendance = getMyAttendance;
  api.getMyAttendanceSessions = getMyAttendanceSessions;
  api.getMyLeaves = getMyLeaves;
  api.getTeacherAttendanceSessions = getTeacherAttendanceSessions;
  api.createAttendanceSession = createAttendanceSession;
  api.closeAttendanceSession = closeAttendanceSession;
  api.saveAttendanceSession = saveAttendanceSession;
  api.getAcademicYears = getAcademicYears;
  api.getSemesters = getSemesters;
  api.setCurrentSemester = setCurrentSemester;
  api.setCurrentAcademicYear = setCurrentAcademicYear;
  api.getAcademicEvents = getAcademicEvents;
  api.createAcademicEvent = createAcademicEvent;
  api.updateAcademicEvent = updateAcademicEvent;
  api.archiveAcademicEvent = archiveAcademicEvent;
  api.getClassSchedules = getClassSchedules;
  api.createClassSchedule = createClassSchedule;
  api.updateClassSchedule = updateClassSchedule;
  api.archiveClassSchedule = archiveClassSchedule;
  api.getCourseOfferings = getCourseOfferings;
  api.createCourseOffering = createCourseOffering;
  api.updateCourseOffering = updateCourseOffering;
  api.archiveCourseOffering = archiveCourseOffering;
  api.updateStudent = updateStudent;
  api.archiveStudent = archiveStudent;
  api.getSubjects = getSubjects;
  api.createSubject = createSubject;
  api.updateSubject = updateSubject;
  api.archiveSubject = archiveSubject;
  api.getAttendance = getAttendance;
  api.saveAttendance = saveAttendance;
  api.getLeaves = getLeaves;
  api.createLeave = createLeave;
  api.reviewLeave = reviewLeave;
  api.cancelLeave = cancelLeave;
  api.getNotifications = getNotifications;
  api.sendMassNotification = sendMassNotification;
  api.markNotificationsRead = markNotificationsRead;
  api.getLeaveDocumentUrl = getLeaveDocumentUrl;
  api.uploadLeaveDocument = uploadLeaveDocument;
  root.AttendIQSupabase = api;
})(typeof window !== "undefined" ? window : globalThis);
