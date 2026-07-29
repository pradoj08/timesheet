const LEGACY_ALARM_NAME = 'mori-mismatch-export-15m';
const MISMATCH_ALARM_NAME = 'settegast-mismatch-schedule';
const ALERTMETER_ALARM_NAME = 'settegast-alertmeter-schedule';
const YARDCHECK_ALARM_NAME = 'settegast-yardcheck-schedule';
const VISION_ALARM_NAME = 'settegast-vision-schedule';
const COMMAND_POLL_ALARM_NAME = 'settegast-command-poll';
const UP_ROOT = 'https://employees.www.uprr.com/';
const DEFAULT_PAGE = 'https://employees.www.uprr.com/tos/secure/jas/mismatchedEquipmentPage.jas?wicket:pageMapName=wicket-0';
const YARD_CHECK_PAGE = 'https://employees.www.uprr.com/tos/web2/secure/index.html#/yardcheck';
const VISION_PAGE = 'https://employees.www.uprr.com/imx/vision/secure/#/?circ7=B%20372';
const VISION_PAGE_HINT = '/imx/vision/secure/';
let exportInProgress = false;
let lastStartedAt = 0;
let exportStartedAt = 0;
let commandPollInProgress = false;
const EXPORT_LOCK_TIMEOUT_MS = 90000;

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

async function prepareAlertMeterDashboard(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'mori-prepare-alertmeter-dashboard' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/receiving end does not exist|could not establish connection/i.test(message)) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['alertmeter-content.js'] });
    return chrome.tabs.sendMessage(tabId, { type: 'mori-prepare-alertmeter-dashboard' });
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
      reject(new Error('The refreshed UP page did not finish loading.'));
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
  if (exportInProgress && Date.now() - exportStartedAt >= EXPORT_LOCK_TIMEOUT_MS) {
    exportInProgress = false;
    exportStartedAt = 0;
  }
  if (exportInProgress) throw new Error('The UP page is still being refreshed for an export. Try again shortly.');
  if (Date.now() - lastStartedAt < 60000) throw new Error('An export was already started within the last minute.');
  exportInProgress = true;
  lastStartedAt = Date.now();
  exportStartedAt = lastStartedAt;
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
    lastStartedAt = 0;
    await setStatus(message, false);
    throw error;
  } finally {
    exportInProgress = false;
    exportStartedAt = 0;
  }
}

async function prepareYardCheck(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'mori-prepare-yardcheck' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/receiving end does not exist|could not establish connection/i.test(message)) throw error;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['yardcheck-content.js'] });
    return chrome.tabs.sendMessage(tabId, { type: 'mori-prepare-yardcheck' });
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
  const dashboardInfo = await prepareAlertMeterDashboard(tab.id);
  if (!dashboardInfo?.ok || !Number.isFinite(Number(dashboardInfo.participation))) {
    throw new Error('Mori could not read the AlertMeter participation percentage. Wait for the dashboard to finish loading and try again.');
  }
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  await new Promise((resolve) => setTimeout(resolve, 250));
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
      noTestTakenFilterApplied: Boolean(dashboardInfo.noTestTakenFilterApplied),
      missingEmployees: Array.isArray(dashboardInfo.missingEmployees) ? dashboardInfo.missingEmployees : [],
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

async function chooseOrOpenYardCheck() {
  const tabs = await chrome.tabs.query({ url: `${UP_ROOT}*` });
  const existing = tabs.find((tab) => /\/tos\/web2\/secure\/index\.html#\/yardcheck/i.test(String(tab.url || '')));
  if (existing) return existing;
  const tab = await chrome.tabs.create({ url: YARD_CHECK_PAGE, active: false });
  return waitForPage(tab.id, 30000);
}

async function refreshCaptureAndPushYardCheck() {
  const priorActive = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const tab = await chooseOrOpenYardCheck();
  const refreshed = await reloadPage(tab.id, 30000);
  if (!/\/tos\/web2\/secure\/index\.html#\/yardcheck/i.test(String(refreshed.url || ''))) {
    await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
    throw new Error('UP Yard Check opened a different page. Sign in and open Yard Check, then try again.');
  }
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const pageInfo = await prepareYardCheck(tab.id);
  if (!pageInfo?.ok) throw new Error(pageInfo?.error || 'The Yard Check filters could not be applied.');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  if (!imageDataUrl?.startsWith('data:image/')) throw new Error('Edge could not capture the Yard Check results.');
  const response = await fetch('http://127.0.0.1:43127/api/push-yardcheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageDataUrl,
      pageUrl: refreshed.url,
      capturedAt: new Date().toISOString(),
      yard: pageInfo.yard || 'B 372',
      lookbackHours: Number(pageInfo.lookbackHours) || 12,
      checked: pageInfo.checked || [],
      viewportWidth: pageInfo.viewportWidth,
      viewportHeight: pageInfo.viewportHeight,
      crop: pageInfo.crop,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'YardMate could not send the Yard Check snapshot.');
  if (priorActive?.id && priorActive.id !== tab.id) {
    await chrome.tabs.update(priorActive.id, { active: true }).catch(() => {});
    await chrome.windows.update(priorActive.windowId, { focused: true }).catch(() => {});
  }
  const message = `Yard Check B 372 refreshed, fully loaded, and pushed at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  await setStatus(message, true);
  return { ok: true, message };
}

function resemblesVisionPage(tab) {
  const url = String(tab?.url || '');
  return url.startsWith(UP_ROOT) && url.toLowerCase().includes(VISION_PAGE_HINT);
}

async function chooseOrOpenVisionPage() {
  const tabs = await chrome.tabs.query({ url: `${UP_ROOT}*` });
  const existing = tabs.find(resemblesVisionPage);
  if (existing) return existing;
  const tab = await chrome.tabs.create({ url: VISION_PAGE, active: false });
  return waitForPage(tab.id, 30000);
}

async function prepareVisionLifts(tabId) {
  const executions = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: async () => {
      const allElements = () => {
        const found = [];
        const visit = (root) => {
          for (const element of root.querySelectorAll('*')) {
            found.push(element);
            if (element.shadowRoot) visit(element.shadowRoot);
          }
        };
        visit(document);
        return found;
      };
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const exactText = (element) => String(element.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase();
      const liftLabels = allElements()
        .filter((element) => visible(element) && exactText(element) === 'LIFTS')
        .sort((left, right) => {
          const leftRole = left.matches('[role="tab"],button,a,[class*="tab" i]') ? 0 : 1;
          const rightRole = right.matches('[role="tab"],button,a,[class*="tab" i]') ? 0 : 1;
          if (leftRole !== rightRole) return leftRole - rightRole;
          const leftArea = left.getBoundingClientRect().width * left.getBoundingClientRect().height;
          const rightArea = right.getBoundingClientRect().width * right.getBoundingClientRect().height;
          return leftArea - rightArea;
        });
      const label = liftLabels[0];
      if (!label) return { ok: false, error: 'The LIFTS tab was not found on the UP Vision page.' };
      const clickTargets = [];
      let current = label;
      for (let depth = 0; current && depth < 7; depth += 1) {
        const rect = current.getBoundingClientRect();
        if (visible(current) && exactText(current) === 'LIFTS' && rect.width <= 320 && rect.height <= 110) {
          clickTargets.push(current);
        }
        current = current.parentElement || current.getRootNode()?.host || null;
      }
      const semantic = label.closest('[role="tab"],button,a,[tabindex]');
      if (semantic) clickTargets.push(semantic);
      const uniqueTargets = [...new Set(clickTargets)];
      let liftContentReady = false;
      const contentIsReady = () => {
        const combined = allElements().map((element) => String(element.innerText || element.textContent || '')).join('\n');
        return combined.includes('Completed Lift Work Orders') && combined.includes('Outstanding Lift Work Orders');
      };
      for (const clickable of uniqueTargets) {
        clickable.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const tabRect = clickable.getBoundingClientRect();
        const eventInit = {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: tabRect.left + tabRect.width / 2,
          clientY: tabRect.top + tabRect.height / 2,
          button: 0,
          buttons: 1,
        };
        clickable.focus?.();
        clickable.dispatchEvent(new PointerEvent('pointerdown', eventInit));
        clickable.dispatchEvent(new MouseEvent('mousedown', eventInit));
        clickable.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, buttons: 0 }));
        clickable.dispatchEvent(new MouseEvent('mouseup', { ...eventInit, buttons: 0 }));
        clickable.dispatchEvent(new MouseEvent('click', { ...eventInit, buttons: 0 }));
        clickable.click();
        const clickDeadline = Date.now() + 5000;
        while (Date.now() < clickDeadline) {
          if (contentIsReady()) {
            liftContentReady = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
        if (liftContentReady) break;
      }
      if (!liftContentReady) {
        return { ok: false, error: 'The visible LIFTS tab was clicked through every component layer, but its content did not become active.' };
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const addAllBarLabels = async () => {
        document.querySelectorAll('[data-mori-lift-value]').forEach((element) => element.remove());
        const svgs = allElements().filter((element) => {
          if (String(element.tagName).toLowerCase() !== 'svg' || !visible(element)) return false;
          const bounds = element.getBoundingClientRect();
          const narrowBars = [...element.querySelectorAll('rect,path')].filter((shape) => {
            const rect = shape.getBoundingClientRect();
            const className = String(shape.className?.baseVal || shape.className || '');
            return visible(shape)
              && !/legend|axis|grid|tick|background|border/i.test(className)
              && rect.width >= 4
              && rect.width <= 45
              && rect.height >= 2;
          }).length;
          return bounds.width >= 380 && bounds.height >= 140 && bounds.height <= 650 && narrowBars >= 8;
        });
        const chart = svgs.sort((left, right) => {
          const a = left.getBoundingClientRect();
          const b = right.getBoundingClientRect();
          return (b.width * b.height) - (a.width * a.height);
        })[0];
        if (!chart) return 0;
        const chartBounds = chart.getBoundingClientRect();
        const bars = [...chart.querySelectorAll('rect,path')].filter((element) => {
          const bounds = element.getBoundingClientRect();
          const fill = getComputedStyle(element).fill;
          const className = String(element.className?.baseVal || element.className || '');
          return visible(element)
            && !/legend|axis|grid|tick|background|border/i.test(className)
            && bounds.width >= 4
            && bounds.width <= 45
            && bounds.height >= 2
            && bounds.left >= chartBounds.left
            && bounds.right <= chartBounds.right
            && bounds.left <= chartBounds.left + chartBounds.width * 0.78
            && bounds.top >= chartBounds.top + 12
            && bounds.bottom <= chartBounds.bottom - 20
            && fill !== 'none'
            && fill !== 'rgba(0, 0, 0, 0)';
        });
        const groups = [];
        for (const bar of bars) {
          const bounds = bar.getBoundingClientRect();
          const center = bounds.left + bounds.width / 2;
          let group = groups.find((candidate) => Math.abs(candidate.center - center) <= 3);
          if (!group) {
            group = { center, bars: [] };
            groups.push(group);
          }
          group.bars.push(bar);
        }
        const plotted = groups
          .filter((group) => group.bars.some((bar) => bar.getBoundingClientRect().height >= 3))
          .sort((left, right) => left.center - right.center);
        const baseline = plotted.length
          ? Math.max(...plotted.flatMap((group) => group.bars.map((bar) => bar.getBoundingClientRect().bottom)))
          : 0;
        const scaleCandidates = [...chart.querySelectorAll('text,tspan')].map((element) => {
          const raw = String(element.textContent || '').trim();
          const value = /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : NaN;
          const bounds = element.getBoundingClientRect();
          const y = bounds.top + bounds.height / 2;
          const scale = value > 0 ? (baseline - y) / value : NaN;
          return Number.isFinite(scale)
            && scale > 0.25
            && bounds.right <= chartBounds.left + chartBounds.width * 0.2
            && y < baseline
            ? scale
            : NaN;
        }).filter(Number.isFinite).sort((left, right) => left - right);
        const pixelsPerLift = scaleCandidates.length
          ? scaleCandidates[Math.floor(scaleCandidates.length / 2)]
          : NaN;
        const dataValue = (bar) => {
          const data = bar.__data__;
          const candidates = [
            data?.y, data?.value, data?.data?.y, data?.data?.value,
            bar.point?.y, bar.point?.options?.y,
          ];
          const numeric = candidates.map(Number).find(Number.isFinite);
          if (Number.isFinite(numeric)) return numeric;
          const labelText = [
            bar.getAttribute('aria-label'),
            bar.getAttribute('data-value'),
            bar.getAttribute('value'),
          ].filter(Boolean).join(' ');
          const match = labelText.match(/(-?\d+(?:\.\d+)?)\s*$/);
          return match ? Number(match[1]) : null;
        };
        const tooltipValue = () => {
          const tooltip = allElements().filter((element) => {
            if (!visible(element)) return false;
            const className = String(element.className?.baseVal || element.className || '');
            const role = element.getAttribute?.('role') || '';
            return role === 'tooltip' || /tooltip/i.test(className);
          }).sort((left, right) => {
            const a = left.getBoundingClientRect();
            const b = right.getBoundingClientRect();
            return (a.width * a.height) - (b.width * b.height);
          })[0];
          const tooltipText = String(tooltip?.innerText || tooltip?.textContent || '').replace(/\s+/g, ' ').trim();
          const match = tooltipText.match(/(-?\d+(?:\.\d+)?)\s*$/);
          return match ? Number(match[1]) : null;
        };
        let labelsAdded = 0;
        for (const group of plotted) {
          const bounds = group.bars.map((bar) => bar.getBoundingClientRect());
          const top = Math.min(...bounds.map((rect) => rect.top));
          let total = Number.isFinite(pixelsPerLift)
            ? Math.max(0, Math.round((baseline - top) / pixelsPerLift))
            : 0;
          let foundValue = Number.isFinite(pixelsPerLift);
          if (!foundValue) {
            for (const bar of group.bars) {
              let value = dataValue(bar);
              if (!Number.isFinite(value)) {
                const barBounds = bar.getBoundingClientRect();
                const eventInit = {
                  bubbles: true,
                  composed: true,
                  clientX: barBounds.left + barBounds.width / 2,
                  clientY: barBounds.top + Math.max(2, barBounds.height / 2),
                };
                bar.dispatchEvent(new PointerEvent('pointermove', eventInit));
                bar.dispatchEvent(new MouseEvent('mousemove', eventInit));
                await new Promise((resolve) => setTimeout(resolve, 180));
                value = tooltipValue();
              }
              if (Number.isFinite(value)) {
                total += value;
                foundValue = true;
              }
            }
          }
          if (!foundValue) continue;
          const label = document.createElement('div');
          label.dataset.moriLiftValue = 'true';
          label.textContent = String(Math.round(total));
          Object.assign(label.style, {
            position: 'fixed',
            zIndex: '2147483647',
            left: `${group.center}px`,
            top: `${Math.max(2, top - 4)}px`,
            transform: 'translate(-50%, -100%)',
            color: '#111827',
            background: 'rgba(255,255,255,.88)',
            padding: '0 2px',
            borderRadius: '2px',
            font: '700 13px/16px Arial, sans-serif',
            pointerEvents: 'none',
          });
          document.documentElement.appendChild(label);
          labelsAdded += 1;
        }
        chart.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        return labelsAdded;
      };
      const liftLabelsAdded = await addAllBarLabels();
      if (liftLabelsAdded < 1) {
        return {
          ok: false,
          error: 'The LIFTS chart loaded, but its hourly bar values could not be read.',
        };
      }

      const required = [
        'Houston - Houston, TX',
        'LIFTS',
        'Completed Lift Work Orders',
        'Outstanding Lift Work Orders',
        'Daily Lift Pace',
        'Hourly Lift Run Rate',
      ];
      const candidates = allElements().filter((element) => {
        if (!visible(element)) return false;
        const content = String(element.innerText || element.textContent || '');
        if (!required.every((term) => content.includes(term))) return false;
        const rect = element.getBoundingClientRect();
        return rect.width >= 360 && rect.height >= 450;
      });
      candidates.sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return (a.width * a.height) - (b.width * b.height);
      });
      let panel = candidates[0];
      if (!panel) {
        const locationLabel = allElements()
          .filter((element) => visible(element) && exactText(element).includes('HOUSTON - HOUSTON, TX'))
          .sort((left, right) => {
            const a = left.getBoundingClientRect();
            const b = right.getBoundingClientRect();
            return (a.width * a.height) - (b.width * b.height);
          })[0];
        const panelAncestors = [];
        let ancestor = locationLabel;
        for (let depth = 0; ancestor && depth < 12; depth += 1) {
          const bounds = ancestor.getBoundingClientRect();
          if (visible(ancestor)
            && bounds.width >= 360
            && bounds.height >= window.innerHeight * 0.65
            && bounds.right >= window.innerWidth * 0.9) {
            panelAncestors.push(ancestor);
          }
          ancestor = ancestor.parentElement || ancestor.getRootNode()?.host || null;
        }
        panelAncestors.sort((left, right) => {
          const a = left.getBoundingClientRect();
          const b = right.getBoundingClientRect();
          return (a.width * a.height) - (b.width * b.height);
        });
        panel = panelAncestors[0];
      }
      const locationTop = allElements()
        .filter((element) => visible(element) && exactText(element).includes('HOUSTON - HOUSTON, TX'))
        .map((element) => element.getBoundingClientRect().top)
        .sort((left, right) => left - right)[0];
      const rect = panel?.getBoundingClientRect() || {
        left: window.innerWidth * 0.6,
        top: Number.isFinite(locationTop) ? Math.max(0, locationTop - 24) : 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      };
      const x = Math.max(0, rect.left);
      const y = Math.max(0, rect.top);
      const right = Math.min(window.innerWidth, rect.right);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      return {
        ok: true,
        isTopFrame: window.top === window,
        frameUrl: location.href,
        liftLabelsAdded,
        crop: {
          x,
          y,
          width: Math.max(1, right - x),
          height: Math.max(1, bottom - y),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        },
      };
    },
  });
  const success = executions.find((execution) => execution.result?.ok)?.result;
  if (success) return success;
  const failure = executions.map((execution) => execution.result).find((result) => result?.error);
  return failure || { ok: false, error: 'The LIFTS tab was not found in the UP Vision page or its embedded panels.' };
}

async function captureVisionPage() {
  const priorActive = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const tab = await chooseOrOpenVisionPage();
  if (!tab?.id || !tab.windowId) {
    throw new Error('The UP Vision page could not be opened.');
  }
  if (!resemblesVisionPage(tab)) throw new Error('UP Vision opened a different page. Sign in and open the Vision dashboard first.');
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  const refreshed = await reloadPage(tab.id, 45000);
  if (!resemblesVisionPage(refreshed)) {
    throw new Error('UP Vision refreshed to a different page. Sign in and open the B 372 Vision dashboard first.');
  }
  // Select LIFTS as soon as the refreshed document is available. The helper
  // waits for the LIFTS data itself, so no Inventory-panel delay is needed.
  const lifts = await prepareVisionLifts(tab.id);
  if (!lifts?.ok) throw new Error(lifts?.error || 'The UP Vision LIFTS panel could not be prepared.');
  const imageDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  if (!imageDataUrl?.startsWith('data:image/')) throw new Error('Edge could not capture the Vision dashboard.');
  const response = await fetch('http://127.0.0.1:43127/api/capture-vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageDataUrl,
      pageUrl: refreshed.url,
      capturedAt: new Date().toISOString(),
      crop: lifts.crop,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'YardMate could not store the Vision snapshot.');
  if (priorActive?.id && priorActive.id !== tab.id) {
    await chrome.tabs.update(priorActive.id, { active: true }).catch(() => {});
    await chrome.windows.update(priorActive.windowId, { focused: true }).catch(() => {});
  }
  const message = `UP Vision B 372 LIFTS panel refreshed with all ${Number(lifts.liftLabelsAdded) || 0} visible bar labels, cropped, and pushed at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  await setStatus(message, true);
  return { ok: true, message };
}

async function pollYardMateCommands() {
  if (commandPollInProgress) return;
  commandPollInProgress = true;
  let command;
  try {
    const scheduleResponse = await fetch('http://127.0.0.1:43127/api/schedules', { cache: 'no-store' });
    if (scheduleResponse.ok) {
      const remote = (await scheduleResponse.json()).programmedSchedules || {};
      const mismatchTimes = Array.isArray(remote.mismatchTimes) ? remote.mismatchTimes : [];
      const alertMeterTimes = Array.isArray(remote.alertMeterTimes) ? remote.alertMeterTimes : [];
      const yardCheckTimes = Array.isArray(remote.yardCheckTimes) ? remote.yardCheckTimes : [];
      const visionTimes = Array.isArray(remote.visionTimes) ? remote.visionTimes : [];
      const savedRemote = await chrome.storage.local.get(['mismatchScheduleEnabled', 'alertMeterScheduleEnabled', 'yardCheckScheduleEnabled', 'visionScheduleEnabled', 'mismatchScheduleTimes', 'alertMeterScheduleTimes', 'yardCheckScheduleTimes', 'visionScheduleTimes']);
      const changed = Boolean(savedRemote.mismatchScheduleEnabled) !== Boolean(remote.mismatchEnabled)
        || Boolean(savedRemote.alertMeterScheduleEnabled) !== Boolean(remote.alertMeterEnabled)
        || Boolean(savedRemote.yardCheckScheduleEnabled) !== Boolean(remote.yardCheckEnabled)
        || Boolean(savedRemote.visionScheduleEnabled) !== Boolean(remote.visionEnabled)
        || JSON.stringify(savedRemote.mismatchScheduleTimes || []) !== JSON.stringify(mismatchTimes)
        || JSON.stringify(savedRemote.alertMeterScheduleTimes || []) !== JSON.stringify(alertMeterTimes)
        || JSON.stringify(savedRemote.yardCheckScheduleTimes || []) !== JSON.stringify(yardCheckTimes)
        || JSON.stringify(savedRemote.visionScheduleTimes || []) !== JSON.stringify(visionTimes);
      if (changed) {
        await chrome.storage.local.set({
          mismatchScheduleEnabled: Boolean(remote.mismatchEnabled),
          alertMeterScheduleEnabled: Boolean(remote.alertMeterEnabled),
          yardCheckScheduleEnabled: Boolean(remote.yardCheckEnabled),
          visionScheduleEnabled: Boolean(remote.visionEnabled),
          mismatchScheduleTimes: mismatchTimes,
          alertMeterScheduleTimes: alertMeterTimes,
          yardCheckScheduleTimes: yardCheckTimes,
          visionScheduleTimes: visionTimes,
        });
        await scheduleNext(MISMATCH_ALARM_NAME, mismatchTimes, Boolean(remote.mismatchEnabled));
        await scheduleNext(ALERTMETER_ALARM_NAME, alertMeterTimes, Boolean(remote.alertMeterEnabled));
        await scheduleNext(YARDCHECK_ALARM_NAME, yardCheckTimes, Boolean(remote.yardCheckEnabled));
        await scheduleNext(VISION_ALARM_NAME, visionTimes, Boolean(remote.visionEnabled));
      }
    }
    const [savedSchedule, mismatchAlarm, alertMeterAlarm, yardCheckAlarm, visionAlarm] = await Promise.all([
      chrome.storage.local.get(['mismatchScheduleEnabled', 'alertMeterScheduleEnabled', 'yardCheckScheduleEnabled', 'visionScheduleEnabled']),
      chrome.alarms.get(MISMATCH_ALARM_NAME),
      chrome.alarms.get(ALERTMETER_ALARM_NAME),
      chrome.alarms.get(YARDCHECK_ALARM_NAME),
      chrome.alarms.get(VISION_ALARM_NAME),
    ]);
    const scheduleQuery = new URLSearchParams({
      mismatchEnabled: savedSchedule.mismatchScheduleEnabled ? '1' : '0',
      alertMeterEnabled: savedSchedule.alertMeterScheduleEnabled ? '1' : '0',
      yardCheckEnabled: savedSchedule.yardCheckScheduleEnabled ? '1' : '0',
      visionEnabled: savedSchedule.visionScheduleEnabled ? '1' : '0',
      mismatchNextAt: mismatchAlarm?.scheduledTime ? new Date(mismatchAlarm.scheduledTime).toISOString() : '',
      alertMeterNextAt: alertMeterAlarm?.scheduledTime ? new Date(alertMeterAlarm.scheduledTime).toISOString() : '',
      yardCheckNextAt: yardCheckAlarm?.scheduledTime ? new Date(yardCheckAlarm.scheduledTime).toISOString() : '',
      visionNextAt: visionAlarm?.scheduledTime ? new Date(visionAlarm.scheduledTime).toISOString() : '',
    });
    const response = await fetch(`http://127.0.0.1:43127/api/alertmeter-command?${scheduleQuery}`, { cache: 'no-store' });
    const result = await response.json();
    command = result.command;
    if (!command?.id || !['capture-alertmeter', 'capture-yardcheck', 'capture-vision'].includes(command.type)) return;
    try {
      if (command.type === 'capture-yardcheck') await refreshCaptureAndPushYardCheck();
      else if (command.type === 'capture-vision') await captureVisionPage();
      else await refreshCaptureAndPushAlertMeter('automatic');
      const completePath = command.type === 'capture-yardcheck'
        ? 'complete-yardcheck-command'
        : command.type === 'capture-vision' ? 'complete-vision-command' : 'complete-alertmeter-command';
      await fetch(`http://127.0.0.1:43127/api/${completePath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: command.id, ok: true }),
      });
    } catch (error) {
      const completePath = command.type === 'capture-yardcheck'
        ? 'complete-yardcheck-command'
        : command.type === 'capture-vision' ? 'complete-vision-command' : 'complete-alertmeter-command';
      await fetch(`http://127.0.0.1:43127/api/${completePath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: command.id, ok: false, error: error instanceof Error ? error.message : String(error) }),
      }).catch(() => {});
    }
  } catch (_) {
  } finally {
    commandPollInProgress = false;
  }
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
  if (!enabled || !Array.isArray(times) || !times.length) return null;
  const next = nextScheduledTime(times);
  await chrome.alarms.create(alarmName, { when: next.getTime() });
  return next;
}

async function scheduleAlertMeter(enabled) {
  const saved = await chrome.storage.local.get('alertMeterScheduleTimes');
  return scheduleNext(ALERTMETER_ALARM_NAME, saved.alertMeterScheduleTimes || [], enabled);
}

async function restoreSchedules() {
  await chrome.alarms.clear(LEGACY_ALARM_NAME);
  const saved = await chrome.storage.local.get(['mismatchScheduleEnabled', 'alertMeterScheduleEnabled', 'yardCheckScheduleEnabled', 'visionScheduleEnabled', 'automaticEnabled', 'mismatchScheduleTimes', 'alertMeterScheduleTimes', 'yardCheckScheduleTimes', 'visionScheduleTimes']);
  const mismatchEnabled = Boolean(saved.mismatchScheduleEnabled);
  const alertMeterEnabled = Boolean(saved.alertMeterScheduleEnabled);
  const yardCheckEnabled = Boolean(saved.yardCheckScheduleEnabled);
  const visionEnabled = Boolean(saved.visionScheduleEnabled);
  await chrome.storage.local.set({
    mismatchScheduleEnabled: Boolean(mismatchEnabled),
    alertMeterScheduleEnabled: alertMeterEnabled,
    yardCheckScheduleEnabled: yardCheckEnabled,
    visionScheduleEnabled: visionEnabled,
    automaticEnabled: false,
  });
  await scheduleNext(MISMATCH_ALARM_NAME, saved.mismatchScheduleTimes || [], Boolean(mismatchEnabled));
  await scheduleAlertMeter(alertMeterEnabled);
  await scheduleNext(YARDCHECK_ALARM_NAME, saved.yardCheckScheduleTimes || [], yardCheckEnabled);
  await scheduleNext(VISION_ALARM_NAME, saved.visionScheduleTimes || [], visionEnabled);
  await chrome.alarms.clear(COMMAND_POLL_ALARM_NAME);
  await chrome.alarms.create(COMMAND_POLL_ALARM_NAME, { delayInMinutes: 0.1, periodInMinutes: 0.5 });
}

chrome.runtime.onInstalled.addListener(async () => {
  await restoreSchedules();
  await chrome.action.setBadgeText({ text: '' });
  const saved = await chrome.storage.local.get('mismatchScheduleEnabled');
  if (saved.mismatchScheduleEnabled) {
    runExport('automatic').catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await restoreSchedules();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === COMMAND_POLL_ALARM_NAME) {
    await pollYardMateCommands();
  }
  if (alarm.name === MISMATCH_ALARM_NAME) {
    const saved = await chrome.storage.local.get(['mismatchScheduleEnabled', 'mismatchScheduleTimes']);
    try { await runExport('automatic'); } catch (_) {}
    await scheduleNext(MISMATCH_ALARM_NAME, saved.mismatchScheduleTimes || [], Boolean(saved.mismatchScheduleEnabled));
  }
  if (alarm.name === ALERTMETER_ALARM_NAME) {
    try { await refreshCaptureAndPushAlertMeter('automatic'); } catch (error) {
      await setStatus(error instanceof Error ? error.message : String(error), false);
    }
    const saved = await chrome.storage.local.get('alertMeterScheduleEnabled');
    await scheduleAlertMeter(Boolean(saved.alertMeterScheduleEnabled));
  }
  if (alarm.name === YARDCHECK_ALARM_NAME) {
    const saved = await chrome.storage.local.get(['yardCheckScheduleEnabled', 'yardCheckScheduleTimes']);
    try { await refreshCaptureAndPushYardCheck(); } catch (error) {
      await setStatus(error instanceof Error ? error.message : String(error), false);
    }
    await scheduleNext(YARDCHECK_ALARM_NAME, saved.yardCheckScheduleTimes || [], Boolean(saved.yardCheckScheduleEnabled));
  }
  if (alarm.name === VISION_ALARM_NAME) {
    const saved = await chrome.storage.local.get(['visionScheduleEnabled', 'visionScheduleTimes']);
    try { await captureVisionPage(); } catch (error) {
      await setStatus(error instanceof Error ? error.message : String(error), false);
    }
    await scheduleNext(VISION_ALARM_NAME, saved.visionScheduleTimes || [], Boolean(saved.visionScheduleEnabled));
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
  if (message?.type === 'mori-push-yardcheck') {
    refreshCaptureAndPushYardCheck().then(sendResponse).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      await setStatus(message, false);
      sendResponse({ ok: false, error: message });
    });
    return true;
  }
  if (message?.type === 'mori-capture-vision') {
    captureVisionPage().then(sendResponse).catch(async (error) => {
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
    chrome.storage.local.set({ [storageKey]: enabled })
      .then(() => kind === 'alertmeter'
        ? scheduleAlertMeter(enabled)
        : scheduleNext(MISMATCH_ALARM_NAME, [], enabled))
      .then(async (next) => {
        let initialMessage = '';
        if (enabled && kind === 'mismatch') {
          try {
            await runExport('automatic');
            initialMessage = ' Initial verified refresh/export completed.';
          } catch (error) {
            initialMessage = ` Schedule is enabled, but the initial refresh needs attention: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        sendResponse({
          ok: true,
          enabled,
          message: enabled
            ? `${kind === 'alertmeter' ? 'AlertMeter' : 'Mismatch'} schedule enabled. Next run ${next.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.${initialMessage}`
            : `${kind === 'alertmeter' ? 'AlertMeter' : 'Mismatch'} schedule paused.`,
        });
      })
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
