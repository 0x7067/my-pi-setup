const form = document.querySelector("#settings");
const port = document.querySelector("#port");
const token = document.querySelector("#token");
const status = document.querySelector("#status");

const saved = await chrome.storage.local.get({ port: 9224, token: "" });
port.value = String(saved.port);
token.value = saved.token;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await chrome.storage.local.set({
    port: Number(port.value),
    token: token.value.trim(),
  });
  status.textContent =
    "Saved. The toolbar badge will read “on” when Pi is connected.";
});
