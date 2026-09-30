(function (root) {
  "use strict";

  function initializeNotificationCenter(options) {
    var button = document.getElementById(options.buttonId);
    var badge = document.getElementById(options.badgeId);
    if (!button || !badge) return;

    var panel = document.createElement("section");
    panel.className = "notification-center";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Notifications");
    panel.hidden = true;
    var heading = document.createElement("strong");
    heading.textContent = "Notifications";
    var list = document.createElement("div");
    list.className = "notification-center-list";
    panel.append(heading, list);
    document.body.appendChild(panel);
    button.setAttribute("aria-controls", "notificationCenter");
    button.setAttribute("aria-expanded", "false");
    panel.id = "notificationCenter";

    function close() {
      panel.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }

    function showError(message) {
      if (typeof options.onError === "function") options.onError(message);
    }

    async function open() {
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      list.textContent = "Loading notifications…";
      var result = await root.AttendIQSupabase.getNotifications(true);
      if (!result.ok) {
        list.textContent = "Notifications could not be loaded.";
        showError(result.error);
        return;
      }

      var notifications = result.data || [];
      var unreadIds = notifications.filter(function (item) {
        return !item.read_at;
      }).map(function (item) {
        return item.id;
      });
      badge.textContent = String(unreadIds.length);
      badge.hidden = unreadIds.length === 0;
      list.replaceChildren();
      if (!notifications.length) {
        var empty = document.createElement("p");
        empty.textContent = "No notifications yet.";
        list.appendChild(empty);
      } else {
        notifications.forEach(function (item) {
          var entry = document.createElement("article");
          var title = document.createElement("strong");
          var message = document.createElement("p");
          title.textContent = item.title;
          message.textContent = item.message;
          entry.append(title, message);
          if (item.related_table === "leaves" && typeof options.onItem === "function") {
            var openRequest = document.createElement("button");
            openRequest.type = "button";
            openRequest.textContent = "Open leave request";
            openRequest.addEventListener("click", function () {
              close();
              options.onItem(item);
            });
            entry.appendChild(openRequest);
          }
          list.appendChild(entry);
        });
      }

      if (unreadIds.length) {
        var markResult = await root.AttendIQSupabase.markNotificationsRead(unreadIds);
        if (!markResult.ok) {
          showError(markResult.error);
          return;
        }
        badge.textContent = "0";
        badge.hidden = true;
      }
      if (typeof options.onOpen === "function") options.onOpen();
    }

    async function refreshBadge() {
      var result = await root.AttendIQSupabase.getNotifications(false);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      var count = result.data.length;
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }

    button.addEventListener("click", function () {
      if (panel.hidden) {
        open();
      } else {
        close();
      }
    });
    document.addEventListener("click", function (event) {
      if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) {
        close();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") close();
    });
    refreshBadge();
  }

  root.AttendIQNotificationCenter = {
    initialize: initializeNotificationCenter,
  };
})(typeof window !== "undefined" ? window : globalThis);
