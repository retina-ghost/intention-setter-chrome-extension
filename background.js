// Intention Setter - background service worker.
// Owns the timer (chrome.alarms) so it keeps running across tabs, page reloads,
// and service-worker restarts. All UI state lives in chrome.storage.local.

const ALARM_NAME = 'intention-timer';
const NOTIFICATION_ID = 'intention-checkin';
const MIN_MINUTES = 1;
const MAX_MINUTES = 600;

// Small solid-colour icon used for notifications (Chrome requires an iconUrl).
const ICON_URL = createIconDataUrl();

function createIconDataUrl() {
  // Generated at runtime so the repo does not need binary image files.
  try {
    const canvas = new OffscreenCanvas(128, 128);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4f46e5';
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(64, 64, 22, 0, Math.PI * 2);
    ctx.fill();
    return canvas.convertToBlob({ type: 'image/png' }).then(blobToDataUrl).catch(() => null);
  } catch (e) {
    return Promise.resolve(null);
  }
}

async function blobToDataUrl(blob) {
  // FileReader is not reliably available in service workers, so encode manually.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

function clampMinutes(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 25;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, n));
}

async function startTimer(minutes, extra = {}) {
  const durationMin = clampMinutes(minutes);
  const endTime = Date.now() + durationMin * 60 * 1000;
  await chrome.storage.local.set({ ...extra, status: 'running', endTime });
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { when: endTime });
  await chrome.notifications.clear(NOTIFICATION_ID);
}

async function stopTimer(status) {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.notifications.clear(NOTIFICATION_ID);
  await chrome.storage.local.set({ status, endTime: null });
}

async function triggerCheckin() {
  const { intention = '' } = await chrome.storage.local.get('intention');
  await chrome.storage.local.set({
    status: 'checkin',
    endTime: null,
    panelVisible: true,
    minimized: false
  });
  const iconUrl = await ICON_URL;
  if (!iconUrl) return;
  chrome.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl,
    title: "Time's up!",
    message: intention
      ? `Did you complete your intention: "${intention}"?`
      : 'Did you complete your intention?',
    buttons: [{ title: 'Yes, done' }, { title: 'Not yet (+5 min)' }],
    requireInteraction: true,
    priority: 2
  });
}

async function handleMessage(msg) {
  switch (msg && msg.type) {
    case 'start': {
      const intention = String(msg.intention || '').trim();
      if (!intention) throw new Error('Please enter an intention.');
      await startTimer(msg.durationMin, {
        intention,
        durationMin: clampMinutes(msg.durationMin)
      });
      return;
    }
    case 'extend':
      await startTimer(msg.minutes);
      return;
    case 'complete':
      await stopTimer('done');
      return;
    case 'cancel':
      await stopTimer('idle');
      return;
    default:
      throw new Error(`Unknown message type: ${msg && msg.type}`);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(
    () => sendResponse({ ok: true }),
    (err) => sendResponse({ ok: false, error: String(err.message || err) })
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
