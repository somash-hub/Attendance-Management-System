(function (root) {
  "use strict";

  root.AttendIQAttendance = {
    countsAsAttended: function (status) {
      return status === "Present" || status === "Late";
    },
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
