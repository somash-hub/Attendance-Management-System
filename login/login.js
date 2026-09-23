// One login form serves every role; the account decides the destination.
const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");
const togglePassword = document.getElementById("togglePassword");

// Show validation feedback in the shared message element.
function showError(text) {
  message.textContent = text;
  message.classList.remove("success");
  message.classList.add("error");
}

// Validate the form, authenticate against stored accounts, then open the
// portal that belongs to the account role.
form.addEventListener("submit", function (e) {
  e.preventDefault();

  // trim removes accidental spaces at the beginning or end of the email.
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email) {
    return showError("Please! Enter your email.");
  }

  if (!password) {
    return showError("Please! Enter your password.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showError("Please enter a valid email.");
  }

  // Accounts are created by administrators, so an unknown email and a wrong
  // password produce the same message.
  const user = AttendIQ.authenticate(email, password);

  if (!user) {
    return showError("Incorrect email or password.");
  }

  AttendIQ.setSession(user);
  message.textContent = `Welcome back, ${user.name}! Opening your ${user.role} portal...`;
  message.classList.remove("error");
  message.classList.add("success");

  // Every page sits one folder deep, so ../ plus the panel path works here.
  location.href = "../" + AttendIQ.ROLE_PANELS[user.role];
});

togglePassword.addEventListener("click", function () {
  // Switch between masked and visible password text.
  const isPasswordHidden = passwordInput.type === "password";

  passwordInput.type = isPasswordHidden ? "text" : "password";
  togglePassword.textContent = isPasswordHidden ? "Hide" : "Show";
});

// Demo account shortcuts fill the form with the seeded credentials so the
// role-based redirect can be tried quickly. The accounts come from the shared
// store, which keeps this list in sync with the seed data.
const roleNames = {
  student: "Student",
  teacher: "Teacher",
  admin: "Administrator",
};
const demoAccounts = document.getElementById("demoAccounts");

AttendIQ.SEED_USERS.forEach((account) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "demo-chip";
  button.innerHTML = `<strong>${roleNames[account.role]}</strong><small>${account.email}</small>`;

  button.addEventListener("click", () => {
    emailInput.value = account.email;
    passwordInput.value = account.password;
    message.textContent = `Filled the demo ${roleNames[account.role].toLowerCase()} login — press Sign in.`;
    message.className = "message info";
    document.querySelector(".login-button").focus();
  });

  demoAccounts.appendChild(button);
});
