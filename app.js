const STORAGE_KEY = "wus_alarms_v1";
const $ = (id) => document.getElementById(id);
const DAY_NAMES = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const state = {
  alarms: [],
  editingId: null,
  editDays: new Set(),
  editTaskType: "reps",
  ringingAlarm: null,
  repsCount: 0,
  mathSolved: 0,
  mathAnswer: 0,
  wakeLock: null,
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.alarms = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.alarms = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.alarms));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/* ---------- clock ---------- */
function tickClock() {
  const now = new Date();
  $("clockTime").textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  $("clockDate").textContent = now.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
  checkAlarms(now);
}

const firedThisMinute = new Set();
function checkAlarms(now) {
  if (state.ringingAlarm) return;
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const cur = `${hh}:${mm}`;
  const dow = now.getDay();

  for (const alarm of state.alarms) {
    if (!alarm.enabled) continue;
    if (alarm.time !== cur) continue;

    const key = alarm.id + "_" + cur + "_" + now.toDateString();
    if (firedThisMinute.has(key)) continue;

    const repeats = Array.isArray(alarm.days) && alarm.days.length > 0;
    if (repeats) {
      if (!alarm.days.includes(dow)) continue;
    } else {
      // one-time alarm: fire once, then disable it
      if (alarm.firedOnce) continue;
    }

    firedThisMinute.add(key);
    if (!repeats) {
      alarm.firedOnce = true;
      alarm.enabled = false;
      save();
      renderAlarms();
    }
    ringAlarm(alarm);
  }
}

/* ---------- rendering the alarm list ---------- */
function describeAlarm(alarm) {
  const repeats = Array.isArray(alarm.days) && alarm.days.length > 0;
  const daysText = repeats
    ? alarm.days.slice().sort().map((d) => DAY_NAMES[d]).join(" ")
    : "Один раз";
  const taskText =
    alarm.taskType === "reps"
      ? `${alarm.reps.count} × ${alarm.reps.exercise}`
      : `${alarm.math.count} приклад(ів), ${{ easy: "легко", medium: "середньо", hard: "важко" }[alarm.math.difficulty]}`;
  return { daysText, taskText };
}

function renderAlarms() {
  const list = $("alarmsList");
  list.innerHTML = "";

  if (state.alarms.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `<b>Будильників поки нема ⏰</b>Додай перший — і хай ранок буде чесним.`;
    list.appendChild(empty);
    updateWakeLockNeed();
    return;
  }

  const sorted = [...state.alarms].sort((a, b) => a.time.localeCompare(b.time));
  for (const alarm of sorted) {
    const { daysText, taskText } = describeAlarm(alarm);
    const row = document.createElement("div");
    row.className = "alarmRow" + (alarm.enabled ? "" : " disabled");
    row.innerHTML = `
      <div class="alarmTime">${alarm.time}</div>
      <div class="alarmInfo">
        <div class="alarmLabel">${escapeHTML(alarm.label || "Будильник")}</div>
        <div class="alarmMeta">
          <span class="alarmTag ${alarm.taskType}">${alarm.taskType === "reps" ? "💪" : "🧮"} ${escapeHTML(taskText)}</span>
          <span>${escapeHTML(daysText)}</span>
        </div>
      </div>
      <div class="miniSwitch ${alarm.enabled ? "on" : ""}" data-toggle="${alarm.id}"><div class="knob"></div></div>
    `;
    row.querySelector(".alarmInfo").addEventListener("click", () => openEditor(alarm.id));
    row.querySelector(".alarmTime").addEventListener("click", () => openEditor(alarm.id));
    row.querySelector("[data-toggle]").addEventListener("click", (e) => {
      e.stopPropagation();
      alarm.enabled = !alarm.enabled;
      if (alarm.enabled && !Array.isArray(alarm.days)) alarm.days = [];
      if (alarm.enabled) alarm.firedOnce = false;
      save();
      renderAlarms();
    });
    list.appendChild(row);
  }
  updateWakeLockNeed();
}

function escapeHTML(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/* ---------- editor ---------- */
function openEditor(id) {
  state.editingId = id || null;
  const alarm = id ? state.alarms.find((a) => a.id === id) : null;

  $("editorTitle").textContent = alarm ? "Редагувати будильник" : "Новий будильник";
  $("fTime").value = alarm ? alarm.time : "07:30";
  $("fLabel").value = alarm ? alarm.label || "" : "";

  state.editDays = new Set(alarm && Array.isArray(alarm.days) ? alarm.days : []);
  document.querySelectorAll(".dayBtn").forEach((b) => b.classList.toggle("active", state.editDays.has(Number(b.dataset.day))));

  state.editTaskType = alarm ? alarm.taskType : "reps";
  setEditTaskType(state.editTaskType);

  $("fExercise").value = alarm ? alarm.reps.exercise : "Віджимання";
  $("fRepsCount").value = alarm ? alarm.reps.count : 15;
  $("fMathDifficulty").value = alarm ? alarm.math.difficulty : "medium";
  $("fMathCount").value = alarm ? alarm.math.count : 5;

  $("btnDeleteAlarm").style.display = alarm ? "block" : "none";
  $("editorOverlay").style.display = "flex";
}

function closeEditor() {
  $("editorOverlay").style.display = "none";
  state.editingId = null;
}

function setEditTaskType(type) {
  state.editTaskType = type;
  document.querySelectorAll(".typeBtn").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
  $("repsConfig").style.display = type === "reps" ? "block" : "none";
  $("mathConfig").style.display = type === "math" ? "block" : "none";
}

function saveAlarmFromEditor() {
  const time = $("fTime").value;
  if (!/^\d{2}:\d{2}$/.test(time)) return alert("Вибери час");

  const alarm = state.editingId
    ? state.alarms.find((a) => a.id === state.editingId)
    : { id: uid(), enabled: true, firedOnce: false };

  alarm.time = time;
  alarm.label = $("fLabel").value.trim();
  alarm.days = Array.from(state.editDays);
  alarm.taskType = state.editTaskType;
  alarm.reps = { exercise: $("fExercise").value.trim() || "Віджимання", count: Math.max(1, parseInt($("fRepsCount").value, 10) || 15) };
  alarm.math = { difficulty: $("fMathDifficulty").value, count: Math.max(1, parseInt($("fMathCount").value, 10) || 5) };
  if (typeof alarm.enabled !== "boolean") alarm.enabled = true;
  alarm.firedOnce = false;

  if (!state.editingId) state.alarms.push(alarm);
  save();
  renderAlarms();
  closeEditor();
}

function deleteAlarm() {
  if (!state.editingId) return;
  if (!confirm("Видалити цей будильник?")) return;
  state.alarms = state.alarms.filter((a) => a.id !== state.editingId);
  save();
  renderAlarms();
  closeEditor();
}

/* ---------- alarm sound (Web Audio, no external files) ---------- */
let audioCtx = null;
let beepTimer = null;

function startBeeping() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    return;
  }
  const beepOnce = () => {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.start(t);
    osc.stop(t + 0.4);
  };
  beepOnce();
  beepTimer = setInterval(beepOnce, 600);
}

function stopBeeping() {
  if (beepTimer) clearInterval(beepTimer);
  beepTimer = null;
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

/* ---------- ringing / task flow ---------- */
function ringAlarm(alarm) {
  state.ringingAlarm = alarm;
  $("ringLabel").textContent = "ПРОКИНЬСЯ!";
  $("ringTime").textContent = alarm.time;

  if (alarm.taskType === "reps") {
    state.repsCount = 0;
    $("ringTaskReps").style.display = "block";
    $("ringTaskMath").style.display = "none";
    $("repsExerciseLabel").textContent = alarm.reps.exercise;
    $("repsCounter").textContent = `0 / ${alarm.reps.count}`;
  } else {
    state.mathSolved = 0;
    $("ringTaskReps").style.display = "none";
    $("ringTaskMath").style.display = "block";
    $("mathProgress").textContent = `0/${alarm.math.count}`;
    nextMathProblem(alarm.math.difficulty);
  }

  $("ringOverlay").style.display = "flex";
  startBeeping();
  if (navigator.vibrate) {
    try { navigator.vibrate([400, 200, 400, 200, 400]); } catch {}
  }
}

function stopRinging() {
  stopBeeping();
  $("ringOverlay").style.display = "none";
  state.ringingAlarm = null;
}

function completeAlarm() {
  stopRinging();
}

function snoozeAlarm() {
  const alarm = state.ringingAlarm;
  if (!alarm) return;
  stopRinging();
  const [hh, mm] = alarm.time.split(":").map(Number);
  const t = new Date();
  t.setHours(hh, mm, 0, 0);
  t.setMinutes(t.getMinutes() + 5);
  const snoozeTime = `${pad(t.getHours())}:${pad(t.getMinutes())}`;

  const snoozeAlarmObj = {
    id: uid(),
    enabled: true,
    time: snoozeTime,
    label: (alarm.label || "Будильник") + " (відкладено)",
    days: [],
    firedOnce: false,
    taskType: alarm.taskType,
    reps: alarm.reps,
    math: alarm.math,
  };
  state.alarms.push(snoozeAlarmObj);
  save();
  renderAlarms();
}

function addRep() {
  const alarm = state.ringingAlarm;
  if (!alarm) return;
  state.repsCount++;
  $("repsCounter").textContent = `${state.repsCount} / ${alarm.reps.count}`;
  if (state.repsCount >= alarm.reps.count) completeAlarm();
}

/* ---------- math problems ---------- */
function nextMathProblem(difficulty) {
  let a, b, op, answer;
  if (difficulty === "easy") {
    op = Math.random() < 0.5 ? "+" : "-";
    a = Math.floor(Math.random() * 20) + 1;
    b = Math.floor(Math.random() * 20) + 1;
    if (op === "-" && b > a) [a, b] = [b, a];
    answer = op === "+" ? a + b : a - b;
  } else if (difficulty === "medium") {
    op = "×";
    a = Math.floor(Math.random() * 12) + 1;
    b = Math.floor(Math.random() * 12) + 1;
    answer = a * b;
  } else {
    op = "×";
    a = Math.floor(Math.random() * 89) + 11;
    b = Math.floor(Math.random() * 9) + 2;
    answer = a * b;
  }
  state.mathAnswer = answer;
  $("mathProblem").textContent = `${a} ${op} ${b}`;
  $("mathAnswer").value = "";
  $("mathError").style.display = "none";
}

function submitMathAnswer() {
  const alarm = state.ringingAlarm;
  if (!alarm) return;
  const val = parseInt($("mathAnswer").value, 10);
  if (val === state.mathAnswer) {
    state.mathSolved++;
    $("mathProgress").textContent = `${state.mathSolved}/${alarm.math.count}`;
    if (state.mathSolved >= alarm.math.count) {
      completeAlarm();
      return;
    }
    nextMathProblem(alarm.math.difficulty);
  } else {
    $("mathError").style.display = "block";
    $("mathAnswer").value = "";
    $("mathAnswer").focus();
  }
}

/* ---------- wake lock ---------- */
async function updateWakeLockNeed() {
  const anyEnabled = state.alarms.some((a) => a.enabled);
  const wantLock = $("wakeLockToggle").checked && anyEnabled;
  if (wantLock && !state.wakeLock) {
    await requestWakeLock();
  } else if (!wantLock && state.wakeLock) {
    releaseWakeLock();
  }
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    $("wakeLockNote").textContent = "Цей браузер не підтримує утримання екрана — залиш застосунок відкритим вручну.";
    return;
  }
  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    $("wakeLockNote").textContent = "Екран не засне, поки застосунок відкритий і є активний будильник.";
    state.wakeLock.addEventListener("release", () => {
      state.wakeLock = null;
    });
  } catch (e) {
    $("wakeLockNote").textContent = "Не вдалось утримати екран увімкненим. Тримай застосунок відкритим вручну.";
  }
}

function releaseWakeLock() {
  if (state.wakeLock) {
    state.wakeLock.release().catch(() => {});
    state.wakeLock = null;
  }
}

/* ---------- misc ---------- */
function hardRefresh() {
  try {
    if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
    if ("serviceWorker" in navigator) navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  } catch {}
  setTimeout(() => (location.href = location.pathname + "?v=" + Date.now()), 150);
}

async function registerSW() {
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); } catch {}
  }
}

/* ---------- wiring ---------- */
function wire() {
  $("btnNewAlarm").addEventListener("click", () => openEditor(null));
  $("btnCancelAlarm").addEventListener("click", closeEditor);
  $("btnSaveAlarm").addEventListener("click", saveAlarmFromEditor);
  $("btnDeleteAlarm").addEventListener("click", deleteAlarm);
  $("btnRefresh").addEventListener("click", hardRefresh);

  document.querySelectorAll(".dayBtn").forEach((b) => {
    b.addEventListener("click", () => {
      const d = Number(b.dataset.day);
      if (state.editDays.has(d)) state.editDays.delete(d);
      else state.editDays.add(d);
      b.classList.toggle("active");
    });
  });

  document.querySelectorAll(".typeBtn").forEach((b) => {
    b.addEventListener("click", () => setEditTaskType(b.dataset.type));
  });

  $("btnRepPlus").addEventListener("click", addRep);
  $("btnMathSubmit").addEventListener("click", submitMathAnswer);
  $("mathAnswer").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitMathAnswer();
  });
  $("btnSnooze").addEventListener("click", snoozeAlarm);

  $("wakeLockToggle").addEventListener("change", updateWakeLockNeed);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateWakeLockNeed();
  });
}

function init() {
  load();
  wire();
  registerSW();
  renderAlarms();
  tickClock();
  setInterval(tickClock, 1000);
}

init();
