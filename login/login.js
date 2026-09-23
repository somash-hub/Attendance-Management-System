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
