// Shared CSV download helper for AttendIQ report buttons.
(function (root) {
  "use strict";

  function cell(value) {
    if (value === null || value === undefined) return '""';
    return '"' + String(value).replace(/"/g, '""') + '"';
  }

  function download(filename, rows) {
    if (!rows || !rows.length) throw new Error("There is no report data to export.");
    var csv = rows.map(function (row) {
      return row.map(cell).join(",");
    }).join("\r\n");
    var blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  root.AttendIQCsv = { download: download };
})(window);
