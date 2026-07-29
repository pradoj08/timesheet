(() => {
  'use strict';

  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = (node) => {
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const textOf = (node) => normalize([
    node?.textContent,
    node?.getAttribute?.('aria-label'),
    node?.getAttribute?.('title'),
    node?.getAttribute?.('placeholder'),
    node?.getAttribute?.('name'),
    node?.id,
  ].filter(Boolean).join(' '));
  const controls = () => [...document.querySelectorAll('input,select,textarea,button,[role="button"],[role="checkbox"]')].filter(visible);
  const setValue = (control, value) => {
    const prototype = control instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : null;
    const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(control, value);
    else control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const nearestControl = (label, selector) => {
    const forId = label?.getAttribute?.('for');
    if (forId) {
      const linked = document.getElementById(forId);
      if (linked?.matches(selector) && visible(linked)) return linked;
    }
    let container = label;
    for (let depth = 0; depth < 5 && container; depth += 1, container = container.parentElement) {
      const match = [...container.querySelectorAll(selector)].find(visible);
      if (match) return match;
    }
    return null;
  };
  const nearestVisibleControl = (label, selector) => {
    if (!label) return null;
    const labelRect = label.getBoundingClientRect();
    return [...document.querySelectorAll(selector)].filter(visible).map((control) => {
      const rect = control.getBoundingClientRect();
      const verticalDistance = Math.abs((rect.top + rect.height / 2) - (labelRect.top + labelRect.height / 2));
      const horizontalDistance = Math.abs(rect.left - labelRect.right);
      return { control, score: verticalDistance * 6 + horizontalDistance };
    }).sort((left, right) => left.score - right.score)[0]?.control || null;
  };
  const findLabel = (terms) => [...document.querySelectorAll('label,legend,th,td,span,div,p')]
    .filter((node) => {
      const text = textOf(node);
      return visible(node) && terms.every((term) => text.includes(term));
    })
    .sort((left, right) => textOf(left).length - textOf(right).length)[0] || null;
  const chooseYardInput = () => {
    const direct = controls().find((node) => node.matches('input[type="text"],input:not([type]),textarea')
      && (textOf(node).includes('yard') || textOf(node).includes('location')));
    if (direct) return direct;
    const label = findLabel(['yard']);
    return nearestControl(label, 'input[type="text"],input:not([type]),textarea');
  };
  const setCheckbox = (labelText, shouldCheck) => {
    const candidates = [...document.querySelectorAll('label,[role="checkbox"],input[type="checkbox"]')].filter(visible);
    const label = candidates.find((node) => textOf(node) === labelText)
      || candidates.find((node) => textOf(node).includes(labelText));
    if (!label) return false;
    let checkbox = label.matches('input[type="checkbox"],[role="checkbox"]') ? label : null;
    const forId = label.getAttribute?.('for');
    if (!checkbox && forId) {
      const linked = document.getElementById(forId);
      if (linked?.matches('input[type="checkbox"],[role="checkbox"]') && visible(linked)) checkbox = linked;
    }
    if (!checkbox) checkbox = [...label.querySelectorAll('input[type="checkbox"],[role="checkbox"]')].find(visible) || null;
    if (!checkbox) checkbox = nearestVisibleControl(label, 'input[type="checkbox"],[role="checkbox"]');
    if (!checkbox) return false;
    const checked = checkbox.matches('input') ? checkbox.checked : checkbox.getAttribute('aria-checked') === 'true';
    if (checked !== shouldCheck) checkbox.click();
    const updated = checkbox.matches('input') ? checkbox.checked : checkbox.getAttribute('aria-checked') === 'true';
    return updated === shouldCheck;
  };
  const configureHours = () => {
    const label = findLabel(['during', 'last', 'hours']) || findLabel(['last', 'hours']);
    const hours = nearestVisibleControl(label, 'input[type="number"],input[type="text"],input:not([type])');
    if (hours) setValue(hours, '12');
    return Boolean(hours);
  };
  const findApply = () => controls().find((node) => /^(apply|search|submit|run)$/.test(normalize(node.textContent || node.value || node.getAttribute?.('aria-label'))));
  const waitForControls = async (timeoutMs = 25000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (chooseYardInput() && findApply()) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('The Yard Check controls did not finish loading.');
  };
  const resultsSignature = () => {
    const resultNodes = [...document.querySelectorAll('table,[role="grid"],.ag-root,.grid,.results,.result')].filter(visible);
    const rowCount = document.querySelectorAll('tbody tr,[role="row"],.ag-row').length;
    const text = resultNodes.map((node) => normalize(node.innerText || node.textContent)).join('|');
    return `${rowCount}:${text.length}:${text.slice(-600)}`;
  };
  const pageIsBusy = () => [...document.querySelectorAll(
    '[aria-busy="true"],.spinner,.loading,.loader,.progress,.progress-bar,mat-spinner,mat-progress-spinner'
  )].some((node) => visible(node));
  const waitForStableResults = async (timeoutMs = 35000) => {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    let previous = '';
    let stableSamples = 0;
    while (Date.now() < deadline) {
      const signature = resultsSignature();
      const minimumWaitComplete = Date.now() - startedAt >= 10000;
      if (minimumWaitComplete && !pageIsBusy() && signature && signature === previous) stableSamples += 1;
      else stableSamples = 0;
      if (stableSamples >= 3) return;
      previous = signature;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('The Yard Check results did not finish loading before the screenshot timeout.');
  };
  const resultCrop = () => {
    const pageText = normalize(document.body?.innerText);
    const bounds = [...document.querySelectorAll(
      'table,[role="grid"],.ag-root,.grid,.results,.result,input,button,a,label,legend,th,td,h1,h2,h3,h4,p'
    )]
      .filter(visible)
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight);
    const padding = 8;
    const left = bounds.length ? Math.max(0, Math.min(...bounds.map((rect) => rect.left)) - padding) : 0;
    const top = bounds.length ? Math.max(0, Math.min(...bounds.map((rect) => rect.top)) - padding) : 0;
    const right = bounds.length ? Math.min(innerWidth, Math.max(...bounds.map((rect) => rect.right)) + padding) : innerWidth;
    const bottom = bounds.length ? Math.min(innerHeight, Math.max(...bounds.map((rect) => rect.bottom)) + padding) : innerHeight;
    return {
      pageText,
      crop: {
        left,
        top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
      },
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    };
  };

  async function prepareYardCheck() {
    if (!location.hash.toLowerCase().includes('yardcheck')) {
      throw new Error('The UP Yard Check screen is not open.');
    }
    await waitForControls();
    const yardInput = chooseYardInput();
    if (!yardInput) throw new Error('The Yard field was not found on the Yard Check page.');
    setValue(yardInput, 'B 372');
    const requested = ['container', 'trailer', 'arrivals', 'other movement', 'yard check'];
    const checked = requested.filter((label) => setCheckbox(label, true));
    if (checked.length !== requested.length) {
      throw new Error(`Yard Check filters were incomplete. Found ${checked.length} of ${requested.length}: ${checked.join(', ') || 'none'}.`);
    }
    if (!setCheckbox('chassis', false)) throw new Error('The Chassis checkbox was not found.');
    if (!configureHours()) throw new Error('The "During the last X hours >= " input was not found.');
    const apply = findApply();
    if (!apply) throw new Error('The Apply button was not found.');
    apply.click();
    await waitForStableResults();
    const result = resultCrop();
    return { ok: true, yard: 'B 372', lookbackHours: 12, checked, ...result };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'mori-prepare-yardcheck') return;
    prepareYardCheck().then(sendResponse).catch((error) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
    return true;
  });
})();
