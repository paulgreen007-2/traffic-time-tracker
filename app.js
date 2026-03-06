const STORAGE_KEY = "traffic_time_tracker_v1";

const COLORS = ["red", "amber", "green"];
const COLOR_LABEL = { red: "RED", amber: "AMBER", green: "GREEN" };
const COLOR_HEX = { red: "#ff4d4d", amber: "#ffcc00", green: "#25c16f" };

const el = (id) => document.getElementById(id);

const state = {
  sessions: [],
  selectedDayISO: null
};

const modal = {
  mode: "edit",
  sessionId: null
};

function pad(n) {
  return String(n).padStart(2, "0");
}

function uuid() {
  return (crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`);
}

function toLocalDayISO(d) {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}

function localDayStart(dayISO) {
  const [y, m, d] = dayISO.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function localDayEnd(dayISO) {
  const [y, m, d] = dayISO.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function formatHMS(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${pad(h)}:${pad(m)}:${pad(r)}`;
}

function formatHM(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad(h)}:${pad(m)}`;
}

function toDateTimeLocalValue(date) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function parseDateTimeLocalValue(value) {
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function pct(part, total) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    sessions: state.sessions,
    selectedDayISO: state.selectedDayISO
  }));
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.sessions = [];
    state.selectedDayISO = toLocalDayISO(new Date());
    return;
  }

  try {
    const data = JSON.parse(raw);
    state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
    state.selectedDayISO = data.selectedDayISO || toLocalDayISO(new Date());
  } catch {
    state.sessions = [];
    state.selectedDayISO = toLocalDayISO(new Date());
  }
}

function getRunningSession() {
  return state.sessions.find(s => s.endISO == null) || null;
}

function stopAtMidnightIfNeeded() {
  const running = getRunningSession();
  if (!running) return;

  const start = new Date(running.startISO);
  const now = new Date();

  const startDay = toLocalDayISO(start);
  const nowDay = toLocalDayISO(now);

  if (startDay !== nowDay) {
    const endOfStartDay = localDayEnd(startDay);
    running.endISO = endOfStartDay.toISOString();
    save();
  }
}

function startOrSwitch(color) {
  stopAtMidnightIfNeeded();

  const running = getRunningSession();
  const nowISO = new Date().toISOString();

  if (running && running.color === color) {
    running.endISO = nowISO;
    save();
    render();
    return;
  }

  if (running && running.color !== color) {
    running.endISO = nowISO;
  }

  state.sessions.push({
    id: uuid(),
    color,
    startISO: nowISO,
    endISO: null
  });

  state.selectedDayISO = toLocalDayISO(new Date());
  save();
  render();
}

function stopRunning() {
  stopAtMidnightIfNeeded();
  const running = getRunningSession();
  if (!running) return;
  running.endISO = new Date().toISOString();
  save();
  render();
}

function sessionsForDay(dayISO) {
  const start = localDayStart(dayISO);
  const end = localDayEnd(dayISO);

  return state.sessions.filter(s => {
    const ss = new Date(s.startISO);
    const ee = new Date(s.endISO ?? new Date().toISOString());
    return ee >= start && ss <= end;
  });
}

function secondsOfSessionWithinDay(session, dayISO) {
  const dayStart = localDayStart(dayISO);
  const dayEnd = localDayEnd(dayISO);

  const s = new Date(session.startISO);
  const e = new Date(session.endISO ?? new Date().toISOString());

  const start = s < dayStart ? dayStart : s;
  const end = e > dayEnd ? dayEnd : e;

  return Math.max(0, (end - start) / 1000);
}

function totalsForDay(dayISO) {
  const daySessions = sessionsForDay(dayISO);
  const totals = { red: 0, amber: 0, green: 0 };

  for (const s of daySessions) {
    totals[s.color] += secondsOfSessionWithinDay(s, dayISO);
  }

  const total = totals.red + totals.amber + totals.green;
  return { totals, total };
}

function clampToDay(date, dayISO) {
  const start = localDayStart(dayISO);
  const end = localDayEnd(dayISO);
  if (date < start) return start;
  if (date > end) return end;
  return date;
}

function dayLabel(dayISO) {
  const d = localDayStart(dayISO);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function uniqueDaysFromSessions() {
  const set = new Set();
  const today = toLocalDayISO(new Date());
  set.add(today);

  for (const s of state.sessions) {
    set.add(toLocalDayISO(new Date(s.startISO)));
    if (s.endISO) set.add(toLocalDayISO(new Date(s.endISO)));
  }

  return Array.from(set).sort((a, b) => (a > b ? -1 : 1));
}

function drawPie(canvas, totals, total) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.33;

  if (total <= 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.fillStyle = "#bdbdbd";
    ctx.font = "28px -apple-system, system-ui, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.fillText("No time logged", cx, cy + 10);
    return;
  }

  let startAngle = -Math.PI / 2;
  for (const c of COLORS) {
    const v = totals[c];
    if (v <= 0) continue;
    const slice = (v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = COLOR_HEX[c];
    ctx.fill();
    startAngle += slice;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = "#141414";
  ctx.fill();

  ctx.fillStyle = "#f4f4f4";
  ctx.font = "24px -apple-system, system-ui, Segoe UI, Roboto, Arial";
  ctx.textAlign = "center";
  ctx.fillText(formatHM(total), cx, cy + 8);
}

function openModalForSession(sessionId) {
  const s = state.sessions.find(x => x.id === sessionId);
  if (!s) return;

  modal.mode = "edit";
  modal.sessionId = sessionId;

  el("modalTitle").textContent = "Edit entry";
  el("modalHint").textContent = "Change this entry clearly below.";
  el("modalDeleteBtn").classList.remove("hidden");

  el("modalColor").value = s.color;

  const dayISO = state.selectedDayISO;
  const startClamp = clampToDay(new Date(s.startISO), dayISO);
  const endClamp = clampToDay(new Date(s.endISO ?? new Date().toISOString()), dayISO);

  el("modalStart").value = toDateTimeLocalValue(startClamp);
  el("modalEnd").value = toDateTimeLocalValue(endClamp);

  el("modalBackdrop").classList.add("show");
}

function openModalAddEntry() {
  modal.mode = "add";
  modal.sessionId = null;

  el("modalTitle").textContent = "Add entry";
  el("modalHint").textContent = "Create a finished entry.";
  el("modalDeleteBtn").classList.add("hidden");

  const now = new Date();
  const start = new Date(now.getTime() - 15 * 60 * 1000);

  el("modalColor").value = "green";
  el("modalStart").value = toDateTimeLocalValue(start);
  el("modalEnd").value = toDateTimeLocalValue(now);

  el("modalBackdrop").classList.add("show");
}

function closeModal() {
  modal.mode = "edit";
  modal.sessionId = null;
  el("modalBackdrop").classList.remove("show");
}

function saveModal() {
  const color = el("modalColor").value;
  if (!COLORS.includes(color)) {
    alert("Invalid colour.");
    return;
  }

  const rawStart = parseDateTimeLocalValue(el("modalStart").value);
  const rawEnd = parseDateTimeLocalValue(el("modalEnd").value);

  if (modal.mode === "add") {
    const dayISO = toLocalDayISO(rawStart);
    const start = clampToDay(rawStart, dayISO);
    const end = clampToDay(rawEnd, dayISO);

    if (end <= start) {
      alert("End must be after start.");
      return;
    }

    state.sessions.push({
      id: uuid(),
      color,
      startISO: start.toISOString(),
      endISO: end.toISOString()
    });

    state.selectedDayISO = dayISO;
    save();
    closeModal();
    render();
    return;
  }

  const s = state.sessions.find(x => x.id === modal.sessionId);
  if (!s) return;

  const dayISO = state.selectedDayISO;
  const start = clampToDay(rawStart, dayISO);
  const end = clampToDay(rawEnd, dayISO);

  if (end <= start) {
    alert("End must be after start.");
    return;
  }

  s.color = color;
  s.startISO = start.toISOString();
  s.endISO = end.toISOString();

  save();
  closeModal();
  render();
}

function deleteModalSession() {
  if (modal.mode !== "edit") return;
  const id = modal.sessionId;
  if (!id) return;

  const s = state.sessions.find(x => x.id === id);
  if (!s) return;

  const startText = new Date(s.startISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endText = new Date(s.endISO ?? new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const ok = confirm(`Delete this ${s.color} entry from ${startText} to ${endText}?`);
  if (!ok) return;

  state.sessions = state.sessions.filter(x => x.id !== id);
  save();
  closeModal();
  render();
}

function deleteEntryById(sessionId) {
  const s = state.sessions.find(x => x.id === sessionId);
  if (!s) return;

  const startText = new Date(s.startISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endText = new Date(s.endISO ?? new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const ok = confirm(`Delete this ${s.color} entry from ${startText} to ${endText}?`);
  if (!ok) return;

  state.sessions = state.sessions.filter(x => x.id !== sessionId);
  save();
  render();
}

function exportCSV() {
  stopAtMidnightIfNeeded();

  const days = uniqueDaysFromSessions().slice().sort();
  const rows = [];
  rows.push(["day","red_seconds","amber_seconds","green_seconds","total_seconds","red_pct","amber_pct","green_pct"].join(","));

  for (const dayISO of days) {
    const { totals, total } = totalsForDay(dayISO);
    rows.push([
      dayISO,
      Math.round(totals.red),
      Math.round(totals.amber),
      Math.round(totals.green),
      Math.round(total),
      pct(totals.red, total),
      pct(totals.amber, total),
      pct(totals.green, total)
    ].join(","));
  }

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "traffic-time-tracker.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderSelectedDayEntries(dayISO) {
  const container = el("selectedDayEntries");
  container.innerHTML = "";

  const daySessions = sessionsForDay(dayISO)
    .map(s => ({ ...s, secs: secondsOfSessionWithinDay(s, dayISO) }))
    .filter(s => s.secs > 0)
    .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

  if (daySessions.length === 0) {
    container.innerHTML = `<div class="emptyState">No entries for this day yet.</div>`;
    return;
  }

  for (const s of daySessions) {
    const start = new Date(s.startISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const end = new Date(s.endISO ?? new Date().toISOString()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const card = document.createElement("div");
    card.className = "entryCard";
    card.innerHTML = `
      <div class="entryTop">
        <div class="entryColor">
          <span class="dot" style="background:${COLOR_HEX[s.color]}"></span>
          <span>${COLOR_LABEL[s.color]}</span>
        </div>
        <div class="entryDuration">${formatHMS(s.secs)}</div>
      </div>
      <div class="entryTimes">${start} → ${end}</div>
      <div class="entryActions">
        <button class="secondary" data-edit-entry="${s.id}">Edit</button>
        <button class="danger" data-delete-entry="${s.id}">Delete</button>
      </div>
    `;
    container.appendChild(card);
  }
}

function renderLiveArea() {
  const running = getRunningSession();

  el("redBtn").classList.remove("running");
  el("amberBtn").classList.remove("running");
  el("greenBtn").classList.remove("running");

  if (running) {
    const elapsed = (Date.now() - new Date(running.startISO).getTime()) / 1000;
    const label = COLOR_LABEL[running.color];

    el("runningPill").classList.remove("hidden");
    el("currentStatus").textContent = label;
    el("currentElapsed").textContent = `Elapsed: ${formatHMS(elapsed)}`;

    el("liveLabel").textContent = label;
    el("liveLabel").style.color = COLOR_HEX[running.color];
    el("liveTimer").textContent = formatHMS(elapsed);
    el("liveSub").textContent = "Timer is running right now";

    el(running.color + "Btn").classList.add("running");
  } else {
    el("runningPill").classList.add("hidden");
    el("currentStatus").textContent = "Stopped";
    el("currentElapsed").textContent = "";

    el("liveLabel").textContent = "STOPPED";
    el("liveLabel").style.color = "#f4f4f4";
    el("liveTimer").textContent = "00:00:00";
    el("liveSub").textContent = "No timer running";
  }
}

function renderHistoryDays() {
  const days = uniqueDaysFromSessions();
  const ul = el("historyList");
  ul.innerHTML = "";

  for (const dayISO of days) {
    const dlabel = dayLabel(dayISO);
    const { totals: t, total: tt } = totalsForDay(dayISO);

    const li = document.createElement("li");
    li.className = "dayItem";

    li.innerHTML = `
      <div class="dayTitle">
        <span class="link" data-day="${dayISO}">${dlabel}</span>
      </div>
      <div class="dayMeta">
        Total ${formatHMS(tt)} ·
        R ${pct(t.red, tt)}% ·
        A ${pct(t.amber, tt)}% ·
        G ${pct(t.green, tt)}%
      </div>
    `;

    ul.appendChild(li);
  }
}

function render() {
  stopAtMidnightIfNeeded();

  const selected = state.selectedDayISO;
  el("selectedDateLabel").textContent = dayLabel(selected);

  const { totals, total } = totalsForDay(selected);
  el("redTime").textContent = formatHMS(totals.red);
  el("amberTime").textContent = formatHMS(totals.amber);
  el("greenTime").textContent = formatHMS(totals.green);
  el("dayTotal").textContent = formatHMS(total);

  el("redPct").textContent = `${pct(totals.red, total)}%`;
  el("amberPct").textContent = `${pct(totals.amber, total)}%`;
  el("greenPct").textContent = `${pct(totals.green, total)}%`;

  renderLiveArea();
  renderSelectedDayEntries(selected);
  renderHistoryDays();
  drawPie(el("pieCanvas"), totals, total);

  save();
}

function gotoDay(offsetDays) {
  const cur = localDayStart(state.selectedDayISO);
  const next = new Date(cur.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  state.selectedDayISO = toLocalDayISO(next);
  save();
  render();
}

function gotoToday() {
  state.selectedDayISO = toLocalDayISO(new Date());
  save();
  render();
}

function init() {
  load();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  el("redBtn").addEventListener("click", () => startOrSwitch("red"));
  el("amberBtn").addEventListener("click", () => startOrSwitch("amber"));
  el("greenBtn").addEventListener("click", () => startOrSwitch("green"));

  el("stopBtn").addEventListener("click", stopRunning);
  el("todayBtn").addEventListener("click", gotoToday);
  el("prevDayBtn").addEventListener("click", () => gotoDay(-1));
  el("nextDayBtn").addEventListener("click", () => gotoDay(1));

  el("exportBtn").addEventListener("click", exportCSV);
  el("addEntryBtn").addEventListener("click", openModalAddEntry);

  el("modalCloseBtn").addEventListener("click", closeModal);
  el("modalCloseBtnBottom").addEventListener("click", closeModal);
  el("modalSaveBtn").addEventListener("click", saveModal);
  el("modalDeleteBtn").addEventListener("click", deleteModalSession);

  el("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === el("modalBackdrop")) closeModal();
  });

  el("historyList").addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const day = t.getAttribute("data-day");
    if (day) {
      state.selectedDayISO = day;
      save();
      render();
    }
  });

  el("selectedDayEntries").addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    const editId = t.getAttribute("data-edit-entry");
    if (editId) {
      const running = getRunningSession();
      if (running && running.id === editId) {
        running.endISO = new Date().toISOString();
        save();
      }
      openModalForSession(editId);
      return;
    }

    const deleteId = t.getAttribute("data-delete-entry");
    if (deleteId) {
      deleteEntryById(deleteId);
    }
  });

  setInterval(() => {
    render();
  }, 1000);

  render();
}

init();
