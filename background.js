// Intention Setter - background service worker.
// Owns the timer (chrome.alarms) so it keeps running across tabs, page reloads,
// and service-worker restarts. All UI state lives in chrome.storage.local.
//
// Keep top-level work to a minimum: Chrome aborts service-worker registration
// ("Service worker registration failed. Status code: 14" = startup took too long),
// which leaves the panel with nothing to talk to and the timer never starts.

const ALARM_NAME = 'intention-timer';
const NOTIFICATION_ID = 'intention-checkin';
const MIN_MINUTES = 1;
const MAX_MINUTES = 600;

// Pre-rendered 48x48 PNG (indigo ring) used for notifications. Chrome requires an
// iconUrl; embedding it avoids canvas work at startup and binary files in the repo.
const ICON_URL =
  'data:image/png;base64,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';

function clampMinutes(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 25;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, n));
}

async function startTimer(minutes, extra = {}) {
  const durationMin = clampMinutes(minutes);
  const endTime = Date.now() + durationMin * 60 * 1000;
  const update = { ...extra, status: 'running', endTime };
  await chrome.storage.local.set(update);
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { when: endTime });
  await chrome.notifications.clear(NOTIFICATION_ID);
  return update;
}

async function stopTimer(status) {
  const update = { status, endTime: null };
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.notifications.clear(NOTIFICATION_ID);
  await chrome.storage.local.set(update);
  return update;
}

async function triggerCheckin() {
  const { intention = '' } = await chrome.storage.local.get('intention');
  await chrome.storage.local.set({
    status: 'checkin',
    endTime: null,
    panelVisible: true,
    minimized: false
  });
  chrome.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: ICON_URL,
    title: "Time's up!",
    message: intention
      ? `Did you complete your intention: "${intention}"?`
      : 'Did you complete your intention?',
    buttons: [{ title: 'Yes, done' }, { title: 'Not yet (+5 min)' }],
    requireInteraction: true,
    priority: 2
  });
}

// Each handler resolves with the state it wrote, so the panel can update
// immediately instead of relying only on chrome.storage.onChanged.
async function handleMessage(msg) {
  switch (msg && msg.type) {
    case 'start': {
      const intention = String(msg.intention || '').trim();
      if (!intention) throw new Error('Please enter an intention.');
      return startTimer(msg.durationMin, {
        intention,
        durationMin: clampMinutes(msg.durationMin)
      });
    }
    case 'extend':
      return startTimer(msg.minutes);
    case 'complete':
      return stopTimer('done');
    case 'cancel':
      return stopTimer('idle');
    default:
      throw new Error(`Unknown message type: ${msg && msg.type}`);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(
    (state) => sendResponse({ ok: true, state }),
    (err) => sendResponse({ ok: false, error: String((err && err.message) || err) })
  );
  return true; // keep the channel open for the async response
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) triggerCheckin();
});

chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
  if (id !== NOTIFICATION_ID) return;
  if (buttonIndex === 0) stopTimer('done');
  else startTimer(5);
});

chrome.notifications.onClicked.addListener((id) => {
  if (id === NOTIFICATION_ID) chrome.notifications.clear(id);
});

// Toolbar button toggles the floating panel in every tab.
chrome.action.onClicked.addListener(async () => {
  const { panelVisible = true } = await chrome.storage.local.get('panelVisible');
  await chrome.storage.local.set({ panelVisible: !panelVisible, minimized: false });
});

// If the browser was closed while a timer was running, reconcile on startup.
async function reconcile() {
  const { status, endTime } = await chrome.storage.local.get(['status', 'endTime']);
  if (status !== 'running') return;
  if (!endTime || endTime <= Date.now()) {
    await triggerCheckin();
    return;
  }
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) await chrome.alarms.create(ALARM_NAME, { when: endTime });
}

chrome.runtime.onStartup.addListener(reconcile);
chrome.runtime.onInstalled.addListener(reconcile);
