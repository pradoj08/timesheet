(() => {
  'use strict';

  function normalizedText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function findExcelExport() {
    const direct = [...document.querySelectorAll(
      'a,button,input[type="button"],input[type="image"],img,[role="button"],[onclick]',
    )].find((node) => {
      const text = normalizedText([
        node.textContent,
        node.getAttribute('title'),
        node.getAttribute('aria-label'),
        node.getAttribute('alt'),
        node.getAttribute('src'),
      ].filter(Boolean).join(' '));
      return text.includes('export to excel') || text.includes('excel') || text.includes('.xls');
    });
    if (direct) return direct;
    const label = [...document.querySelectorAll('body *')].find((node) =>
      normalizedText([...node.childNodes]
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent)
        .join(' ')) === 'export to excel');
    if (!label) return null;
    let container = label;
    for (let depth = 0; depth < 5 && container; depth += 1, container = container.parentElement) {
      const nearby = [...container.querySelectorAll(
        'a[href],button,input[type="button"],input[type="image"],img,[role="button"],[onclick]',
      )].find((node) => node !== label);
      if (nearby) return nearby;
    }
    return null;
  }

  function isMismatchReport() {
    const pageText = normalizedText(document.body?.innerText);
    const hasHeading = pageText.includes('mismatches');
    const hasEquipmentColumns = [
      'container id',
      'chassis id',
      'eqmt pool',
      'chassis pool',
    ].filter((label) => pageText.includes(label)).length >= 3;
    return hasHeading && hasEquipmentColumns && Boolean(findExcelExport());
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'mori-identify-mismatch-page') {
      sendResponse({ ok: true, isMismatchReport: isMismatchReport() });
      return;
    }
    if (message?.type !== 'mori-run-mismatch-export') return;
    try {
      if (!isMismatchReport()) throw new Error('This tab is not the UP Mismatches equipment report.');
      const exportControl = findExcelExport();
      if (!exportControl) throw new Error('Export to Excel was not found on this page.');
      (exportControl.closest('a,button,input') || exportControl).click();
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
})();
