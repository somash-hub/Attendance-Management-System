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

// Authenticate against Supabase when it is configured. The local store remains
// the explicit fallback when no browser client is available.
form.addEventListener("submit", async function (e) {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const submitButton = form.querySelector(".login-button");

  if (!email) return showError("Please! Enter your email.");
  if (!password) return showError("Please! Enter your password.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showError("Please enter a valid email.");
  }

  submitButton.disabled = true;
  try {
    const result = await AttendIQSupabase.signIn(email, password);
    if (!result.ok) return showError(result.error || "Incorrect email or password.");

    const profile = result.data && (result.data.profile || result.data);
    if (!profile || !profile.role) {
      return showError("Your account profile could not be loaded.");
    }

    message.textContent = `Welcome back, ${profile.name}! Opening your ${profile.role} portal...`;
    message.classList.remove("error");
    message.classList.add("success");
    location.href = "../" + AttendIQ.ROLE_PANELS[profile.role];
  } catch (error) {
    showError(error.message || "Sign-in failed. Please try again.");
  } finally {
    submitButton.disabled = false;
  }
});

const recovery = document.getElementById("passwordRecovery");
const recoveryForm = document.getElementById("recoveryForm");
const recoveryEmail = document.getElementById("recoveryEmail");
const recoveryPassword = document.getElementById("recoveryPassword");
const recoveryEmailField = document.getElementById("recoveryEmailField");
const newPasswordField = document.getElementById("newPasswordField");
const recoverySubmit = document.getElementById("recoverySubmit");
const recoveryTitle = document.getElementById("recoveryTitle");
const recoveryCopy = document.getElementById("recoveryCopy");

function setRecoveryVisible(visible) {
  recovery.hidden = !visible;
  form.hidden = visible;
  if (!visible) recovery.reset();
}

function showRecoveryUpdate() {
  recoveryTitle.textContent = "Choose a new password";
  recoveryCopy.textContent = "Set a new password for your AttendIQ account.";
  recoveryEmailField.hidden = true;
  newPasswordField.hidden = false;
  recoverySubmit.textContent = "Update password";
  setRecoveryVisible(true);
  recoveryPassword.focus();
}

// Supabase sends the recovery link back with a recovery session in the URL hash.
if (window.location.hash.includes("type=recovery")) showRecoveryUpdate();
window.addEventListener("hashchange", function () {
  if (window.location.hash.includes("type=recovery")) showRecoveryUpdate();
});

document.getElementById("forgotPassword").addEventListener("click", function (event) {
  event.preventDefault();
  recoveryEmail.value = emailInput.value.trim();
  recoveryTitle.textContent = "Reset your password";
  recoveryCopy.textContent = "Enter your account email and we will send a recovery link.";
  recoveryEmailField.hidden = false;
  newPasswordField.hidden = true;
  recoverySubmit.textContent = "Send recovery link";
  setRecoveryVisible(true);
  recoveryEmail.focus();
});

document.getElementById("recoveryCancel").addEventListener("click", function () {
  setRecoveryVisible(false);
  emailInput.focus();
});

recoveryForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  recoverySubmit.disabled = true;
  try {
    if (newPasswordField.hidden) {
      const result = await AttendIQSupabase.requestPasswordReset(recoveryEmail.value.trim());
      if (!result.ok) return showError(result.error || "The recovery email could not be sent.");
      message.textContent = "If that account exists, a password recovery link has been sent.";
      message.className = "message success";
      return;
    }
    const result = await AttendIQSupabase.updatePassword(recoveryPassword.value);
    if (!result.ok) return showError(result.error || "The password could not be updated.");
    message.textContent = "Password updated. You can sign in with the new password.";
    message.className = "message success";
    setRecoveryVisible(false);
  } catch (error) {
    showError(error.message || "Password recovery failed. Please try again.");
  } finally {
    recoverySubmit.disabled = false;
  }
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
const demoAccountsPanel = document.getElementById("demoAccountsPanel");

if (window.AttendIQDemoMode) {
  demoAccountsPanel.hidden = false;
  AttendIQ.SEED_USERS.forEach((account) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "demo-chip";
  button.innerHTML = "";
  const role = document.createElement("strong");
  role.textContent = roleNames[account.role];
  const email = document.createElement("small");
  email.textContent = account.email;
  button.append(role, email);

  button.addEventListener("click", () => {
    emailInput.value = account.email;
    passwordInput.value = account.password;
    message.textContent = `Filled the demo ${roleNames[account.role].toLowerCase()} login — press Sign in.`;
    message.className = "message info";
    document.querySelector(".login-button").focus();
  });

  demoAccounts.appendChild(button);
  });
}
