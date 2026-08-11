const select = document.getElementById('batch');
const result = document.getElementById('result');
const history = document.getElementById('history');

const badge = (value) => `<b class="${value}">${value.replaceAll('_', ' ')}</b>`;
function renderHistory(runs) {
  history.innerHTML = runs.length ? runs.map(run => `<div class="audit-row"><span>${run.created_at}</span><b>${run.batch}</b>${badge(run.decision)}<span>${run.score}/100</span></div>`).join('') : '<p>Pas encore de validation enregistrée.</p>';
}
async function load() {
  const data = await fetch('/api/overview').then(response => response.json());
  document.getElementById('contract').textContent = `${data.contract.name} v${data.contract.version} · owner: ${data.contract.owner}`;
  select.innerHTML = data.batches.map(batch => `<option value="${batch}">${batch}</option>`).join('');
  renderHistory(data.recent);
}
document.getElementById('validate').addEventListener('click', async () => {
  const button = document.getElementById('validate');
  button.disabled = true;
  button.textContent = 'Contrôle en cours…';
  try {
    const data = await fetch('/api/validate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({batch:select.value})}).then(response => response.json());
    const decision = document.getElementById('decision');
    decision.textContent = data.decision.replaceAll('_', ' ');
    document.getElementById('score').textContent = `${data.score}/100 · ${data.rows} lignes`;
    document.querySelector('.decision').className = `decision ${data.decision}`;
    document.getElementById('issues').innerHTML = data.issues.length ? data.issues.map(issue => `<div class="row"><b>${issue.severity}</b><p>${issue.message}<small>${issue.check}</small></p></div>`).join('') : '<div class="row"><b>PASS</b><p>Tous les contrôles définis dans le contrat sont valides.</p></div>';
    document.getElementById('impact').innerHTML = data.impact.map(asset => `<div class="row"><b>${asset.action}</b><p>${asset.asset}<small>${asset.tier} · ${asset.reason}</small></p></div>`).join('');
    result.hidden = false;
    const audit = await fetch('/api/audit').then(response => response.json());
    renderHistory(audit);
  } finally { button.disabled = false; button.innerHTML = 'Valider le lot <b>↗</b>'; }
});
load();
