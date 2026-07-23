const ALARM_NAME = 'mori-mismatch-export-15m';
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
    chrome.tabs.reload(tabId).catch((error) => {
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
    await reloadPage(selected.tab.id);
    const refreshedTab = await waitForMismatchReport(selected.tab.id);
    await chrome.storage.local.set({ mismatchPageUrl: refreshedTab.url });
    const response = await requestExport(refreshedTab.id);
    if (!response?.ok) throw new Error(response?.error || 'Export to Excel was not found.');
    const label = source === 'automatic' ? 'Automatic export started.' : 'Manual export started.';
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

async function configureAlarm(enabled) {
  await chrome.alarms.clear(ALARM_NAME);
  if (enabled) await chrome.alarms.create(ALARM_NAME, { delayInMinutes: 15, periodInMinutes: 15 });
}

chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.local.get('automaticEnabled');
  await configureAlarm(Boolean(saved.automaticEnabled));
  await chrome.action.setBadgeText({ text: '' });
});

chrome.runtime.onStartup.addListener(async () => {
  const saved = await chrome.storage.local.get('automaticEnabled');
  await configureAlarm(Boolean(saved.automaticEnabled));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) runExport('automatic').catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'mori-export-now') {
    runExport('manual').then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
    return true;
  }
  if (message?.type === 'mori-set-automatic') {
    const enabled = Boolean(message.enabled);
    chrome.storage.local.set({ automaticEnabled: enabled })
      .then(() => configureAlarm(enabled))
      .then(() => sendResponse({ ok: true, enabled }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  if (message?.type === 'mori-get-settings') {
    chrome.storage.local.get(['automaticEnabled', 'lastStatus', 'lastStatusOk', 'lastStatusAt'])
      .then((saved) => sendResponse({ ok: true, ...saved }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
});
