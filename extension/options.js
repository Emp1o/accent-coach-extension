const form = document.getElementById("settingsForm");
const statusEl = document.getElementById("status");
const fileInput = document.getElementById("fileInput");

async function init() {
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  Object.entries(state.settings).forEach(([key, value]) => {
    const input = form.elements.namedItem(key);
    if (input) input.value = value;
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  for (const key of Object.keys(payload)) {
    const value = payload[key];
    if (value !== "" && !Number.isNaN(Number(value)) && key !== "apiBaseUrl") {
      payload[key] = Number(value);
    }
  }
  await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", payload });
  statusEl.textContent = "Настройки сохранены.";
});

document.getElementById("importBtn").addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  const payload = JSON.parse(text);
  await chrome.runtime.sendMessage({ type: "IMPORT_CARDS", payload });
  statusEl.textContent = "Карточки импортированы.";
});

init();
