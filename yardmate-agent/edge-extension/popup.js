const runButton = document.getElementById('run');
const alertMeterButton = document.getElementById('alertMeter');
const mismatchSchedule = document.getElementById('mismatchSchedule');
const alertMeterSchedule = document.getElementById('alertMeterSchedule');
const status = document.getElementById('status');
document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;

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

alertMeterButton.addEventListener('click', async () => {
  alertMeterButton.disabled = true;
  status.textContent = 'Refreshing AlertMeter and preparing the snapshot…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'mori-push-alertmeter' });
    if (!response?.ok) throw new Error(response?.error || 'The AlertMeter snapshot could not be sent.');
    status.textContent = response.message;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    alertMeterButton.disabled = false;
  }
});

async function updateSchedule(kind, control) {
  control.disabled = true;
  status.textContent = control.checked && kind === 'mismatch'
    ? 'Enabling schedule and running the first verified mismatch refresh…'
    : 'Updating schedule…';
  if (kind === 'alertmeter' && control.checked) {
    const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
    if (!granted) {
      control.checked = false;
      control.disabled = false;
      status.textContent = 'AlertMeter scheduling needs permission to capture its tab automatically.';
      return;
    }
  }
  const response = await chrome.runtime.sendMessage({ type: 'mori-set-schedule', kind, enabled: control.checked });
  control.disabled = false;
  if (!response?.ok) {
    control.checked = !control.checked;
    status.textContent = response?.error || 'Could not update the schedule.';
    return;
  }
  status.textContent = response.message;
}

mismatchSchedule.addEventListener('change', () => updateSchedule('mismatch', mismatchSchedule));
alertMeterSchedule.addEventListener('change', () => updateSchedule('alertmeter', alertMeterSchedule));

chrome.runtime.sendMessage({ type: 'mori-get-settings' }).then((saved) => {
  mismatchSchedule.checked = Boolean(saved?.mismatchScheduleEnabled);
  alertMeterSchedule.checked = Boolean(saved?.alertMeterScheduleEnabled);
  status.textContent = saved?.lastStatus
    ? `${saved.lastStatus}${timeLabel(saved.lastStatusAt)}`
    : 'Ready. Use either manual alert or enable its schedule.';
});
