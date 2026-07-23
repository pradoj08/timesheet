const runButton = document.getElementById('run');
const automatic = document.getElementById('automatic');
const status = document.getElementById('status');

function timeLabel(timestamp) {
  return timestamp ? ` · ${new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '';
}

runButton.addEventListener('click', async () => {
  runButton.disabled = true;
  status.textContent = 'Starting the official Excel export…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'mori-export-now' });
    if (!response?.ok) throw new Error(response?.error || 'The export could not be started.');
    status.textContent = response.message;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    runButton.disabled = false;
  }
});

automatic.addEventListener('change', async () => {
  automatic.disabled = true;
  const response = await chrome.runtime.sendMessage({ type: 'mori-set-automatic', enabled: automatic.checked });
  automatic.disabled = false;
  if (!response?.ok) {
    automatic.checked = !automatic.checked;
    status.textContent = response?.error || 'Could not update the schedule.';
    return;
  }
  status.textContent = automatic.checked
    ? 'Automatic export enabled. Next run is in 15 minutes.'
    : 'Automatic export paused.';
});

chrome.runtime.sendMessage({ type: 'mori-get-settings' }).then((saved) => {
  automatic.checked = Boolean(saved?.automaticEnabled);
  status.textContent = saved?.lastStatus
    ? `${saved.lastStatus}${timeLabel(saved.lastStatusAt)}`
    : 'Ready. Run a manual export or enable the 15-minute schedule.';
});
