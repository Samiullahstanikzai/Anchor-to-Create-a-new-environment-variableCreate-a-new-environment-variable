const STORAGE_KEY = "env-variables";

const form = document.getElementById("variable-form");
const nameInput = document.getElementById("var-name");
const valueInput = document.getElementById("var-value");
const list = document.getElementById("variable-list");
const emptyState = document.getElementById("empty-state");
const status = document.getElementById("status");

function loadVariables() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveVariables(variables) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(variables));
}

function render() {
  const variables = loadVariables();
  list.innerHTML = "";

  for (const item of variables) {
    const li = document.createElement("li");
    const label = document.createElement("code");
    label.textContent = `${item.name}=${item.value}`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      const next = loadVariables().filter((entry) => entry.name !== item.name);
      saveVariables(next);
      status.textContent = `Removed ${item.name}.`;
      render();
    });

    li.append(label, remove);
    list.append(li);
  }

  emptyState.hidden = variables.length > 0;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = nameInput.value.trim();
  const value = valueInput.value.trim();
  if (!name || !value) {
    return;
  }

  const next = loadVariables().filter((entry) => entry.name !== name);
  next.push({ name, value });
  saveVariables(next);

  status.textContent = `Saved ${name}.`;
  form.reset();
  nameInput.focus();
  render();
});

render();
