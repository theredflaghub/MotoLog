/* MotoLog fixes - load AFTER the main script, just before </body> */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peso = n => '₱' + (n || 0).toFixed(2);
  const localISO = d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const $ = id => document.getElementById(id);

  // 1. Today's date in LOCAL time (old code used UTC, so early-morning entries got yesterday's date)
  window.setupDateInputs = () => {
    const t = localISO(new Date());
    ['log-date', 'fuel-date'].forEach(id => { $(id).value = t; });
  };
  window.setupDateInputs();

  // 2. Monthly chart: correct months (old code skipped months on the 29th-31st and used UTC)
  window.renderChart = (sLogs, fLogs) => {
    const now = new Date(), labels = [], data = [];
    const sum = (arr, key, f) => arr.filter(x => (x.date || '').startsWith(key)).reduce((s, x) => s + f(x), 0);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      labels.push(d.toLocaleString('default', { month: 'short' }));
      data.push(sum(sLogs, key, l => (l.partsCost || 0) + (l.laborCost || 0)) + sum(fLogs, key, f => f.cost || 0));
    }
    if (expenseChartInstance) expenseChartInstance.destroy();
    expenseChartInstance = new Chart($('expenseChart'), {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: '#3b82f6', borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => peso(c.parsed.y) } } },
        scales: { x: { ticks: { color: '#94a3b8', font: { size: 10 } } }, y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 10 } } } }
      }
    });
  };

  // 3. Detail popup now shows everything you logged (notes, parts, labor, liters, price per liter)
  window.openDetailModal = (id, kind) => {
    activeDetailId = id; activeDetailKind = kind;
    const item = allLogs[activeBikeId][kind].find(l => l.id === id);
    if (!item) return;
    const row = (k, v, cls = 'text-white') => `<div class="flex justify-between gap-4"><span class="text-slate-400">${k}:</span><span class="font-bold ${cls} text-right">${v}</span></div>`;
    let rows = row('Date', esc(item.date)) + row('Odometer', item.odo.toLocaleString() + ' km');
    let total;
    if (kind === 'service') {
      total = (item.partsCost || 0) + (item.laborCost || 0);
      rows += row('Parts', peso(item.partsCost)) + row('Labor', peso(item.laborCost)) + (item.isDiy ? row('Type', 'DIY', 'text-emerald-300') : '');
    } else {
      total = item.cost;
      rows += row('Liters', item.liters + ' L') + row('Price / L', item.liters ? peso(item.cost / item.liters) : '--');
    }
    rows += `<div class="border-t border-slate-800 pt-2">${row('Total', peso(total), 'text-brand-400')}</div>`;
    if (item.desc) rows += `<div class="border-t border-slate-800 pt-2 text-slate-300 whitespace-pre-wrap">${esc(item.desc)}</div>`;
    $('detail-title').textContent = kind === 'service' ? item.type : 'Fuel Fill-Up';
    $('detail-body').innerHTML = `<div class="bg-slate-900 p-3 rounded-xl space-y-2">${rows}</div>`;
    $('modal-detail').classList.remove('hidden');
  };

  // 4. LTO badge: shows "Expired" / "Due today" instead of negative days
  const _rd = window.renderDashboard;
  window.renderDashboard = function () {
    _rd();
    const b = bikes.find(x => x.id === activeBikeId);
    if (b && b.ltoDate) {
      const d = Math.ceil((new Date(b.ltoDate + 'T00:00:00') - new Date()) / 864e5);
      $('lto-badge').textContent = d < 0 ? `Expired ${-d}d ago` : d === 0 ? 'Due today' : `${d} Days Left`;
    }
  };

  // 5. Printing the Service History Report (it printed a blank page before)
  const st = document.createElement('style');
  st.textContent = `@media print{
    #app>section,#modal-log,#modal-fuel,#modal-sos,#modal-detail{display:none!important}
    body,#app{background:#fff!important}
    #modal-resale{position:static!important;display:block!important;background:#fff!important;padding:0!important;visibility:visible!important}
    #modal-resale>div{max-height:none!important;overflow:visible!important;background:#fff!important;border:0!important;box-shadow:none!important}
    #modal-resale *{color:#000!important;background:transparent!important;border-color:#bbb!important;visibility:visible!important}
    #modal-resale button{display:none!important}}`;
  document.head.appendChild(st);

  // 6. Backup / restore (phone data lives only in this browser, so back it up)
  const bar = document.createElement('div');
  bar.className = 'max-w-4xl mx-auto w-full px-4 grid grid-cols-2 gap-3';
  const bcls = 'py-3 bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl';
  bar.innerHTML = `<button id="bk-exp" class="${bcls}">Export Backup</button><button id="bk-imp" class="${bcls}">Import Backup</button><input id="bk-file" type="file" accept=".json,application/json" class="hidden">`;
  $('page-dashboard').appendChild(bar);
  $('bk-exp').onclick = () => {
    const blob = new Blob([JSON.stringify({ v: 1, bikes, logs: allLogs, active: activeBikeId })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'motolog-backup-' + localISO(new Date()) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('bk-imp').onclick = () => $('bk-file').click();
  $('bk-file').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then(t => {
      let d; try { d = JSON.parse(t); } catch (_) {}
      if (!d || !Array.isArray(d.bikes) || typeof d.logs !== 'object') { alert('This is not a valid MotoLog backup.'); return; }
      if (!confirm('Replace ALL current data with this backup?')) return;
      localStorage.setItem('motolog_garage_bikes', JSON.stringify(d.bikes));
      localStorage.setItem('motolog_garage_logs', JSON.stringify(d.logs));
      localStorage.setItem('motolog_active_bike', d.active || '');
      location.reload();
    });
  };

  // 7. Delete a motorcycle (there was no way to remove one)
  const del = document.createElement('button');
  del.type = 'button'; del.id = 'btn-delete-bike';
  del.className = 'w-full py-2.5 bg-slate-700/40 hover:bg-rose-700 text-slate-300 hover:text-white border border-slate-600 font-bold rounded-xl text-xs hidden';
  del.textContent = 'Delete This Motorcycle Permanently';
  $('btn-reset-db').after(del);
  const _sm = window.showSetupModal;
  window.showSetupModal = (mode, bike) => { _sm(mode, bike); del.classList.toggle('hidden', mode !== 'edit'); };
  del.onclick = () => {
    const id = $('setup-bike-id').value;
    const b = bikes.find(x => x.id === id);
    if (!b || !confirm(`Delete ${b.brand} ${b.model} and ALL its logs? This cannot be undone.`)) return;
    bikes = bikes.filter(x => x.id !== id);
    delete allLogs[id];
    activeBikeId = bikes.length ? bikes[0].id : null;
    localStorage.setItem('motolog_garage_bikes', JSON.stringify(bikes));
    localStorage.setItem('motolog_garage_logs', JSON.stringify(allLogs));
    localStorage.setItem('motolog_active_bike', activeBikeId || '');
    showPage(bikes.length ? 'page-dashboard' : 'page-install');
    renderDashboard();
  };

  // 8. Small extras
  ['Tire Replacement', 'Other'].forEach(v => $('filter-type').add(new Option(v, v)));   // missing filter options
  const vp = document.querySelector('meta[name=viewport]');
  if (vp) vp.content = 'width=device-width, initial-scale=1.0';                          // allow pinch-zoom
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();       // ask browser not to wipe data
  document.addEventListener('DOMContentLoaded', () => {                                 // installed app: skip the install page
    if (matchMedia('(display-mode: standalone)').matches && !bikes.length) showSetupModal('add');
  });
  document.querySelectorAll('.fixed').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); })); // tap outside to close
})();
