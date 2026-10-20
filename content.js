// Intention Setter - floating panel injected into each page.
// The UI lives in a Shadow DOM so page styles cannot break it (and vice versa).
// State is shared across all tabs through chrome.storage.local.

(() => {
  if (window.top !== window || window.__intentionSetterLoaded) return;
  window.__intentionSetterLoaded = true;

  const DEFAULTS = {
    panelVisible: true,
    minimized: false,
    position: null, // { left, top } in px, or null for default bottom-right
    intention: '',
    durationMin: 25,
    status: 'idle', // 'idle' | 'running' | 'checkin' | 'done'
    endTime: null,
    todos: [] // [{ id, text, done }]
  };

  let state = { ...DEFAULTS };
  let tickTimer = null;

  // ---------- Storage / messaging helpers ----------

  function contextAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function save(partial) {
    if (!contextAlive()) return;
    Object.assign(state, partial);
    chrome.storage.local.set(partial);
  }

  function send(message) {
    if (!contextAlive()) {
      showError('Extension was updated - please reload this page.');
      return;
    }
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) {
        showError(chrome.runtime.lastError.message);
      } else if (res && !res.ok) {
        showError(res.error);
      } else {
        showError('');
      }
    });
  }

  // ---------- DOM ----------

  const host = document.createElement('div');
  host.id = 'intention-setter-root';
  host.style.cssText =
    'all: initial; position: fixed; z-index: 2147483647; right: 16px; bottom: 16px;';
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
      .panel {
        width: 280px; background: #ffffff; color: #1f2937; border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,.25); font-size: 13px; line-height: 1.4;
        overflow: hidden; border: 1px solid #e5e7eb;
      }
      .header {
        display: flex; align-items: center; gap: 6px; padding: 8px 10px;
        background: #4f46e5; color: #fff; cursor: move; user-select: none;
      }
      .header .title { flex: 1; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .header button {
        background: transparent; border: 0; color: #fff; font-size: 16px; cursor: pointer;
        width: 22px; height: 22px; line-height: 1; border-radius: 4px; padding: 0;
      }
      .header button:hover { background: rgba(255,255,255,.2); }
      .body { padding: 10px; display: flex; flex-direction: column; gap: 10px; max-height: 70vh; overflow-y: auto; }
      .minimized .body { display: none; }
      .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; font-weight: 600; }
      .row { display: flex; gap: 6px; align-items: center; }
      input[type="text"], input[type="number"] {
        flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px;
        font-size: 13px; color: #111827; background: #fff;
      }
      input[type="number"] { flex: 0 0 64px; }
      button.btn {
        padding: 6px 10px; border-radius: 6px; border: 1px solid #4f46e5; background: #4f46e5;
        color: #fff; font-size: 12px; cursor: pointer; white-space: nowrap;
      }
      button.btn.secondary { background: #fff; color: #4f46e5; }
      button.btn:hover { filter: brightness(1.08); }
      .intention-text { font-weight: 600; font-size: 14px; word-break: break-word; }
      .countdown { font-size: 28px; font-variant-numeric: tabular-nums; font-weight: 700; text-align: center; }
      .checkin { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 8px; }
      .done-msg { background: #dcfce7; border: 1px solid #22c55e; border-radius: 8px; padding: 8px; }
      .error { color: #b91c1c; font-size: 12px; }
      .error:empty { display: none; }
      ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
      li { display: flex; align-items: center; gap: 6px; }
      li span { flex: 1; word-break: break-word; }
      li.done span { text-decoration: line-through; color: #9ca3af; }
      li button { background: none; border: 0; color: #9ca3af; cursor: pointer; font-size: 14px; }
      li button:hover { color: #b91c1c; }
      .muted { color: #6b7280; font-size: 12px; }
      .link { background: none; border: 0; color: #4f46e5; cursor: pointer; font-size: 12px; padding: 0; text-align: left; }
      [hidden] { display: none !important; }
    </style>
    <div class="panel" part="panel">
      <div class="header">
        <span class="title">Intention Setter</span>
        <button class="min-btn" title="Minimize">&#8211;</button>
        <button class="close-btn" title="Hide (reopen from the toolbar icon)">&times;</button>
      </div>
      <div class="body">
        <div class="view-setup">
          <div class="done-msg" hidden></div>
          <div class="section-label">Set your intention</div>
          <div class="row" style="margin-top:6px">
            <input type="text" class="intention-input" maxlength="200" placeholder="What do you intend to do?" />
          </div>
          <div class="row" style="margin-top:6px">
            <input type="number" class="minutes-input" min="1" max="600" step="1" />
            <span class="muted">minutes</span>
            <span style="flex:1"></span>
            <button class="btn start-btn">Start</button>
          </div>
        </div>

        <div class="view-running" hidden>
          <div class="section-label">Current intention</div>
          <div class="intention-text running-intention"></div>
          <div class="countdown">00:00</div>
          <div class="row">
            <button class="btn complete-btn">Done early</button>
            <button class="btn secondary cancel-btn">Cancel</button>
          </div>
        </div>

        <div class="view-checkin checkin" hidden>
          <div><strong>Time's up!</strong> Did you complete your intention?</div>
          <div class="intention-text checkin-intention" style="margin:6px 0"></div>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn yes-btn">Yes!</button>
            <button class="btn secondary extend-5">+5 min</button>
            <button class="btn secondary extend-15">+15 min</button>
            <button class="btn secondary end-btn">No, end</button>
          </div>
        </div>

        <div class="error"></div>

        <div class="todos">
          <div class="section-label">To-do list</div>
          <div class="row" style="margin:6px 0">
            <input type="text" class="todo-input" maxlength="200" placeholder="Add a task" />
            <button class="btn add-todo">Add</button>
          </div>
          <ul class="todo-list"></ul>
          <div class="muted empty-todos">No tasks yet.</div>
          <button class="link clear-done" hidden>Clear completed</button>
        </div>
      </div>
    </div>
  `;

  const $ = (sel) => shadow.querySelector(sel);
  const el = {
    panel: $('.panel'),
    header: $('.header'),
    title: $('.title'),
    minBtn: $('.min-btn'),
    closeBtn: $('.close-btn'),
    viewSetup: $('.view-setup'),
    viewRunning: $('.view-running'),
    viewCheckin: $('.view-checkin'),
    doneMsg: $('.done-msg'),
    intentionInput: $('.intention-input'),
    minutesInput: $('.minutes-input'),
    startBtn: $('.start-btn'),
    runningIntention: $('.running-intention'),
    countdown: $('.countdown'),
    completeBtn: $('.complete-btn'),
    cancelBtn: $('.cancel-btn'),
    checkinIntention: $('.checkin-intention'),
    yesBtn: $('.yes-btn'),
    extend5: $('.extend-5'),
    extend15: $('.extend-15'),
    endBtn: $('.end-btn'),
    error: $('.error'),
    todoInput: $('.todo-input'),
    addTodo: $('.add-todo'),
    todoList: $('.todo-list'),
    emptyTodos: $('.empty-todos'),
    clearDone: $('.clear-done')
  };

  // Stop keystrokes inside the panel from triggering page shortcuts (e.g. YouTube, Gmail).
  ['keydown', 'keyup', 'keypress'].forEach((type) =>
    shadow.addEventListener(type, (e) => e.stopPropagation())
  );

  // ---------- Rendering ----------

  function formatRemaining(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function showError(message) {
    el.error.textContent = message || '';
  }

  function updateCountdown() {
    if (state.status !== 'running' || !state.endTime) return;
    const text = formatRemaining(state.endTime - Date.now());
    el.countdown.textContent = text;
    if (state.minimized) el.title.textContent = `${text} - ${state.intention}`;
  }

  function render() {
    host.style.display = state.panelVisible ? '' : 'none';

    // Position
    if (state.position) {
      const { left, top } = clampToViewport(state.position.left, state.position.top);
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    }

    el.panel.classList.toggle('minimized', state.minimized);
    el.minBtn.innerHTML = state.minimized ? '&#9634;' : '&#8211;';
    el.minBtn.title = state.minimized ? 'Expand' : 'Minimize';

    const { status } = state;
    el.viewSetup.hidden = !(status === 'idle' || status === 'done');
    el.viewRunning.hidden = status !== 'running';
    el.viewCheckin.hidden = status !== 'checkin';

    el.doneMsg.hidden = status !== 'done';
    if (status === 'done') el.doneMsg.textContent = `\u2705 Completed: ${state.intention}`;

    el.runningIntention.textContent = state.intention;
    el.checkinIntention.textContent = state.intention;

    // Only fill inputs when the user isn't typing in them.
    if (shadow.activeElement !== el.minutesInput) el.minutesInput.value = state.durationMin;

    if (state.minimized) {
      el.title.textContent =
        status === 'checkin'
          ? `\u23F0 Time's up - ${state.intention}`
          : status === 'running'
          ? `${formatRemaining(state.endTime - Date.now())} - ${state.intention}`
          : 'Intention Setter';
    } else {
      el.title.textContent = 'Intention Setter';
    }

    clearInterval(tickTimer);
    tickTimer = null;
    if (status === 'running' && state.panelVisible) {
      updateCountdown();
      tickTimer = setInterval(updateCountdown, 1000);
    }

    renderTodos();
  }

  function renderTodos() {
    const todos = Array.isArray(state.todos) ? state.todos : [];
    el.todoList.replaceChildren(
      ...todos.map((todo) => {
        const li = document.createElement('li');
        li.className = todo.done ? 'done' : '';

        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = Boolean(todo.done);
        box.addEventListener('change', () => toggleTodo(todo.id));

        const text = document.createElement('span');
        text.textContent = todo.text;

        const del = document.createElement('button');
        del.textContent = '\u00D7';
        del.title = 'Delete task';
        del.addEventListener('click', () => deleteTodo(todo.id));

        li.append(box, text, del);
        return li;
      })
    );
    el.emptyTodos.hidden = todos.length > 0;
    el.clearDone.hidden = !todos.some((t) => t.done);
  }

  // ---------- Actions ----------

  function startIntention() {
    const intention = el.intentionInput.value.trim();
    const durationMin = Number(el.minutesInput.value);
    if (!intention) {
      showError('Please enter an intention.');
      el.intentionInput.focus();
      return;
    }
    if (!Number.isFinite(durationMin) || durationMin < 1 || durationMin > 600) {
      showError('Minutes must be between 1 and 600.');
      el.minutesInput.focus();
      return;
    }
    el.intentionInput.value = '';
    send({ type: 'start', intention, durationMin });
  }

  function addTodo() {
    const text = el.todoInput.value.trim();
    if (!text) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    save({ todos: [...state.todos, { id, text, done: false }] });
    el.todoInput.value = '';
    renderTodos();
  }

  function toggleTodo(id) {
    save({ todos: state.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) });
    renderTodos();
  }

  function deleteTodo(id) {
    save({ todos: state.todos.filter((t) => t.id !== id) });
    renderTodos();
  }

  el.startBtn.addEventListener('click', startIntention);
  el.intentionInput.addEventListener('keydown', (e) => e.key === 'Enter' && startIntention());
  el.minutesInput.addEventListener('keydown', (e) => e.key === 'Enter' && startIntention());
  el.completeBtn.addEventListener('click', () => send({ type: 'complete' }));
  el.cancelBtn.addEventListener('click', () => send({ type: 'cancel' }));
  el.yesBtn.addEventListener('click', () => send({ type: 'complete' }));
  el.extend5.addEventListener('click', () => send({ type: 'extend', minutes: 5 }));
  el.extend15.addEventListener('click', () => send({ type: 'extend', minutes: 15 }));
  el.endBtn.addEventListener('click', () => send({ type: 'cancel' }));
  el.addTodo.addEventListener('click', addTodo);
  el.todoInput.addEventListener('keydown', (e) => e.key === 'Enter' && addTodo());
  el.clearDone.addEventListener('click', () => {
    save({ todos: state.todos.filter((t) => !t.done) });
    renderTodos();
  });
  el.minBtn.addEventListener('click', () => {
    save({ minimized: !state.minimized });
    render();
  });
  el.closeBtn.addEventListener('click', () => {
    save({ panelVisible: false });
    render();
  });

  // ---------- Dragging ----------

  function clampToViewport(left, top) {
    const rect = host.getBoundingClientRect();
    const w = rect.width || 280;
    const h = rect.height || 40;
    const maxLeft = Math.max(0, window.innerWidth - w);
    const maxTop = Math.max(0, window.innerHeight - h);
    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop)
    };
  }

  let drag = null;
  el.header.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    const rect = host.getBoundingClientRect();
    drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    el.header.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  el.header.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const { left, top } = clampToViewport(e.clientX - drag.dx, e.clientY - drag.dy);
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
  });
  el.header.addEventListener('pointerup', (e) => {
    if (!drag) return;
    drag = null;
    el.header.releasePointerCapture(e.pointerId);
    const rect = host.getBoundingClientRect();
    save({ position: { left: Math.round(rect.left), top: Math.round(rect.top) } });
  });
  window.addEventListener('resize', () => state.position && render());

  // ---------- Init & sync across tabs ----------

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in DEFAULTS) state[key] = newValue === undefined ? DEFAULTS[key] : newValue;
    }
    render();
  });

  chrome.storage.local.get(DEFAULTS, (stored) => {
    state = { ...DEFAULTS, ...stored };
    (document.body || document.documentElement).appendChild(host);
    render();
  });
})();
