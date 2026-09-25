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
      roll: String(value.roll || "").trim(),
      program: String(value.program || "BSc CSIT").trim(),
      department: String(value.department || value.program || "BSc CSIT").trim(),
      batch: String(value.batch || "").trim(),
      section: String(value.section || "A").trim(),
      section_id: String(value.section_id || "").trim(),
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
    if (!client()) return Promise.resolve(unsupportedLocal("Student records"));
    return remote(function () {
      return client().from("students")
        .select("id, profile_id, roll, name, email, program, batch, section, active, archived_at, enrollments!inner(id, section_id, status)")
        .eq("active", true)
        .eq("enrollments.status", "active")
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
      section_id: offering.section_id,
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
          .select("id, subject_code, section_id, teacher_id, status, subjects!inner(code, name, semester, program)")
          .eq("teacher_id", profileResult.data.user.id)
          .eq("status", "active")
          .order("subject_code", { ascending: true });
      }, "Assigned course offerings could not be loaded.");
    });
  }

  function getTeacherStudents() {
    return getTeacherCourseOfferings().then(function (offeringResult) {
      if (!offeringResult.ok) return offeringResult;
      var sectionIds = Array.from(new Set(offeringResult.data.map(function (row) {
        return row.section_id;
      }).filter(Boolean)));
      if (!sectionIds.length) return success([], "supabase");
      return remote(function () {
        return client().from("students")
          .select("id, profile_id, roll, name, email, program, batch, section, active, enrollments!inner(id, section_id, status)")
          .eq("active", true)
          .in("enrollments.section_id", sectionIds)
          .eq("enrollments.status", "active")
          .order("roll", { ascending: true });
      }, "Assigned students could not be loaded.");
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
          .select("id, profile_id, roll, name, email, program, batch, section, active, enrollments!inner(id, section_id, status)")
          .eq("profile_id", profileResult.data.user.id)
          .eq("active", true)
          .eq("enrollments.status", "active")
          .limit(1)
          .single();
      }, "Your student profile could not be loaded.");
    });
  }

  function getMySubjects() {
    return getMyStudentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      var sectionIds = Array.from(new Set((profileResult.data.enrollments || []).map(function (row) {
        return row.section_id;
      }).filter(Boolean)));
      if (!sectionIds.length) return success([], "supabase");
      return remote(function () {
        return client().from("course_offerings")
          .select("id, subject_code, section_id, subjects!inner(code, name, semester, program)")
          .in("section_id", sectionIds)
          .eq("status", "active")
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

  function getMyAttendance(filters) {
    return getMyStudentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      var value = filters || {};
      return remote(function () {
        var query = client().from("attendance")
          .select("id, student_id, subject_code, course_offering_id, date_ad, date_bs, time, status, marked_by, created_at")
          .eq("student_id", profileResult.data.id)
          .order("date_ad", { ascending: false })
          .order("time", { ascending: true });
        return applyAttendanceFilters(query, value);
      }, "Your attendance could not be loaded.");
    });
  }

  function getMyLeaves(filters) {
    return getMyStudentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      var value = filters || {};
      return remote(function () {
        var query = client().from("leaves")
          .select("id, student_id, section_id, type, from_date, to_date, reason, status, document_url, reviewed_by, created_at")
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

  function getSemesters() {
    if (!client()) return local(function (store) { return store.getSemesters(); }, "Semesters could not be loaded.");
    return remote(function () {
      return client().from("semesters")
        .select("id, academic_year_id, name, number, start_date, end_date, is_current")
        .eq("is_current", true)
        .order("number", { ascending: false });
    }, "Semesters could not be loaded.");
  }

  function getSections() {
    if (!client()) return local(function (store) { return store.getSections(); }, "Academic sections could not be loaded.");
    return remote(function () {
      return client().from("sections")
        .select("id, academic_year_id, semester_id, program, batch, name, is_current")
        .eq("is_current", true)
        .order("program", { ascending: true })
        .order("batch", { ascending: true })
        .order("name", { ascending: true });
    }, "Academic sections could not be loaded.");
  }

  function getCourseOfferings(filters) {
    if (!client()) return local(function (store) { return store.getOfferings(filters && filters.include_archived); }, "Course offerings could not be loaded.");
    var value = filters || {};
    return remote(function () {
      var query = client().from("course_offerings")
        .select("id, subject_code, semester_id, section_id, teacher_id, status, created_at, updated_at, subjects!inner(code, name, semester, program, credits, course_type, active), sections!inner(program, batch, name, is_current), semesters!inner(name, number, is_current)")
        .order("subject_code", { ascending: true });
      if (!value.include_archived) query = query.eq("status", "active");
      if (value.semester_id) query = query.eq("semester_id", value.semester_id);
      if (value.section_id) query = query.eq("section_id", value.section_id);
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
        p_section_id: String(value.section_id || "").trim(),
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
      }).single();
    }, "The course offering could not be updated.");
  }

  function archiveCourseOffering(id) {
    if (!client()) return local(function (store) { return store.archiveOffering(id); }, "The course offering could not be archived.");
    return remote(function () {
      return client().rpc("admin_archive_course_offering", { p_offering_id: String(id || "").trim() }).single();
    }, "The course offering could not be archived.");
  }

  function getEnrollmentStudents() {
    if (!client()) return Promise.resolve(unsupportedLocal("Enrollment records"));
    return remote(function () {
      return client().from("students")
        .select("id, profile_id, roll, name, email, program, batch, section, active, archived_at, enrollments(id, section_id, status, enrolled_at, archived_at)")
        .eq("active", true)
        .order("roll", { ascending: true });
    }, "Student enrollment records could not be loaded.");
  }

  function setStudentEnrollment(input) {
    var value = input || {};
    if (!client()) return Promise.resolve(unsupportedLocal("Enrollment management"));
    if (!value.student_id || !value.section_id) {
      return Promise.resolve(failure("Student and section are required.", "supabase"));
    }
    return remote(function () {
      return client().rpc("admin_set_student_enrollment", {
        p_student_id: String(value.student_id).trim(),
        p_section_id: String(value.section_id).trim(),
      }).single();
    }, "The student enrollment could not be updated.");
  }

  function archiveStudentEnrollment(studentId) {
    if (!client()) return Promise.resolve(unsupportedLocal("Enrollment management"));
    if (!studentId) return Promise.resolve(failure("Student is required.", "supabase"));
    return remote(function () {
      return client().rpc("admin_archive_student_enrollment", { p_student_id: String(studentId).trim() }).single();
    }, "The student enrollment could not be archived.");
  }

  function updateStudent(input) {
    if (!client()) return Promise.resolve(unsupportedLocal("Student records"));
    var value = input || {};
    var required = [value.id, value.name, value.email, value.roll, value.program, value.batch, value.section_id];
    if (required.some(function (item) { return !String(item || "").trim(); })) {
      return Promise.resolve(failure("Complete every student field before saving.", "supabase"));
    }
    return remote(function () {
      return client().rpc("admin_update_student", {
        p_student_id: String(value.id).trim(),
        p_name: String(value.name).trim(),
        p_email: String(value.email).trim(),
        p_roll: String(value.roll).trim(),
        p_program: String(value.program).trim(),
        p_batch: String(value.batch).trim(),
        p_section_id: String(value.section_id).trim(),
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
          .select("id, student_id, subject_code, course_offering_id, date_ad, date_bs, time, status, marked_by, created_at")
          .in("course_offering_id", offeringIds)
          .order("date_ad", { ascending: false })
          .order("time", { ascending: true });
        return applyAttendanceFilters(query, value);
      }, "Assigned attendance could not be loaded.");
    });
  }

  function getTeacherLeaves(filters) {
    return getTeacherCourseOfferings().then(function (offeringResult) {
      if (!offeringResult.ok) return offeringResult;
      var sectionIds = Array.from(new Set(offeringResult.data.map(function (row) {
        return row.section_id;
      }).filter(Boolean)));
      if (!sectionIds.length) return success([], "supabase");
      var value = filters || {};
      return remote(function () {
        var query = client().from("leaves")
          .select("id, student_id, section_id, type, from_date, to_date, reason, status, document_url, reviewed_by, created_at")
          .in("section_id", sectionIds)
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
    if (!client()) return Promise.resolve(unsupportedLocal("Attendance records"));
    var value = filters || {};
    return remote(function () {
      var query = client().from("attendance")
        .select("id, student_id, subject_code, course_offering_id, date_ad, date_bs, time, status, marked_by, created_at")
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
          .select("id, student_id, subject_code, course_offering_id, date_ad, date_bs, time, status, marked_by, created_at");
      }, "Attendance could not be saved.");
    });
  }

  function getLeaves(filters) {
    if (!client()) return Promise.resolve(unsupportedLocal("Leave requests"));
    var value = filters || {};
    return remote(function () {
      var query = client().from("leaves")
        .select("id, student_id, section_id, type, from_date, to_date, reason, status, document_url, reviewed_by, created_at")
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
          .select("id, enrollments!inner(section_id, status)")
          .eq("profile_id", userId)
          .eq("active", true)
          .eq("enrollments.status", "active")
          .limit(1)
          .single();
      }, "Your student record could not be found.").then(function (studentResult) {
        if (!studentResult.ok) return studentResult;
        var row = {
          student_id: studentResult.data.id,
          section_id: studentResult.data.enrollments[0].section_id,
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
    if (LEAVE_STATUSES.indexOf(status) === -1) {
      return Promise.resolve(failure("Choose pending, approved, or rejected.", "supabase"));
    }
    return currentProfile().then(function (profileResult) {
      if (!profileResult.ok) return profileResult;
      return remote(function () {
        return client().from("leaves")
          .update({
            status: status,
            reviewed_by: status === "pending" ? null : profileResult.data.user.id,
          })
          .eq("id", leaveId)
          .select("id, student_id, type, from_date, to_date, reason, status, document_url, reviewed_by, created_at")
          .single();
      }, "The leave request could not be reviewed.");
    });
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
  api.getTeacherStudents = getTeacherStudents;
  api.getTeacherSubjects = getTeacherSubjects;
  api.getTeacherAttendance = getTeacherAttendance;
  api.getTeacherLeaves = getTeacherLeaves;
  api.getMyStudentProfile = getMyStudentProfile;
  api.getMySubjects = getMySubjects;
  api.getMyAttendance = getMyAttendance;
  api.getMyLeaves = getMyLeaves;
  api.getSections = getSections;
  api.getSemesters = getSemesters;
  api.getCourseOfferings = getCourseOfferings;
  api.createCourseOffering = createCourseOffering;
  api.updateCourseOffering = updateCourseOffering;
  api.archiveCourseOffering = archiveCourseOffering;
  api.getEnrollmentStudents = getEnrollmentStudents;
  api.setStudentEnrollment = setStudentEnrollment;
  api.archiveStudentEnrollment = archiveStudentEnrollment;
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
  api.uploadLeaveDocument = uploadLeaveDocument;
  root.AttendIQSupabase = api;
})(typeof window !== "undefined" ? window : globalThis);


