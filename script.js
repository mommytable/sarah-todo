const storageKey = "todos:v1";
const useFirebase = () => typeof window !== "undefined" && !!window.firebaseSubscribeTodos;

/** @typedef {{ id: string, text: string, completed: boolean, priority: 'high' | 'medium' | 'low', createdAt?: number }} Todo */

/** @type {Todo[]} */
let todos = [];

const byId = (id) => document.getElementById(id);
const listEl = byId("todo-list");
const emptyEl = byId("empty-state");
const formEl = byId("todo-form");
const inputEl = byId("todo-input");
const priorityEl = byId("todo-priority");

function generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function loadTodos() {
  if (useFirebase()) return; // Firebase 모드에서는 localStorage를 사용하지 않음
  try {
    const raw = localStorage.getItem(storageKey);
    todos = raw ? JSON.parse(raw) : [];
  } catch (_) {
    todos = [];
  }
}

function saveTodos() {
  if (useFirebase()) return; // Firebase 모드에서는 localStorage에 저장하지 않음
  localStorage.setItem(storageKey, JSON.stringify(todos));
}

function updateEmptyState() {
  emptyEl.style.display = todos.length === 0 ? "block" : "none";
}

function compareTodos(a, b) {
  if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
  const order = { high: 3, medium: 2, low: 1 };
  const pa = order[a.priority || 'medium'] || 0;
  const pb = order[b.priority || 'medium'] || 0;
  if (pa !== pb) return pb - pa;
  const ca = a.createdAt || 0;
  const cb = b.createdAt || 0;
  return cb - ca;
}

function createTodoItemElement(todo) {
  const li = document.createElement("li");
  li.className = "todo-item" + (todo.completed ? " completed" : "");
  li.dataset.id = todo.id;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "todo-item__checkbox";
  checkbox.checked = todo.completed;
  checkbox.addEventListener("change", () => {
    toggleCompleted(todo.id, checkbox.checked);
  });

  const text = document.createElement("div");
  text.className = "todo-item__text";
  const badge = document.createElement("span");
  const label = todo.priority === 'high' ? '높음' : todo.priority === 'low' ? '낮음' : '중간';
  const badgeCls = todo.priority === 'high' ? 'todo-item__priority--high' : todo.priority === 'low' ? 'todo-item__priority--low' : 'todo-item__priority--medium';
  badge.className = `todo-item__priority ${badgeCls}`;
  badge.textContent = label;
  const textNode = document.createElement('span');
  textNode.textContent = todo.text;
  text.appendChild(badge);
  text.appendChild(textNode);

  const actions = document.createElement("div");
  actions.className = "todo-item__actions";

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn--ghost";
  editBtn.textContent = "수정";
  editBtn.addEventListener("click", () => startEditMode(li, todo));

  const delBtn = document.createElement("button");
  delBtn.className = "btn btn--danger";
  delBtn.textContent = "삭제";
  delBtn.addEventListener("click", () => deleteTodo(todo.id));

  actions.append(editBtn, delBtn);
  li.append(checkbox, text, actions);
  return li;
}

function renderTodos() {
  listEl.innerHTML = "";
  const sorted = [...todos].sort(compareTodos);
  sorted.forEach((t) => listEl.appendChild(createTodoItemElement(t)));
  updateEmptyState();
}

async function addTodo(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const priority = (priorityEl && priorityEl.value) || 'medium';
  if (useFirebase() && window.firebaseAddTodo) {
    try {
      await window.firebaseAddTodo(trimmed, priority);
      return; // 실시간 구독이 렌더링 처리
    } catch (_) {
      // fallthrough to local if needed
    }
  }
  {
    todos.unshift({ id: generateId(), text: trimmed, completed: false, priority });
  }
  saveTodos();
  renderTodos();
}

async function deleteTodo(id) {
  if (useFirebase() && window.firebaseDeleteTodo) {
    try {
      await window.firebaseDeleteTodo(id);
      return; // 실시간 구독이 렌더링 처리
    } catch (_) {
      alert("삭제에 실패했습니다. 나중에 다시 시도하세요.");
      return;
    }
  }
  const original = [...todos];
  todos = todos.filter((t) => t.id !== id);
  saveTodos();
  renderTodos();
}

async function toggleCompleted(id, completed) {
  if (useFirebase() && window.firebaseUpdateTodo) {
    try {
      await window.firebaseUpdateTodo(id, { completed });
      return; // 실시간 구독이 렌더링 처리
    } catch (_) {
      alert("상태 변경에 실패했습니다. 나중에 다시 시도하세요.");
      return;
    }
  }
  const t = todos.find((x) => x.id === id);
  if (!t) return;
  t.completed = completed;
  saveTodos();
  renderTodos();
}

function startEditMode(li, todo) {
  // Prevent multiple editors in the same item
  if (li.querySelector(".todo-edit")) return;
  li.innerHTML = "";
  li.classList.remove("completed");

  const editor = document.createElement("div");
  editor.className = "todo-edit";

  const input = document.createElement("input");
  input.className = "todo-edit__input";
  input.type = "text";
  input.value = todo.text;
  input.setSelectionRange(todo.text.length, todo.text.length);

  const select = document.createElement('select');
  select.className = 'todo-edit__select';
  select.innerHTML = `
    <option value="high">높음</option>
    <option value="medium">중간</option>
    <option value="low">낮음</option>
  `;
  select.value = todo.priority || 'medium';

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn btn--primary";
  saveBtn.textContent = "저장";
  saveBtn.addEventListener("click", () => commitEdit(todo.id, input.value, select.value));

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn--ghost";
  cancelBtn.textContent = "취소";
  cancelBtn.addEventListener("click", () => renderTodos());

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commitEdit(todo.id, input.value, select.value);
    if (e.key === "Escape") renderTodos();
  });

  editor.append(input, select, saveBtn, cancelBtn);
  li.appendChild(editor);
  input.focus();
}

async function commitEdit(id, newText, newPriority) {
  const trimmed = newText.trim();
  if (!trimmed) {
    // If cleared, treat as delete for convenience
    await deleteTodo(id);
    return;
  }
  if (useFirebase() && window.firebaseUpdateTodo) {
    try {
      await window.firebaseUpdateTodo(id, { text: trimmed, priority: newPriority || 'medium' });
      return; // 실시간 구독이 렌더링 처리
    } catch (_) {
      alert("수정에 실패했습니다. 나중에 다시 시도하세요.");
      return;
    }
  }
  const t = todos.find((x) => x.id === id);
  if (!t) return;
  const prev = t.text;
  t.text = trimmed;
  t.priority = newPriority || t.priority || 'medium';
  saveTodos();
  renderTodos();
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  await addTodo(inputEl.value);
  inputEl.value = "";
  inputEl.focus();
});

// Init
function startFirebaseMode() {
  try { localStorage.removeItem(storageKey); } catch (_) {}
  todos = [];
  renderTodos();
  window.firebaseSubscribeTodos((items) => {
    // 완료여부, 우선순위, 최신순으로 정렬
    todos = items.map((t) => ({ ...t, priority: t.priority || 'medium' })).sort(compareTodos);
    renderTodos();
  });
}

if (useFirebase() && window.firebaseSubscribeTodos) {
  startFirebaseMode();
} else {
  loadTodos();
  renderTodos();
}

// 모듈이 늦게 로드되는 경우 대비
window.addEventListener("firebase-ready", () => {
  if (useFirebase()) {
    startFirebaseMode();
  }
});


