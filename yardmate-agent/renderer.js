const fields = {
  enabled: document.getElementById('enabled'),
  downloadFolder: document.getElementById('downloadFolder'),
  appToken: document.getElementById('appToken'),
  userKey: document.getElementById('userKey'),
};
const result = document.getElementById('result');

function render(state) {
  fields.enabled.checked = state.settings.enabled;
  fields.downloadFolder.value = state.settings.downloadFolder;
  fields.appToken.value = state.settings.hasAppToken ? '••••••••••••••••••••••••••••••' : '';
  fields.userKey.value = state.settings.hasUserKey ? '••••••••••••••••••••••••••••••' : '';
  const badge = document.getElementById('watchBadge');
  badge.textContent = state.settings.enabled ? 'WATCHING' : 'OFF';
  badge.classList.toggle('on', state.settings.enabled);
  document.getElementById('lastStatus').textContent = state.lastMessage || 'Ready';
}

async function save() {
  const patch = {
    enabled: fields.enabled.checked,
    downloadFolder: fields.downloadFolder.value,
  };
  if (!fields.appToken.value.startsWith('••')) patch.appToken = fields.appToken.value.trim();
  if (!fields.userKey.value.startsWith('••')) patch.userKey = fields.userKey.value.trim();
  const state = await window.yardmateAgent.saveSettings(patch);
  render(state);
  result.textContent = 'Settings saved.';
}

document.getElementById('save').addEventListener('click', () => void save());
document.getElementById('test').addEventListener('click', async () => {
  result.textContent = 'Sending test alert…';
  await save();
  const response = await window.yardmateAgent.testPush();
  result.textContent = response.ok ? 'Test alert sent.' : response.error;
});
document.getElementById('chooseFolder').addEventListener('click', async () => {
  const folder = await window.yardmateAgent.chooseDownloadFolder();
  if (folder) fields.downloadFolder.value = folder;
});
window.yardmateAgent.onState(render);
window.yardmateAgent.getState().then(render);
