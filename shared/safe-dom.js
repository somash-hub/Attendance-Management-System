// Shared safe text helpers for plain-script portal rendering.
(function (root) {
  "use strict";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[character];
    });
  }

  root.AttendIQUtils = { escapeHtml: escapeHtml };
})(typeof window !== "undefined" ? window : globalThis);
