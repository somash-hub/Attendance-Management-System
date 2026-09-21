const form = document.getElementById("signupForm");
const message = document.getElementById("message");
const steps = [...document.querySelectorAll(".signup-step")];
const indicators = [...document.querySelectorAll(".step")];
const continueButton = document.getElementById("continueButton");
const backButton = document.getElementById("backButton");
let currentStep = 1;

// Display validation feedback without changing the current signup step.
function showMessage(text) {
    message.textContent = text;
    message.className = "message error";
}

// Show only the active step and update the progress indicator and buttons.
function updateStep() {
    steps.forEach((step) => step.classList.toggle("active", Number(step.dataset.step) === currentStep));
    indicators.forEach((step, index) => step.classList.toggle("active", index + 1 === currentStep));
    backButton.hidden = currentStep === 1;
    continueButton.textContent = currentStep === 3 ? "Create account" : "Continue";
}

// Validate the current step before moving forward.
continueButton.addEventListener("click", () => {
    const activeStep = steps[currentStep - 1];
    if (!activeStep.querySelector(":invalid")) {
        if (currentStep === 1) {
            // These rules come from the TU student-registration format.
            const symbol = document.getElementById("symbol").value;
            const email = document.getElementById("email").value.trim();
            if (!/^\d{8}$/.test(symbol)) return showMessage("TU Symbol No. must be exactly 8 digits.");
            if (!email.endsWith("@student.tu.edu.np")) return showMessage("Use your @student.tu.edu.np college email.");
        }
        if (currentStep === 3) {
            // The final step checks password strength and confirmation.
            const password = document.getElementById("password").value;
            if (password.length < 8) return showMessage("Password must be at least 8 characters.");
            if (password !== document.getElementById("confirmPassword").value) return showMessage("Passwords do not match.");
            message.textContent = "Account details are valid and ready to connect to your backend.";
            message.className = "message success";
            return;
        }
        currentStep += 1;
        message.className = "message";
        updateStep();
    } else {
        showMessage("Please complete the required fields before continuing.");
    }
});

backButton.addEventListener("click", () => {
    // Return to the previous step while preserving entered values.
    currentStep -= 1;
    message.className = "message";
    updateStep();
});