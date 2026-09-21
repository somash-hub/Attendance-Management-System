const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("message");
const togglePassword = document.getElementById("togglePassword");
const roleTabs = document.querySelectorAll(".role-tab");
const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");
let selectedRole = "student";

// Text shown above the form changes when the user selects a role.
const roleContent = {
  student: ["Student Login", "Sign in with your @student.tu.edu.np address"],
  teacher: ["Teacher Login", "Sign in with your institutional account"],
  admin: ["Admin Login", "Sign in with your administrator account"],
};

// Keep the selected tab, title, subtitle, and email hint in sync.
roleTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    selectedRole = tab.dataset.role;
    roleTabs.forEach((item) => item.classList.toggle("active", item === tab));
    pageTitle.textContent = roleContent[selectedRole][0];
    pageSubtitle.textContent = roleContent[selectedRole][1];
    emailInput.placeholder =
      selectedRole === "student"
        ? "you@student.tu.edu.np"
        : "Enter your institutional email";
  });
});

// Validate the login form before it would be sent to a backend.
form.addEventListener("submit", function (e) {
  e.preventDefault();

  // trim removes accidental spaces at the beginning or end of the values.
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email) {
    message.textContent = "Please! Enter your email.";
    message.classList.remove("success");
    message.classList.add("error");
    return;
  }

  if (!password) {
    message.textContent = "Please! Enter your password.";
    message.classList.remove("success");
    message.classList.add("error");
    return;
  }

  // First check the general email format, then apply the student-domain rule.
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (
    !validEmail ||
    (selectedRole === "student" && !email.endsWith("@student.tu.edu.np"))
  ) {
    message.textContent = "Please enter a valid email.";
    message.classList.remove("success");
    message.classList.add("error");
    return;
  }

  if (password.length < 8) {
    message.textContent = "Password must be at least 8 characters.";
    message.classList.remove("success");
    message.classList.add("error");
    return;
  }

  // The password must contain all four required character types.
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (!hasUppercase || !hasLowercase || !hasNumber || !hasSymbol) {
    message.textContent =
      "Password must include uppercase, lowercase, number, and symbol.";
    message.classList.remove("success");
    message.classList.add("error");
    return;
  }

  message.textContent = "Login Successful";
  message.classList.remove("error");
  message.classList.add("success");
});

togglePassword.addEventListener("click", function () {
  // Switch between masked and visible password text.
  const isPasswordHidden = passwordInput.type === "password";

  passwordInput.type = isPasswordHidden ? "text" : "password";
  togglePassword.textContent = isPasswordHidden ? "Hide" : "Show";
});
