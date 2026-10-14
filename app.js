/* =====================================================================
   MI AGENDA — lógica principal
   Tareas diarias con arrastre, hábitos, estadísticas, recordatorios,
   sincronización Firebase y Google Calendar. Autor: para Paco.
   ===================================================================== */
'use strict';

const CFG = window.APP_CONFIG || {};
const LS_KEY = 'miagenda_state_v1';

/* ---------------------- utilidades ---------------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dstr(new Date());
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const IMP = { alta: 'Alta', media: 'Media', baja: 'Baja' };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 2600);
}

/* ---------------------- estado ---------------------- */
const DEFAULT_AREAS = [
  { name: 'Trabajo',   color: '#4f46e5' },
  { name: 'Legal',     color: '#0ea5a4' },
  { name: 'Familia',   color: '#f59e0b' },
  { name: 'Salud',     color: '#10b981' },
  { name: 'Espiritual', color: '#8b5cf6' },
  { name: 'Personal',  color: '#ec4899' }
];

let state = {
  tasks: [], habits: [],
  settings: {
    theme: 'light',
    reminderTimes: [CFG.defaultReminderTime || '19:00'],
    notifications: false,
    areas: DEFAULT_AREAS.slice()
  },
  updatedAt: 0
};
let currentView = 'hoy';
let filter = 'all';
let statRange = 7;
let qaImportance = 'media';
let charts = {};

/* ---------------------- persistencia ---------------------- */
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      state = Object.assign(state, p);
      // defaults SIN reminderTimes, para no pisar la migración de la hora antigua
      state.settings = Object.assign({ theme: 'light', notifications: false, areas: DEFAULT_AREAS.slice() }, p.settings || {});
      // migrar de una sola hora (reminderTime) a varias (reminderTimes)
      if (!Array.isArray(state.settings.reminderTimes)) {
        state.settings.reminderTimes = state.settings.reminderTime ? [state.settings.reminderTime] : ['19:00'];
      }
      delete state.settings.reminderTime;
      if (!state.settings.reminderTimes.length) state.settings.reminderTimes = ['19:00'];
      if (!state.settings.areas || !state.settings.areas.length) state.settings.areas = DEFAULT_AREAS.slice();
    }
  } catch (e) { console.warn('No se pudo leer el estado local', e); }
}
let _saveTimer = null, _skipCloud = false;
function save(sync = true) {
  state.updatedAt = Date.now();
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { console.warn(e); }
  if (sync && !_skipCloud) { clearTimeout(_saveTimer); _saveTimer = setTimeout(cloudWrite, 700); }
}

/* ---------------------- arrastre de pendientes ---------------------- */
function rolloverTasks() {
  const t = todayStr();
  let moved = 0;
  state.tasks.forEach(task => {
    if (!task.done && task.date < t) {
      task.origDate = task.origDate || task.date;
      task.rolledOver = (task.rolledOver || 0) + daysBetween(task.date, t);
      task.date = t;
      moved++;
    }
  });
  if (moved) save();
  return moved;
}
function daysBetween(a, b) {
  return Math.max(1, Math.round((parseD(b) - parseD(a)) / 86400000));
}

/* ---------------------- áreas ---------------------- */
function areaColor(name) {
  const a = state.settings.areas.find(x => x.name === name);
  return a ? a.color : 'var(--muted)';
}

/* =====================================================================
   VISTA: HOY
   ===================================================================== */
function renderHoy() {
  const t = todayStr();
  const todays = state.tasks.filter(x => x.date === t);
  const done = todays.filter(x => x.done).length;
  const total = todays.length;

  // anillo de progreso
  const pct = total ? Math.round((done / total) * 100) : 0;
  const circ = 2 * Math.PI * 52;
  $('#ring-fill').style.strokeDashoffset = circ - (circ * pct) / 100;
  $('#ring-pct').textContent = pct + '%';
  $('#ring-sub').textContent = `${done} de ${total}`;
  const mot = $('#hoy-motivation');
  if (!total) mot.textContent = 'Agrega tu primera tarea del día.';
  else if (done === total) mot.textContent = '¡Excelente! Completaste todo por hoy. 🎉';
  else mot.textContent = `Te quedan ${total - done} pendiente${total - done === 1 ? '' : 's'}.`;

  // filtro
  let list = todays;
  if (filter === 'pending') list = todays.filter(x => !x.done);
  else if (filter === 'done') list = todays.filter(x => x.done);
  else if (filter === 'carried') list = todays.filter(x => x.rolledOver > 0);

  // orden: pendientes primero, luego por importancia, luego por hora
  const rank = { alta: 0, media: 1, baja: 2 };
  list = list.slice().sort((a, b) =>
    (a.done - b.done) || (rank[a.importance] - rank[b.importance]) ||
    ((a.time || '99:99').localeCompare(b.time || '99:99')));

  const ul = $('#task-list'); ul.innerHTML = '';
  list.forEach(task => ul.appendChild(taskEl(task)));
  $('#hoy-empty').hidden = list.length > 0;
}

function taskEl(task) {
  const li = document.createElement('li');
  li.className = `task imp-${task.importance}${task.done ? ' done' : ''}`;
  const meta = [];
  if (task.area) meta.push(`<span class="tag tag-area"><span class="swatch" style="background:${areaColor(task.area)}"></span>${task.area}</span>`);
  if (task.time) meta.push(`<span class="tag tag-time">🕑 ${task.time}</span>`);
  if (task.rolledOver > 0) meta.push(`<span class="tag tag-carried">↻ Arrastrada ${task.rolledOver}×</span>`);
  li.innerHTML = `
    <button class="task-check" aria-label="Marcar">
      <svg viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="task-main">
      <div class="task-title">${esc(task.title)}</div>
      ${task.notes ? `<div class="muted small" style="margin-top:3px">${esc(task.notes)}</div>` : ''}
      <div class="task-meta">${meta.join('')}</div>
    </div>
    <div class="task-actions">
      <button class="t-edit" aria-label="Editar"><svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button class="t-del" aria-label="Eliminar"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    </div>`;
  $('.task-check', li).onclick = () => toggleTask(task.id);
  $('.t-edit', li).onclick = () => openTaskModal(task);
  $('.t-del', li).onclick = () => { if (confirm('¿Eliminar esta tarea?')) { state.tasks = state.tasks.filter(x => x.id !== task.id); save(); renderAll(); } };
  return li;
}

function toggleTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.completedAt = t.done ? todayStr() : null;
  save(); renderHoy();
  if (t.done) toast('Tarea completada ✓');
}

function addTask(data) {
  state.tasks.push(Object.assign({
    id: uid(), title: '', notes: '', area: state.settings.areas[0]?.name || '',
    importance: 'media', time: '', date: todayStr(), done: false,
    completedAt: null, createdAt: todayStr(), rolledOver: 0, origDate: null
  }, data));
  save(); renderAll();
}

/* =====================================================================
   MODAL de tarea (crear / editar)
   ===================================================================== */
function openTaskModal(task) {
  const edit = !!task;
  const areas = state.settings.areas.map(a =>
    `<option value="${esc(a.name)}" ${task && task.area === a.name ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  modal(edit ? 'Editar tarea' : 'Nueva tarea', `
    <label>Título</label>
    <input id="m-title" type="text" value="${edit ? esc(task.title) : ''}" placeholder="Describe la tarea" />
    <label>Notas (opcional)</label>
    <textarea id="m-notes" placeholder="Detalles...">${edit ? esc(task.notes || '') : ''}</textarea>
    <label>Área de enfoque</label>
    <select id="m-area">${areas}</select>
    <label>Importancia</label>
    <div class="imp-select" id="m-imp">
      <button type="button" class="imp alta ${task && task.importance === 'alta' ? 'active' : ''}" data-imp="alta">Alta</button>
      <button type="button" class="imp media ${!task || task.importance === 'media' ? 'active' : ''}" data-imp="media">Media</button>
      <button type="button" class="imp baja ${task && task.importance === 'baja' ? 'active' : ''}" data-imp="baja">Baja</button>
    </div>
    <label>Fecha</label>
    <input id="m-date" type="date" value="${edit ? task.date : todayStr()}" />
    <label>Hora (opcional)</label>
    <input id="m-time" type="time" value="${edit ? (task.time || '') : ''}" />
    <div class="modal-actions">
      <button class="btn-primary" id="m-save">${edit ? 'Guardar' : 'Agregar'}</button>
    </div>`);
  let imp = edit ? task.importance : 'media';
  $$('#m-imp .imp').forEach(b => b.onclick = () => { imp = b.dataset.imp; $$('#m-imp .imp').forEach(x => x.classList.remove('active')); b.classList.add('active'); });
  $('#m-save').onclick = () => {
    const title = $('#m-title').value.trim();
    if (!title) { toast('Escribe un título'); return; }
    const d = { title, notes: $('#m-notes').value.trim(), area: $('#m-area').value, importance: imp, date: $('#m-date').value, time: $('#m-time').value };
    if (edit) { Object.assign(task, d); save(); renderAll(); }
    else addTask(d);
    closeModal();
  };
}

/* =====================================================================
   VISTA: HÁBITOS
   ===================================================================== */
function renderHabitos() {
  const ul = $('#habit-list'); ul.innerHTML = '';
  state.habits.forEach(h => ul.appendChild(habitEl(h)));
  $('#habit-empty').hidden = state.habits.length > 0;
}

function isScheduled(h, d) {
  if (h.days === 'daily' || !h.days) return true;
  return h.days.includes(d.getDay());
}
function habitProgress(h, win = 7) {
  let sched = 0, done = 0;
  const now = new Date();
  for (let i = 0; i < win; i++) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    if (isScheduled(h, d)) { sched++; if (h.history[dstr(d)]) done++; }
  }
  return { sched, done, pct: sched ? Math.round((done / sched) * 100) : 0 };
}
function habitStreak(h) {
  let streak = 0; const now = new Date();
  for (let i = 0; i < 400; i++) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    if (!isScheduled(h, d)) continue;
    if (h.history[dstr(d)]) streak++;
    else { if (i === 0) continue; break; } // permite que hoy aún no esté marcado
  }
  return streak;
}

function habitEl(h) {
  const li = document.createElement('li');
  li.className = 'habit';
  const todayDone = !!h.history[todayStr()];
  const prog = habitProgress(h, 7);
  const streak = habitStreak(h);
  const freq = h.days === 'daily' || !h.days ? 'Todos los días' : 'Días: ' + h.days.map(d => WD[d]).join(', ');

  // mini semana
  const now = new Date(); let week = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const on = h.history[dstr(d)]; const sc = isScheduled(h, d);
    week += `<div class="d ${on ? 'on' : ''} ${sc ? 'scheduled' : ''}"><div class="box"></div>${WD[d.getDay()][0]}</div>`;
  }

  li.innerHTML = `
    <div class="habit-top">
      <button class="habit-toggle ${todayDone ? 'done' : ''}" aria-label="Marcar hoy">
        <svg viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="habit-info">
        <div class="habit-name">${esc(h.title)}</div>
        <div class="habit-sub">
          ${h.area ? `<span><span class="swatch" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${areaColor(h.area)}"></span> ${esc(h.area)}</span>` : ''}
          <span>${freq}</span>
          <span class="streak">🔥 ${streak} día${streak === 1 ? '' : 's'}</span>
        </div>
      </div>
      <button class="habit-del" aria-label="Eliminar"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    </div>
    <div class="habit-bar"><i style="width:${prog.pct}%"></i></div>
    <div class="muted small" style="margin-top:6px">Esta semana: ${prog.done}/${prog.sched} (${prog.pct}%)</div>
    <div class="habit-week">${week}</div>`;

  $('.habit-toggle', li).onclick = () => {
    const k = todayStr();
    if (h.history[k]) delete h.history[k]; else h.history[k] = true;
    save(); renderHabitos();
  };
  $('.habit-del', li).onclick = () => { if (confirm('¿Eliminar este hábito?')) { state.habits = state.habits.filter(x => x.id !== h.id); save(); renderHabitos(); } };
  return li;
}

function openHabitModal() {
  const areas = state.settings.areas.map(a => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('');
  modal('Nuevo hábito', `
    <label>Nombre</label>
    <input id="h-title" type="text" placeholder="Ej. Leer 20 min, Ejercicio, Orar" />
    <label>Área</label>
    <select id="h-area">${areas}</select>
    <label>Frecuencia</label>
    <div class="weekday-picker" id="h-days">
      ${WD.map((w, i) => `<button type="button" data-d="${i}" class="on">${w[0]}</button>`).join('')}
    </div>
    <p class="muted small" style="margin-top:6px">Toca los días en que aplica. Todos seleccionados = diario.</p>
    <div class="modal-actions"><button class="btn-primary" id="h-save">Crear hábito</button></div>`);
  $$('#h-days button').forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('#h-save').onclick = () => {
    const title = $('#h-title').value.trim();
    if (!title) { toast('Escribe un nombre'); return; }
    const days = $$('#h-days button.on').map(b => +b.dataset.d);
    state.habits.push({ id: uid(), title, area: $('#h-area').value, color: areaColor($('#h-area').value), days: days.length === 7 ? 'daily' : days, history: {}, createdAt: todayStr() });
    save(); renderHabitos(); closeModal();
  };
}

/* =====================================================================
   VISTA: ESTADÍSTICAS
   ===================================================================== */
function inRange(dateStr, days) {
  const diff = (parseD(todayStr()) - parseD(dateStr)) / 86400000;
  return diff >= 0 && diff < days;
}
function renderStats() {
  const done = state.tasks.filter(x => x.done && x.completedAt && inRange(x.completedAt, statRange));
  const scoped = state.tasks.filter(x => inRange(x.date, statRange) || (x.completedAt && inRange(x.completedAt, statRange)));
  const rate = scoped.length ? Math.round((scoped.filter(x => x.done).length / scoped.length) * 100) : 0;

  // por área
  const byArea = {};
  done.forEach(x => { const a = x.area || 'Sin área'; byArea[a] = (byArea[a] || 0) + 1; });
  const focusArea = Object.entries(byArea).sort((a, b) => b[1] - a[1])[0];

  // mejor racha de hábitos
  const bestStreak = state.habits.reduce((m, h) => Math.max(m, habitStreak(h)), 0);

  $('#s-done').textContent = done.length;
  $('#s-rate').textContent = rate + '%';
  $('#s-streak').textContent = bestStreak;
  $('#s-focus').textContent = focusArea ? focusArea[0] : '—';

  drawAreaChart(byArea);
  drawDailyChart();
  drawImportanceChart(done);
}

function chartTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return { grid: dark ? '#2c2e4a' : '#e6e7f0', text: dark ? '#9a9cbb' : '#6b6d85' };
}
function destroy(k) { if (charts[k]) { charts[k].destroy(); delete charts[k]; } }

function drawAreaChart(byArea) {
  destroy('areas');
  const labels = Object.keys(byArea);
  const data = Object.values(byArea);
  const colors = labels.map(l => areaColorHex(l));
  const th = chartTheme();
  if (!labels.length) { return emptyChart('chart-areas'); }
  charts.areas = new Chart($('#chart-areas'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: th.grid }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: { legend: { position: 'right', labels: { color: th.text, font: { family: 'Inter' }, boxWidth: 12, padding: 10 } } } }
  });
}
function drawDailyChart() {
  destroy('daily');
  const labels = [], data = [];
  for (let i = statRange - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    labels.push(statRange <= 7 ? WD[d.getDay()] : `${d.getDate()}/${d.getMonth() + 1}`);
    data.push(state.tasks.filter(x => x.done && x.completedAt === dstr(d)).length);
  }
  const th = chartTheme();
  charts.daily = new Chart($('#chart-daily'), {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: '#4f46e5', borderRadius: 6, maxBarThickness: 26 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { color: th.text, font: { family: 'Inter' }, maxRotation: 0, autoSkip: true } },
                y: { beginAtZero: true, grid: { color: th.grid }, ticks: { color: th.text, precision: 0 } } } }
  });
}
function drawImportanceChart(done) {
  destroy('imp');
  const c = { alta: 0, media: 0, baja: 0 };
  done.forEach(x => c[x.importance] = (c[x.importance] || 0) + 1);
  const th = chartTheme();
  if (!done.length) return emptyChart('chart-importance');
  charts.imp = new Chart($('#chart-importance'), {
    type: 'doughnut',
    data: { labels: ['Alta', 'Media', 'Baja'], datasets: [{ data: [c.alta, c.media, c.baja], backgroundColor: ['#e11d48', '#f59e0b', '#10b981'], borderWidth: 2, borderColor: th.grid }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position: 'bottom', labels: { color: th.text, font: { family: 'Inter' }, boxWidth: 12, padding: 12 } } } }
  });
}
function emptyChart(id) {
  const cv = $('#' + id), ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = chartTheme().text; ctx.font = '14px Inter'; ctx.textAlign = 'center';
  ctx.fillText('Sin datos en este periodo', cv.width / 2, cv.height / 2);
}
function areaColorHex(name) {
  const a = state.settings.areas.find(x => x.name === name);
  return a ? a.color : '#9a9cbb';
}

/* =====================================================================
   VISTA: AJUSTES
   ===================================================================== */
function renderAjustes() {
  // notificaciones
  $('#notif-toggle').setAttribute('aria-checked', state.settings.notifications ? 'true' : 'false');
  // horas de recordatorio (varias)
  const rt = $('#reminder-times'); rt.innerHTML = '';
  (state.settings.reminderTimes || []).slice().sort().forEach((t, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="rt-time">🔔 ${t}</span><button aria-label="Quitar">✕</button>`;
    $('button', li).onclick = () => {
      state.settings.reminderTimes = state.settings.reminderTimes.filter(x => x !== t);
      save(); renderAjustes();
    };
    rt.appendChild(li);
  });
  // áreas
  const ul = $('#area-editor'); ul.innerHTML = '';
  state.settings.areas.forEach((a, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="swatch" style="background:${a.color}"></span><span class="name">${esc(a.name)}</span><button aria-label="Quitar">✕</button>`;
    $('button', li).onclick = () => { state.settings.areas.splice(i, 1); save(); renderAjustes(); renderAll(); };
    ul.appendChild(li);
  });
  // cuenta
  const signed = !!(window._user);
  $('#signout-btn').hidden = !signed;
  $('#sync-status-detail').textContent = signed
    ? `Sesión: ${window._user.email}. Tus datos se sincronizan en la nube.`
    : (hasFirebase() ? 'Modo local. Entra con Google para sincronizar entre dispositivos.'
                     : 'Modo local. Configura Firebase en config.js para activar la sincronización.');
}

/* =====================================================================
   RECORDATORIOS / NOTIFICACIONES
   ===================================================================== */
async function enableNotifications() {
  if (!('Notification' in window)) { toast('Este navegador no soporta notificaciones'); return false; }
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Permiso de notificaciones denegado'); return false; }
  return true;
}
function pendingToday() {
  const t = todayStr();
  return state.tasks.filter(x => x.date === t && !x.done).length;
}
async function notify(title, body) {
  if (Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'miagenda' });
    else new Notification(title, { body, icon: 'icons/icon-192.png' });
  } catch (e) { try { new Notification(title, { body }); } catch (_) {} }
}
function scheduleReminderCheck() {
  clearInterval(window._remInt);
  window._remInt = setInterval(reminderTick, 60000);
  reminderTick();
}
function firedToday() {
  // { date: 'YYYY-MM-DD', times: ['09:00', ...] } — horas ya avisadas hoy
  try {
    const raw = JSON.parse(localStorage.getItem('miagenda_fired') || '{}');
    if (raw.date === todayStr() && Array.isArray(raw.times)) return raw;
  } catch (e) {}
  return { date: todayStr(), times: [] };
}
function reminderTick() {
  if (!state.settings.notifications || Notification.permission !== 'granted') return;
  const times = state.settings.reminderTimes || [];
  if (!times.length) return;
  const now = new Date();
  const hhmm = pad(now.getHours()) + ':' + pad(now.getMinutes());
  const fired = firedToday();
  // disparar cada hora de la lista que ya llegó y no se haya avisado hoy
  const due = times.filter(t => hhmm >= t && !fired.times.includes(t));
  if (!due.length) return;
  // marcar como avisadas aunque no haya pendientes, para no repetir el mismo minuto
  due.forEach(t => fired.times.push(t));
  localStorage.setItem('miagenda_fired', JSON.stringify(fired));
  const p = pendingToday();
  if (p > 0) notify('Tareas pendientes', `Tienes ${p} tarea${p === 1 ? '' : 's'} sin completar hoy.`);
}

/* =====================================================================
   EXPORTAR / IMPORTAR
   ===================================================================== */
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mi-agenda-${todayStr()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  toast('Datos exportados');
}
function importData(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const p = JSON.parse(r.result);
      if (!p.tasks && !p.habits) throw new Error('Formato no válido');
      state.tasks = p.tasks || []; state.habits = p.habits || [];
      if (p.settings) state.settings = Object.assign(state.settings, p.settings);
      save(); applyTheme(); renderAll();
      toast('Datos importados ✓');
    } catch (e) { toast('Archivo inválido'); }
  };
  r.readAsText(file);
}

/* =====================================================================
   SINCRONIZACIÓN FIREBASE (import dinámico)
   ===================================================================== */
let fb = { app: null, auth: null, db: null, doc: null, onSnap: null, ready: false };
function hasFirebase() { return !!(CFG.firebase && CFG.firebase.apiKey); }

async function initFirebase() {
  if (!hasFirebase()) return;
  try {
    const V = '10.12.2';
    const [{ initializeApp }, auth, fs] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
    ]);
    fb.app = initializeApp(CFG.firebase);
    fb.auth = auth.getAuth(fb.app);
    fb.db = fs.getFirestore(fb.app);
    fb._auth = auth; fb._fs = fs;
    fb.ready = true;

    auth.onAuthStateChanged(fb.auth, async u => {
      window._user = u || null;
      updateAuthUI();
      if (u) {
        setSync('syncing');
        fb.doc = fs.doc(fb.db, 'usuarios', u.uid);
        // escuchar cambios remotos
        if (fb.onSnap) fb.onSnap();
        fb.onSnap = fs.onSnapshot(fb.doc, snap => {
          if (!snap.exists()) { cloudWrite(); return; }
          const remote = snap.data();
          if (remote.updatedAt && remote.updatedAt > (state.updatedAt || 0)) {
            _skipCloud = true;
            state.tasks = remote.tasks || [];
            state.habits = remote.habits || [];
            if (remote.settings) state.settings = Object.assign(state.settings, remote.settings);
            state.updatedAt = remote.updatedAt;
            localStorage.setItem(LS_KEY, JSON.stringify(state));
            _skipCloud = false;
            applyTheme(); renderAll();
          }
          setSync('synced');
        }, err => { console.warn('snapshot', err); setSync('local'); });
        cloudWrite();
      } else {
        if (fb.onSnap) { fb.onSnap(); fb.onSnap = null; }
        setSync('local');
      }
    });
  } catch (e) {
    console.warn('Firebase no inició:', e);
    toast('No se pudo conectar a la nube (revisa config.js)');
  }
}
async function cloudWrite() {
  if (!fb.ready || !window._user || !fb.doc) return;
  try {
    setSync('syncing');
    await fb._fs.setDoc(fb.doc, {
      tasks: state.tasks, habits: state.habits, settings: state.settings, updatedAt: state.updatedAt || Date.now()
    }, { merge: true });
    setSync('synced');
  } catch (e) { console.warn('cloudWrite', e); setSync('local'); }
}
async function signInGoogle() {
  if (!fb.ready) { toast('Configura Firebase en config.js primero'); return; }
  try {
    const p = new fb._auth.GoogleAuthProvider();
    await fb._auth.signInWithPopup(fb.auth, p);
    toast('Sesión iniciada ✓');
  } catch (e) { console.warn(e); toast('No se pudo iniciar sesión'); }
}
async function signOutGoogle() {
  if (fb.ready && fb.auth) await fb._auth.signOut(fb.auth);
  window._user = null; updateAuthUI(); setSync('local'); toast('Sesión cerrada');
}
function setSync(mode) {
  const pill = $('#sync-pill'), txt = $('#sync-text');
  pill.className = 'sync-pill ' + (mode === 'local' ? '' : mode);
  txt.textContent = mode === 'synced' ? 'Sincronizado' : mode === 'syncing' ? 'Sincronizando…' : 'Local';
}
function updateAuthUI() {
  const u = window._user;
  const btn = $('#auth-btn'), av = $('#user-avatar');
  if (u) {
    btn.hidden = true; av.hidden = false;
    av.src = u.photoURL || 'icons/icon-192.png'; av.title = u.displayName || u.email;
  } else { btn.hidden = false; av.hidden = true; }
  renderAjustes();
}

/* =====================================================================
   GOOGLE CALENDAR (Google Identity Services + REST)
   ===================================================================== */
let gcal = { token: null, tokenClient: null, loaded: false };
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
function hasGoogle() { return !!CFG.googleClientId; }

function loadGis() {
  return new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) return res();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
async function connectCalendar() {
  if (!hasGoogle()) { toast('Configura googleClientId en config.js'); return; }
  try {
    await loadGis();
    gcal.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CFG.googleClientId, scope: GCAL_SCOPE,
      callback: resp => {
        if (resp.error) { toast('No se autorizó Calendar'); return; }
        gcal.token = resp.access_token;
        sessionStorage.setItem('gcal_token', resp.access_token);
        $('#cal-disconnected').hidden = true; $('#cal-connected').hidden = false;
        loadEvents(); toast('Google Calendar conectado ✓');
      }
    });
    gcal.tokenClient.requestAccessToken({ prompt: gcal.token ? '' : 'consent' });
  } catch (e) { console.warn(e); toast('No se pudo cargar Google'); }
}
async function gcalFetch(url, opts = {}) {
  opts.headers = Object.assign({ Authorization: 'Bearer ' + gcal.token, 'Content-Type': 'application/json' }, opts.headers);
  const r = await fetch(url, opts);
  if (r.status === 401) { gcal.token = null; sessionStorage.removeItem('gcal_token'); throw new Error('token'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) ? data.error.message : ('HTTP ' + r.status);
    throw new Error(msg);
  }
  return data;
}
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Tegucigalpa';
// Opciones del menú de recordatorios (minutos antes del evento)
const REMINDER_OPTS = [
  [0, 'A la hora del evento'], [5, '5 minutos antes'], [10, '10 minutos antes'],
  [15, '15 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes'],
  [120, '2 horas antes'], [1440, '1 día antes'], [2880, '2 días antes'], [10080, '1 semana antes']
];
async function loadEvents() {
  if (!gcal.token) return;
  try {
    // Desde el inicio de hoy (para no ocultar eventos de hoy más temprano)
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const timeMin = start.toISOString();
    const max = new Date(Date.now() + 60 * 86400000).toISOString();
    const data = await gcalFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(max)}&singleEvents=true&orderBy=startTime&maxResults=50`);
    const ul = $('#event-list'); ul.innerHTML = '';
    const items = data.items || [];
    items.forEach(ev => {
      const s = ev.start.dateTime || ev.start.date;
      const d = new Date(s);
      const timeStr = ev.start.dateTime ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : 'Todo el día';
      // resumen de recordatorios
      let rem = '';
      if (ev.reminders) {
        if (ev.reminders.useDefault) rem = '🔔 predeterminado';
        else if (ev.reminders.overrides && ev.reminders.overrides.length) {
          const o = ev.reminders.overrides[0];
          const lbl = (REMINDER_OPTS.find(x => x[0] === o.minutes) || [0, o.minutes + ' min'])[1];
          rem = '🔔 ' + lbl + (ev.reminders.overrides.length > 1 ? ' +' + (ev.reminders.overrides.length - 1) : '');
        }
      }
      const li = document.createElement('li');
      li.className = 'event';
      li.innerHTML = `<div class="event-date"><div class="day">${d.getDate()}</div><div class="mon">${MES[d.getMonth()]}</div></div>
        <div class="event-main"><div class="event-title">${esc(ev.summary || '(sin título)')}</div>
        <div class="event-time">${WD[d.getDay()]} · ${timeStr}${rem ? ' · ' + rem : ''}</div></div>
        ${ev.htmlLink ? `<a class="event-open" href="${ev.htmlLink}" target="_blank" rel="noopener" title="Abrir en Google Calendar"><svg viewBox="0 0 24 24" fill="none"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a>` : ''}`;
      ul.appendChild(li);
    });
    $('#event-empty').hidden = items.length > 0;
  } catch (e) {
    if (e.message === 'token') { $('#cal-connected').hidden = true; $('#cal-disconnected').hidden = false; toast('Vuelve a conectar Google Calendar'); }
    else toast('No se pudieron cargar los eventos: ' + e.message);
    console.warn(e);
  }
}
function reminderRowHtml(sel = 10, method = 'popup') {
  const opts = REMINDER_OPTS.map(o => `<option value="${o[0]}" ${o[0] === sel ? 'selected' : ''}>${o[1]}</option>`).join('');
  return `<div class="rem-row">
    <select class="rem-method">
      <option value="popup" ${method === 'popup' ? 'selected' : ''}>Notificación</option>
      <option value="email" ${method === 'email' ? 'selected' : ''}>Correo</option>
    </select>
    <select class="rem-min">${opts}</select>
    <button type="button" class="rem-del" aria-label="Quitar">✕</button>
  </div>`;
}
function openEventModal() {
  const now = new Date(); now.setMinutes(0, 0, 0);
  const start = new Date(now.getTime() + 3600000);
  const end = new Date(start.getTime() + 3600000);
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  modal('Nueva cita', `
    <label>Título</label>
    <input id="e-title" type="text" placeholder="Reunión, cita, audiencia..." />
    <label>Inicio</label>
    <input id="e-start" type="datetime-local" value="${fmt(start)}" />
    <label>Fin</label>
    <input id="e-end" type="datetime-local" value="${fmt(end)}" />
    <label>Recordatorios</label>
    <div id="rem-list">${reminderRowHtml(10, 'popup')}</div>
    <button type="button" id="rem-add" class="btn-ghost" style="margin-top:8px">+ Agregar recordatorio</button>
    <label style="margin-top:14px">Descripción (opcional)</label>
    <textarea id="e-desc"></textarea>
    <div class="modal-actions"><button class="btn-primary" id="e-save">Crear en Google Calendar</button></div>`);

  const wireRows = () => $$('#rem-list .rem-del').forEach(b => b.onclick = () => {
    if ($$('#rem-list .rem-row').length > 1) b.closest('.rem-row').remove();
    else b.closest('.rem-row').remove(); // permitir quedar sin recordatorios
  });
  wireRows();
  $('#rem-add').onclick = () => {
    if ($$('#rem-list .rem-row').length >= 5) { toast('Máximo 5 recordatorios'); return; }
    $('#rem-list').insertAdjacentHTML('beforeend', reminderRowHtml(30, 'popup'));
    wireRows();
  };

  $('#e-save').onclick = async () => {
    const title = $('#e-title').value.trim();
    if (!title) { toast('Escribe un título'); return; }
    const sVal = $('#e-start').value, eVal = $('#e-end').value;
    if (!sVal || !eVal) { toast('Define inicio y fin'); return; }
    if (new Date(eVal) <= new Date(sVal)) { toast('El fin debe ser después del inicio'); return; }
    // construir recordatorios
    const overrides = $$('#rem-list .rem-row').map(row => ({
      method: $('.rem-method', row).value,
      minutes: parseInt($('.rem-min', row).value, 10)
    }));
    const reminders = overrides.length ? { useDefault: false, overrides } : { useDefault: false, overrides: [] };
    const btn = $('#e-save'); btn.disabled = true; btn.textContent = 'Creando…';
    try {
      await gcalFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        body: JSON.stringify({
          summary: title, description: $('#e-desc').value,
          start: { dateTime: new Date(sVal).toISOString(), timeZone: TZ },
          end: { dateTime: new Date(eVal).toISOString(), timeZone: TZ },
          reminders
        })
      });
      toast('Cita creada ✓'); closeModal();
      // Google tarda un instante en indexar el evento nuevo: refrescar con margen
      loadEvents();
      setTimeout(loadEvents, 1200);
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Crear en Google Calendar';
      toast('No se pudo crear: ' + e.message);
      console.warn(e);
    }
  };
}
function initCalendarView() {
  const savedTok = sessionStorage.getItem('gcal_token');
  $('#cal-config-note').hidden = hasGoogle();
  if (savedTok) { gcal.token = savedTok; $('#cal-disconnected').hidden = true; $('#cal-connected').hidden = false; loadEvents(); }
}

/* =====================================================================
   NAVEGACIÓN / TEMA / MODAL
   ===================================================================== */
function showView(v) {
  currentView = v;
  ['hoy', 'habitos', 'stats', 'agenda', 'ajustes'].forEach(name => {
    $('#view-' + name).hidden = name !== v;
  });
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'hoy') renderHoy();
  if (v === 'habitos') renderHabitos();
  if (v === 'stats') renderStats();
  if (v === 'ajustes') renderAjustes();
  if (v === 'agenda') initCalendarView();
  window.scrollTo(0, 0);
}
function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  $('#theme-toggle').setAttribute('aria-pressed', state.settings.theme === 'dark');
}
function modal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }
function esc(s) { return String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

function renderAll() {
  $('#today-label').textContent = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
  // selector de área en quick add
  const sel = $('#qa-area');
  sel.innerHTML = state.settings.areas.map(a => `<option value="${esc(a.name)}">${esc(a.name)}</option>`).join('');
  if (currentView === 'hoy') renderHoy();
  if (currentView === 'habitos') renderHabitos();
  if (currentView === 'stats') renderStats();
  if (currentView === 'ajustes') renderAjustes();
}

/* =====================================================================
   WIRING / EVENTOS
   ===================================================================== */
function wire() {
  // navegación
  $$('.nav-btn').forEach(b => b.onclick = () => showView(b.dataset.view));

  // tema
  $('#theme-toggle').onclick = () => { state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark'; applyTheme(); save(); if (currentView === 'stats') renderStats(); };

  // quick add
  $('#quick-add').onsubmit = e => {
    e.preventDefault();
    const title = $('#qa-title').value.trim(); if (!title) return;
    addTask({ title, area: $('#qa-area').value, importance: qaImportance, time: $('#qa-time').value });
    $('#qa-title').value = ''; $('#qa-time').value = '';
    toast('Tarea agregada');
  };
  $$('#qa-importance .imp').forEach(b => b.onclick = () => { qaImportance = b.dataset.imp; $$('#qa-importance .imp').forEach(x => x.classList.remove('active')); b.classList.add('active'); });

  // filtros
  $$('#filter-chips .chip').forEach(b => b.onclick = () => { filter = b.dataset.filter; $$('#filter-chips .chip').forEach(x => x.classList.remove('active')); b.classList.add('active'); renderHoy(); });

  // rango de estadísticas
  $$('.stat-range .chip').forEach(b => b.onclick = () => { statRange = +b.dataset.range; $$('.stat-range .chip').forEach(x => x.classList.remove('active')); b.classList.add('active'); renderStats(); });

  // hábitos
  $('#add-habit-btn').onclick = openHabitModal;

  // agenda
  $('#cal-connect').onclick = connectCalendar;
  $('#add-event-btn').onclick = openEventModal;

  // auth
  $('#auth-btn').onclick = signInGoogle;
  $('#signout-btn').onclick = signOutGoogle;

  // ajustes: notificaciones
  $('#notif-toggle').onclick = async () => {
    if (!state.settings.notifications) {
      const ok = await enableNotifications();
      if (!ok) return;
      state.settings.notifications = true; toast('Recordatorios activados');
    } else { state.settings.notifications = false; toast('Recordatorios desactivados'); }
    save(); renderAjustes(); scheduleReminderCheck();
  };
  // ajustes: agregar hora de recordatorio
  $('#add-rtime').onsubmit = e => {
    e.preventDefault();
    const t = $('#new-rtime').value;
    if (!t) return;
    state.settings.reminderTimes = state.settings.reminderTimes || [];
    if (state.settings.reminderTimes.includes(t)) { toast('Esa hora ya está en la lista'); return; }
    state.settings.reminderTimes.push(t);
    state.settings.reminderTimes.sort();
    save(); renderAjustes();
    if (state.settings.notifications) scheduleReminderCheck();
    toast('Hora agregada');
  };

  // áreas
  $('#add-area').onsubmit = e => {
    e.preventDefault();
    const n = $('#new-area').value.trim(); if (!n) return;
    state.settings.areas.push({ name: n, color: $('#new-area-color').value });
    $('#new-area').value = '';
    save(); renderAjustes(); renderAll();
  };

  // respaldo
  $('#export-btn').onclick = exportData;
  $('#import-btn').onclick = () => $('#import-file').click();
  $('#import-file').onchange = e => { if (e.target.files[0]) importData(e.target.files[0]); };

  // modal cerrar
  $$('[data-close]').forEach(el => el.onclick = closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // detectar cambio de día (app abierta a medianoche)
  setInterval(() => { if (todayStr() !== window._curDay) { window._curDay = todayStr(); rolloverTasks(); renderAll(); } }, 60000);
}

/* =====================================================================
   INICIO
   ===================================================================== */
function init() {
  loadLocal();
  window._curDay = todayStr();
  applyTheme();
  rolloverTasks();
  wire();
  renderAll();
  showView('hoy');
  if (CFG.appName) { $('.brand-text strong').textContent = CFG.appName; document.title = CFG.appName; }

  // service worker
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  // nube
  if (hasFirebase()) initFirebase(); else setSync('local');

  // recordatorios
  if (state.settings.notifications) scheduleReminderCheck();

  // aviso de bienvenida si hay pendientes arrastradas
  const carried = state.tasks.filter(x => x.date === todayStr() && x.rolledOver > 0).length;
  if (carried) setTimeout(() => toast(`${carried} tarea${carried === 1 ? '' : 's'} pasaron de días anteriores`), 800);
}

document.addEventListener('DOMContentLoaded', init);
