(() => {
  if (window.__moriAlertMeterContentReady) return;
  window.__moriAlertMeterContentReady = true;

  function smallestMatchingElement(pattern) {
    return [...document.querySelectorAll('body *')]
      .filter((element) => pattern.test(String(element.textContent || '').trim()))
      .sort((left, right) => left.children.length - right.children.length)[0] || null;
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function employeeTable() {
    return [...document.querySelectorAll('table')].find((table) => {
      const headings = [...table.querySelectorAll('th')].map((cell) => String(cell.textContent || '').trim());
      return headings.some((heading) => /^Employee$/i.test(heading))
        && headings.some((heading) => /^Test\s*Time$/i.test(heading));
    }) || null;
  }

  function employeeColumnIndex(table) {
    return [...table.querySelectorAll('thead th, tr:first-child th')]
      .findIndex((cell) => /^Employee$/i.test(String(cell.textContent || '').trim()));
  }

  function filteredEmployeeNames() {
    const table = employeeTable();
    if (!table) return [];
    const employeeIndex = employeeColumnIndex(table);
    if (employeeIndex < 0) return [];
    return [...table.querySelectorAll('tbody tr')]
      .filter((row) => row.offsetParent !== null)
      .map((row) => String(row.cells[employeeIndex]?.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  function visibleEmployeeRowCount() {
    return [...(employeeTable()?.querySelectorAll('tbody tr') || [])]
      .filter((row) => row.offsetParent !== null).length;
  }

  function clickNoTestTakenText() {
    const optionPattern = /(?:no|not)\s+test\s+taken/i;
    const label = [...document.querySelectorAll('svg text, svg tspan, .highcharts-legend-item, body *')]
      .filter((element) => {
        const value = String(element.textContent || '').replace(/\s+/g, ' ').trim();
        const rect = element.getBoundingClientRect();
        return optionPattern.test(value) && rect.width > 0 && rect.height > 0;
      })
      .sort((left, right) => left.children.length - right.children.length)[0];
    const target = label?.closest('.highcharts-legend-item, .highcharts-point') || label;
    if (!target) return false;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const EventType = type.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
      target.dispatchEvent(new EventType(type, { bubbles: true, cancelable: true, view: window }));
    }
    return true;
  }

  function chooseNoTestTakenSelect() {
    const optionPattern = /(?:no|not)\s+test\s+taken/i;
    for (const select of document.querySelectorAll('select')) {
      const option = [...select.options].find((candidate) => optionPattern.test(String(candidate.textContent || '')));
      if (!option) continue;
      select.value = option.value;
      option.selected = true;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  async function waitForEmployeeTableChange(previousCount, timeout = 3500) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      await wait(150);
      const currentCount = visibleEmployeeRowCount();
      if (currentCount > 0 && currentCount !== previousCount) return true;
    }
    return false;
  }

  async function prepareDashboard() {
    const initial = readDashboard();
    if (!initial.ok || !Number.isFinite(initial.participation)) {
      return initial;
    }
    if (initial.participation >= 100) {
      const heading = smallestMatchingElement(/Last Test Results Collected for employees on shift in the past 24 hours/i);
      const participation = smallestMatchingElement(/Employees Reporting In[\s\S]*?(\d+(?:\.\d+)?)%\s*Participation/i);
      const target = heading || participation;
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'start', inline: 'nearest' });
        await wait(350);
      }
      return readDashboard();
    }
    const previousRowCount = visibleEmployeeRowCount();
    let filterApplied = clickNoTestTakenText();
    let tableChanged = filterApplied
      ? await waitForEmployeeTableChange(previousRowCount)
      : false;
    if (!tableChanged && chooseNoTestTakenSelect()) {
      filterApplied = true;
      tableChanged = await waitForEmployeeTableChange(previousRowCount);
    }
    if (!tableChanged) {
      throw new Error('Mori clicked No Test Taken, but the employee table did not filter. The snapshot was not sent.');
    }
    await wait(300);
    const result = readDashboard();
    const table = employeeTable();
    const tableRect = table?.getBoundingClientRect();
    if (tableRect && tableRect.bottom > result.crop.top) {
      result.crop.height = Math.max(
        result.crop.height,
        Math.min(window.innerHeight - result.crop.top, Math.ceil(tableRect.bottom - result.crop.top + 16)),
      );
    }
    result.noTestTakenFilterApplied = filterApplied;
    result.noTestTakenTableFiltered = tableChanged;
    result.missingEmployees = filteredEmployeeNames();
    return result;
  }

  function readDashboard() {
    const participationElement = smallestMatchingElement(/Employees Reporting In[\s\S]*?(\d+(?:\.\d+)?)%\s*Participation/i);
    const participationText = String(participationElement?.textContent || '').replace(/\s+/g, ' ').trim();
    const participationMatch = participationText.match(/(\d+(?:\.\d+)?)%\s*Participation/i);
    const heading = smallestMatchingElement(/Last Test Results Collected for employees on shift in the past 24 hours/i);
    const headingRect = heading?.getBoundingClientRect();
    const top = Math.max(0, Math.min(window.innerHeight - 1, Math.floor((headingRect?.top ?? 0) - 12)));
    return {
      ok: Boolean(participationMatch && heading),
      participation: participationMatch ? Number(participationMatch[1]) : null,
      participationText,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      crop: {
        left: 0,
        top,
        width: Math.max(1, Math.floor(window.innerWidth * 0.82)),
        height: Math.max(1, window.innerHeight - top),
      },
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'mori-read-alertmeter-dashboard') {
      sendResponse(readDashboard());
      return;
    }
    if (message?.type === 'mori-prepare-alertmeter-dashboard') {
      prepareDashboard().then(sendResponse).catch((error) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
  });
})();
