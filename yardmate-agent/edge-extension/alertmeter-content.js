(() => {
  if (window.__moriAlertMeterContentReady) return;
  window.__moriAlertMeterContentReady = true;

  function smallestMatchingElement(pattern) {
    return [...document.querySelectorAll('body *')]
      .filter((element) => pattern.test(String(element.textContent || '').trim()))
      .sort((left, right) => left.children.length - right.children.length)[0] || null;
  }

  function readDashboard() {
    const participationElement = smallestMatchingElement(/Employees Reporting In[\s\S]*?(\d+(?:\.\d+)?)%\s*Participation/i);
    const participationText = String(participationElement?.textContent || '').replace(/\s+/g, ' ').trim();
    const participationMatch = participationText.match(/(\d+(?:\.\d+)?)%\s*Participation/i);
    const heading = smallestMatchingElement(/Last Test Results Collected for employees on shift in the past 24 hours/i);
    const headingRect = heading?.getBoundingClientRect();
    const top = Math.max(0, Math.floor((headingRect?.top ?? 0) - 12));
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
    if (message?.type !== 'mori-read-alertmeter-dashboard') return;
    sendResponse(readDashboard());
  });
})();
