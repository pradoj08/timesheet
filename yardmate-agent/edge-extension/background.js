const LEGACY_ALARM_NAME = 'mori-mismatch-export-15m';
const MISMATCH_ALARM_NAME = 'settegast-mismatch-schedule';
const ALERTMETER_ALARM_NAME = 'settegast-alertmeter-schedule';
const MISMATCH_TIMES = ['0100', '0300', '0600', '0900', '1100', '1300', '1500', '1800', '2100', '2300'];
const ALERTMETER_TIMES = ['0345', '0900', '1545', '2000'];
const UP_ROOT = 'https://employees.www.uprr.com/';
const DEFAULT_PAGE = 'https://employees.www.uprr.com/tos/secure/jas/mismatchedEquipmentPage.jas?wicket:pageMapName=wicket-0';
let exportInProgress = false;
let lastStartedAt = 0;

function resemblesMismatchUrl(tab) {
  const url = String(tab?.url || '');
  return url.startsWith(UP_ROOT) && /mismatchedEquipmentPage/i.test(url);
}

async function setStatus(message, ok) {
  await chrome.storage.local.set({ lastStatus: message, lastStatusOk: Boolean(ok), lastStatusAt: Date.now() });
  await chrome.action.setBadgeText({ text: ok ? 'OK' : '!' });
  await chrome.action.setBadgeBackgroundColor({ color: ok ? '#08775a' : '#c8102e' });
}

async function sendToPage(tabId, type) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/receiving end does not exist|could not establish connection/i.test(message)) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tabId, { type });
  }
}

async function identifyTab(tab) {
  if (!String(tab?.url || '').startsWith(UP_ROOT) || !tab.id) return false;
  try {
    const response = await sendToPage(tab.id, 'mori-identify-mismatch-page');
    return Boolean(response?.ok && response.isMismatchReport);
  } catch {
    return false;
  }
}

async function requestExport(tabId) {
  return sendToPage(tabId, 'mori-run-mismatch-export');
}

async function readAlertMeterDashboard(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'mori-read-alertmeter-dashboard' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/receiving end does not exist|could not establish connection/i.test(message)) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['alertmeter-content.js'] });
    return chrome.tabs.sendMessage(tabId, { type: 'mori-read-alertmeter-dashboard' });
  }
}

async function readRefreshTimestamp(tabId) {
  const response = await sendToPage(tabId, 'mori-read-refresh-timestamp');
  return String(response?.refreshTimestamp || '');
}

function parseRefreshTimestamp(value) {
  const match = String(value || '').match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2})(?::?(\d{2}))\s*(AM|PM)?\s+(CDT|CST)$/i,
  );
  if (!match) return NaN;
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  let hour = Number(match[4]);
  const meridiem = String(match[6] || '').toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  const offsetHours = match[7].toUpperCase() === 'CDT' ? 5 : 6;
  return Date.UTC(year, Number(match[1]) - 1, Number(match[2]), hour, Number(match[5])) + offsetHours * 3600000;
}

function refreshVerification(timestamp, previousTimestamp) {
  const parsed = parseRefreshTimestamp(timestamp);
  const ageMinutes = Number.isFinite(parsed) ? Math.round((Date.now() - parsed) / 60000) : null;
  const verified = ageMinutes !== null && ageMinutes >= -2 && ageMinutes <= 5;
  const changed = Boolean(previousTimestamp && timestamp && previousTimestamp !== timestamp);
  return { timestamp, previousTimestamp, observedAt: new Date().toISOString(), ageMinutes, verified, changed };
}

async function reportRefreshVerification(payload) {
  await fetch('http://127.0.0.1:43127/api/source-refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
  return payload;
}

async function waitForPage(tabId, timeoutMs = 20000) {
  const existing = await chrome.tabs.get(tabId);
  if (existing.status === 'complete') return existing;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('The UP Mismatches page did not finish loading.'));
    }, timeoutMs);
    function listener(updatedId, changeInfo, tab) {
      if (updatedId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function reloadPage(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('The refreshed UP Mismatches page did not finish loading.'));
    }, timeoutMs);
    function listener(updatedId, changeInfo, tab) {
      if (updatedId !== tabId || changeInfo.status !== 'complete') return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.reload(tabId, { bypassCache: true }).catch((error) => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      reject(error);
    });
  });
}

async function waitForMismatchReport(tabId, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    if (await identifyTab(tab)) return tab;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('The refreshed page loaded, but the Mismatches equipment table was not found.');
}

async function waitForCurrentRefresh(tabId, previousTimestamp, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let latest = refreshVerification('', previousTimestamp);
  while (Date.now() < deadline) {
    const timestamp = await readRefreshTimestamp(tabId).catch(() => '');
    latest = refreshVerification(timestamp, previousTimestamp);
    if (latest.verified) return latest;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return latest;
}

async function chooseOrOpenPage() {
  const tabs = await chrome.tabs.query({ url: `${UP_ROOT}*` });
  tabs.sort((left, right) =>
    Number(right.active) - Number(left.active)
    || Number(resemblesMismatchUrl(right)) - Number(resemblesMismatchUrl(left))
    || (right.lastAccessed || 0) - (left.lastAccessed || 0));
  for (const tab of tabs) {
    if (await identifyTab(tab)) return { tab, opened: false };
  }
  const matchingUrlTab = tabs.find(resemblesMismatchUrl);
  if (matchingUrlTab) return { tab: matchingUrlTab, opened: false };
  const stored = await chrome.storage.local.get('mismatchPageUrl');
  const tab = await chrome.tabs.create({
    url: String(stored.mismatchPageUrl || '').startsWith(UP_ROOT) ? stored.mismatchPageUrl : DEFAULT_PAGE,
    active: false,
  });
  const loadedTab = await waitForPage(tab.id);
  if (!await identifyTab(loadedTab)) {
    await chrome.tabs.update(loadedTab.id, { active: true }).catch(() => {});
    throw new Error('Mori opened UP, but the Mismatches report was not available. Sign in and open that report once.');
  }
  return { tab: loadedTab, opened: true };
}

async function runExport(source = 'manual') {
  if (exportInProgress) throw new Error('An export is already running.');
  if (Date.now() - lastStartedAt < 60000) throw new Error('An export was already started within the last minute.');
  exportInProgress = true;
  lastStartedAt = Date.now();
  let openedTab;
  try {
    const selected = await chooseOrOpenPage();
    openedTab = selected.opened ? selected.tab : null;
    const previousTimestamp = await readRefreshTimestamp(selected.tab.id).catch(() => '');
    await reloadPage(selected.tab.id);
    const refreshedTab = await waitForMismatchReport(selected.tab.id);
    const freshness = await waitForCurrentRefresh(refreshedTab.id, previousTimestamp);
    await reportRefreshVerification(freshness);
    if (!freshness.verified) {
      throw new Error(`UP page refreshed, but its footer timestamp is not current (${freshness.timestamp || 'not found'}). No Excel was exported.`);
    }
    const refreshTimestamp = freshness.timestamp;
    await chrome.storage.local.set({ mismatchPageUrl: refreshedTab.url });
    const response = await requestExport(refreshedTab.id);
    if (!response?.ok) throw new Error(response?.error || 'Export to Excel was not found.');
    const label = `${source === 'automatic' ? 'Automatic' : 'Manual'} export started · UP refreshed ${refreshTimestamp}.`;
    await setStatus(label, true);
    if (openedTab) setTimeout(() => chrome.tabs.remove(openedTab.id).catch(() => {}), 5000);
    return { ok: true, message: label };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setStatus(message, false);
    throw error;
  } finally {
    exportInProgress = false;
  }
}

async function activeAlertMeterDashboard() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/app\.alertmeter\.com\/Admin\/Dashboard\/Index/i.test(String(tab.url || ''))) {
    throw new Error('Open the AlertMeter Dashboard tab first, then click Mori and choose Refresh + Push AlertMeter.');
  }
  return tab;
}

async function chooseOrOpenAlertMeterDashboard() {
  const tabs = await chrome.tabs.query({ url: 'https://app.alertmeter.com/*' });
  const dashboard = tabs.find((tab) => /\/Admin\/Dashboard\/Index/i.test(String(tab.url || '')));
  if (dashboard) return dashboard;
  const tab = await chrome.tabs.create({ url: 'https://app.alertmeter.com/Admin/Dashboard/Index', active: false });
  return waitForPage(tab.id, 30000);
}

async function refreshCaptureAndPushAlertMeter(source = 'manual') {
  const priorActive = source === 'automatic'
    ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
    : null;
  const tab = source === 'automatic'
    ? await chooseOrOpenAlertMeterDashboard()
    : await activeAlertMeterDashboard();
  if (source === 'automatic') {
    const hasPermission = await chrome.permissions.contains({ origins: ['<all_urls>'] });
    if (!hasPermission) throw new Error('AlertMeter schedule needs automatic screenshot permission. Re-enable it in Settegast Alerts.');
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  const refreshed = await reloadPage(tab.id, 30000);
  if (!/^https:\/\/app\.alertmeter\.com\/Admin\/Dashboard\/Index/i.test(String(refreshed.url || ''))) {
    throw new Error('AlertMeter opened a different page. Sign in and open the dashboard, then try again.');
  }
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const dashboardInfo = await readAlertMeterDashboard(tab.id);
  if (!dashboardInfo?.ok || !Number.isFinite(Number(dashboardInfo.participation))) {
    throw new Error('Mori could not read the AlertMeter participation percentage. Wait for the dashboard to finish loading and try again.');
  }
  const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  if (!imageDataUrl?.startsWith('data:image/')) throw new Error('Edge could not capture the AlertMeter dashboard.');
  const response = await fetch('http://127.0.0.1:43127/api/push-alertmeter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageDataUrl,
      pageUrl: refreshed.url,
      capturedAt: new Date().toISOString(),
      participation: Number(dashboardInfo.participation),
      participationText: dashboardInfo.participationText,
      viewportWidth: dashboardInfo.viewportWidth,
      viewportHeight: dashboardInfo.viewportHeight,
      crop: dashboardInfo.crop,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'YardMate could not send the AlertMeter snapshot.');
  if (priorActive?.id && priorActive.id !== tab.id) {
    await chrome.tabs.update(priorActive.id, { active: true }).catch(() => {});
    await chrome.windows.update(priorActive.windowId, { focused: true }).catch(() => {});
  }
  const message = `AlertMeter dashboard pushed at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  await setStatus(message, true);
  return { ok: true, message };
}

function nextScheduledTime(times, now = new Date()) {
  for (const value of times) {
    const candidate = new Date(now);
    candidate.setHours(Number(value.slice(0, 2)), Number(value.slice(2)), 0, 0);
    if (candidate.getTime() > now.getTime() + 5000) return candidate;
  }
  const nextDay = new Date(now);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(Number(times[0].slice(0, 2)), Number(times[0].slice(2)), 0, 0);
  return nextDay;
}

async function scheduleNext(alarmName, times, enabled) {
  await chrome.alarms.clear(alarmName);
  if (!enabled) return null;
  const next = nextScheduledTime(times);
  await chrome.alarms.create(alarmName, { when: next.getTime() });
  return next;
}

async function restoreSchedules() {
  await chrome.alarms.clear(LEGACY_ALARM_NAME);
  const saved = await chrome.storage.local.get(['mismatchScheduleEnabled', 'alertMeterScheduleEnabled', 'automaticEnabled']);
  const mismatchEnabled = saved.mismatchScheduleEnabled ?? Boolean(saved.automaticEnabled);
  const alertMeterEnabled = Boolean(saved.alertMeterScheduleEnabled);
  await chrome.storage.local.set({
    mismatchScheduleEnabled: Boolean(mismatchEnabled),
    alertMeterScheduleEnabled: alertMeterEnabled,
    automaticEnabled: false,
  });
  await scheduleNext(MISMATCH_ALARM_NAME, MISMATCH_TIMES, Boolean(mismatchEnabled));
  await scheduleNext(ALERTMETER_ALARM_NAME, ALERTMETER_TIMES, alertMeterEnabled);
}

chrome.runtime.onInstalled.addListener(async () => {
  await restoreSchedules();
  await chrome.action.setBadgeText({ text: '' });
});

chrome.runtime.onStartup.addListener(async () => {
  await restoreSchedules();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === MISMATCH_ALARM_NAME) {
    const saved = await chrome.storage.local.get('mismatchScheduleEnabled');
    try { await runExport('automatic'); } catch (_) {}
    await scheduleNext(MISMATCH_ALARM_NAME, MISMATCH_TIMES, Boolean(saved.mismatchScheduleEnabled));
  }
  if (alarm.name === ALERTMETER_ALARM_NAME) {
    const saved = await chrome.storage.local.get('alertMeterScheduleEnabled');
    try { await refreshCaptureAndPushAlertMeter('automatic'); } catch (error) {
      await setStatus(error instanceof Error ? error.message : String(error), false);
    }
    await scheduleNext(ALERTMETER_ALARM_NAME, ALERTMETER_TIMES, Boolean(saved.alertMeterScheduleEnabled));
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'mori-export-now') {
    runExport('manual').then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
    return true;
  }
  if (message?.type === 'mori-push-alertmeter') {
    refreshCaptureAndPushAlertMeter('manual').then(sendResponse).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await setStatus(message, false);
      sendResponse({ ok: false, error: message });
    });
    return true;
  }
  if (message?.type === 'mori-set-schedule') {
    const kind = message.kind === 'alertmeter' ? 'alertmeter' : 'mismatch';
    const enabled = Boolean(message.enabled);
    const storageKey = kind === 'alertmeter' ? 'alertMeterScheduleEnabled' : 'mismatchScheduleEnabled';
    const alarmName = kind === 'alertmeter' ? ALERTMETER_ALARM_NAME : MISMATCH_ALARM_NAME;
    const times = kind === 'alertmeter' ? ALERTMETER_TIMES : MISMATCH_TIMES;
    chrome.storage.local.set({ [storageKey]: enabled })
      .then(() => scheduleNext(alarmName, times, enabled))
      .then((next) => sendResponse({
        ok: true,
        enabled,
        message: enabled
          ? `${kind === 'alertmeter' ? 'AlertMeter' : 'Mismatch'} schedule enabled. Next run ${next.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`
          : `${kind === 'alertmeter' ? 'AlertMeter' : 'Mismatch'} schedule paused.`,
      }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  if (message?.type === 'mori-get-settings') {
    chrome.storage.local.get(['mismatchScheduleEnabled', 'alertMeterScheduleEnabled', 'lastStatus', 'lastStatusOk', 'lastStatusAt'])
      .then((saved) => sendResponse({ ok: true, ...saved }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
});
