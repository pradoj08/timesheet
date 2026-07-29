const runButton = document.getElementById('run');
const alertMeterButton = document.getElementById('alertMeter');
const yardCheckButton = document.getElementById('yardCheck');
const visionButton = document.getElementById('vision');
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

yardCheckButton.addEventListener('click', async () => {
  yardCheckButton.disabled = true;
  status.textContent = 'Refreshing UP Yard Check, applying B 372 filters, and preparing the snapshot…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'mori-push-yardcheck' });
    if (!response?.ok) throw new Error(response?.error || 'The Yard Check snapshot could not be sent.');
    status.textContent = response.message;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    yardCheckButton.disabled = false;
  }
});

visionButton.addEventListener('click', async () => {
  visionButton.disabled = true;
  status.textContent = 'Capturing and sending UP Vision B 372…';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'mori-capture-vision' });
    if (!response?.ok) throw new Error(response?.error || 'The Vision snapshot could not be captured.');
    status.textContent = response.message;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    visionButton.disabled = false;
  }
});

chrome.runtime.sendMessage({ type: 'mori-get-settings' }).then((saved) => {
  status.textContent = saved?.lastStatus
    ? `${saved.lastStatus}${timeLabel(saved.lastStatusAt)}`
    : 'Ready. Use either manual alert or enable its schedule.';
});
