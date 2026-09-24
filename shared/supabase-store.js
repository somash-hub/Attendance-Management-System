// AttendIQ Supabase adapter (plain JavaScript).
//
// The pages may continue using AttendIQ during the gradual migration, but all
// live backend calls belong in this file. It exposes one small, async API and
// reports which source answered the request. Local results are used only when
// no Supabase client is configured; a configured client never silently falls
// back after a network or database error.
(function (root) {
  "use strict";

  var ROLES = ["student", "teacher", "admin"];
  var LEAVE_TYPES = ["Medical", "Personal", "College Event"];
  var LEAVE_STATUSES = ["pending", "approved", "rejected"];
  var ATTENDANCE_STATUSES = ["Present", "Absent", "Late"];
  var LEAVE_BUCKET = "leave-documents";

  function client() {
    return root.AttendIQDb || null;
  }

  function localStore() {
    return root.AttendIQ || null;
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
    return client() ? null : new Error("Supabase is not configured for this browser.");
  }

  function unsupportedLocal(name) {
    return failure(
      new Error(name + " is not available in the local demo. Configure Supabase to use it."),
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
        if (response && response.error) return failure(response.error, "supabase", fallback);
        if (response && response.data && response.data.error) {
          return failure(response.data.error, "supabase", fallback);
        }
        return success(response ? response.data : undefined, "supabase");
      })
      .catch(function (error) {
        return failure(error, "supabase", fallback);
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
    if (!client()) {
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
    if (!client()) {
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
        date_ad: record.date_ad,
        date_bs: record.date_bs,
        time: record.time,
        status: status,
        marked_by: record.marked_by || null,
      };
    });
  }

  function applyAttendanceFilters(query, filters) {
    if (filters.student_id) query = query.eq("student_id", filters.student_id);
    if (filters.subject_code) query = query.eq("subject_code", filters.subject_code);
    if (filters.date_ad) query = query.eq("date_ad", filters.date_ad);
    if (filters.from_date) query = query.gte("date_ad", filters.from_date);
    if (filters.to_date) query = query.lte("date_ad", filters.to_date);
    return query;
  }

  function getStudents() {
    if (!client()) return Promise.resolve(unsupportedLocal("Student records"));
    return remote(function () {
      return client().from("students")
        .select("id, profile_id, roll, name, email, program, batch, section")
        .order("roll", { ascending: true });
    }, "Students could not be loaded.");
  }

  function getSubjects(filters) {
    if (!client()) return Promise.resolve(unsupportedLocal("Subject records"));
    var value = filters || {};
    return remote(function () {
      var query = client().from("subjects")
        .select("code, name, semester, program, teacher_id")
        .order("code", { ascending: true });
      if (value.teacher_id) query = query.eq("teacher_id", value.teacher_id);
      if (value.semester) query = query.eq("semester", value.semester);
      return query;
    }, "Subjects could not be loaded.");
  }

  function getAttendance(filters) {
    if (!client()) return Promise.resolve(unsupportedLocal("Attendance records"));
    var value = filters || {};
    return remote(function () {
      var query = client().from("attendance")
        .select("id, student_id, subject_code, date_ad, date_bs, time, status, marked_by, created_at")
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
          .select("id, student_id, subject_code, date_ad, date_bs, time, status, marked_by, created_at");
      }, "Attendance could not be saved.");
    });
  }

  function getLeaves(filters) {
    if (!client()) return Promise.resolve(unsupportedLocal("Leave requests"));
    var value = filters || {};
    return remote(function () {
      var query = client().from("leaves")
        .select("id, student_id, type, from_date, to_date, reason, status, document_url, reviewed_by, created_at")
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
        return client().from("students").select("id").eq("profile_id", userId).single();
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
            .select("id, student_id, type, from_date, to_date, reason, status, document_url, reviewed_by, created_at")
            .single();
        }, "The leave request could not be saved.");
      });
    });
  }

  function reviewLeave(leaveId, status) {
    if (!client()) return Promise.resolve(unsupportedLocal("Leave review"));
    if (LEAVE_STATUSES.indexOf(status) === -1 || status === "pending") {
      return Promise.resolve(failure("Choose approved or rejected.", "supabase"));
    }
    return currentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      return remote(function () {
        return client().from("leaves")
          .update({ status: status, reviewed_by: profileResult.data.user.id })
          .eq("id", leaveId)
          .select("id, student_id, type, from_date, to_date, reason, status, document_url, reviewed_by, created_at")
          .single();
      }, "The leave request could not be reviewed.");
    });
  }

  function uploadLeaveDocument(file) {
    if (!client()) return Promise.resolve(unsupportedLocal("Leave documents"));
    if (!file || !file.name) return Promise.resolve(failure("Choose a document to upload.", "supabase"));
    return currentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      var userId = profileResult.data.user.id;
      var safeName = String(file.name).replace(/[^a-zA-Z0-9._-]/g, "-");
      var path = userId + "/" + Date.now() + "-" + safeName;
      return remote(function () {
        return client().storage.from(LEAVE_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      }, "The leave document could not be uploaded.").then(function (uploadResult) {
        return uploadResult.ok ? success({ path: path }) : uploadResult;
      });
    });
  }

  api.signIn = signIn;
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
  api.getSubjects = getSubjects;
  api.getAttendance = getAttendance;
  api.saveAttendance = saveAttendance;
  api.getLeaves = getLeaves;
  api.createLeave = createLeave;
  api.reviewLeave = reviewLeave;
  api.uploadLeaveDocument = uploadLeaveDocument;
  root.AttendIQSupabase = api;
})(typeof window !== "undefined" ? window : globalThis);


