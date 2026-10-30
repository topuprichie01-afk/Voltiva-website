document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());

const signup = document.getElementById("signup-form");
if (signup) signup.addEventListener("submit", event => {
  event.preventDefault();
  const message = document.getElementById("form-message");
  message.textContent = "Your form layout is working! Secure account creation is not connected yet. Do not enter a real password in this demo.";
  message.classList.add("visible");
});

const login = document.getElementById("login-form");
if (login) login.addEventListener("submit", event => {
  event.preventDefault();
  const message = document.getElementById("form-message");
  message.textContent = "Demo login only: there is no real account verification yet. The dashboard is a preview and should not be used for real customer data.";
  message.classList.add("visible");
});

document.querySelectorAll(".demo-order").forEach(form => form.addEventListener("submit", event => {
  event.preventDefault();
  const message = form.querySelector(".form-message");
  message.textContent = "Your demo form is working. No order was sent, no payment was collected, and no data or airtime was delivered.";
  message.classList.add("visible");
}));

function demoLogout(event) {
  event.preventDefault();
  alert("This is a demo dashboard. Real login and logout will be enabled after secure authentication is connected.");
}
