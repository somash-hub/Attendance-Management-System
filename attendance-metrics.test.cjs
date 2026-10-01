const assert = require("node:assert/strict");
const { test } = require("node:test");

require("./shared/attendance.js");

test("Present and Late both count as attended, while Absent does not", () => {
  assert.equal(globalThis.AttendIQAttendance.countsAsAttended("Present"), true);
  assert.equal(globalThis.AttendIQAttendance.countsAsAttended("Late"), true);
  assert.equal(globalThis.AttendIQAttendance.countsAsAttended("Absent"), false);
});
