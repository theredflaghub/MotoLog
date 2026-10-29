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
/* MotoLog fixes2.js - load AFTER fixes.js, just before </body> */
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peso = n => '₱' + (n || 0).toFixed(2);
  const store = () => { try { return JSON.parse(localStorage.getItem('motolog_items')) || {}; } catch (_) { return {}; } };
  const save = () => localStorage.setItem('motolog_garage_logs', JSON.stringify(allLogs));
  const DEF = [['Air Filter', 12000, 12], ['Spark Plug', 10000, 12], ['Brake Fluid', 20000, 24], ['Coolant', 24000, 24], ['Tire Replacement', 15000, 36]]; // [name, km, months]
  const NAME = { 'Change Oil': 'Engine oil', 'Chain Maintenance': 'Chain clean & lube' };
  const inp = 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white';
  const curOdo = () => {
    const b = bikes.find(x => x.id === activeBikeId);
    if (!b) return 0;
    const g = allLogs[b.id] || { service: [], fuel: [] };
    return Math.max(b.initialOdo, ...g.service.map(l => l.odo), ...g.fuel.map(l => l.odo));
  };

  // ---- New categories + shop field + full-tank checkbox ----
  ['Air Filter', 'Spark Plug', 'Brake Fluid', 'Coolant', 'Battery', 'Insurance', 'Parking / Toll', 'Accessories', 'Traffic Ticket']
    .forEach(v => { $('log-type').add(new Option(v, v)); $('filter-type').add(new Option(v, v)); });
  $('log-desc').parentElement.insertAdjacentHTML('beforebegin', `<div><label class="block text-slate-400 mb-1">Shop / Mechanic</label><input type="text" id="log-shop" placeholder="Optional" class="${inp}"></div>`);
  $('form-add-fuel').querySelector('[type=submit]').insertAdjacentHTML('beforebegin', `<div class="flex items-center gap-2"><input type="checkbox" id="fuel-full" checked class="rounded bg-slate-900 border-slate-700 text-amber-500"><label for="fuel-full" class="text-slate-300">Full tank (needed for accurate km/L)</label></div>`);

  // ---- Per-bike intervals for the extra service items (inside the bike setup form) ----
  $('form-bike-setup').querySelector('.pt-2').insertAdjacentHTML('beforebegin', `<div class="border-t border-slate-700/80 pt-3 space-y-2">
    <h4 class="font-bold text-slate-200 uppercase tracking-wider text-[10px]">More Service Items (every km / months, 0 = no limit)</h4>
    ${DEF.map(([t], i) => `<div class="grid grid-cols-[1fr_5rem_4rem] gap-2 items-center"><span class="text-slate-300">${t}</span><input type="number" min="0" id="it-km-${i}" class="${inp}"><input type="number" min="0" id="it-mo-${i}" class="${inp}"></div>`).join('')}</div>`);
  const _sm = window.showSetupModal;
  window.showSetupModal = (mode, bike) => {
    _sm(mode, bike);
    const st = (bike && store()[bike.id]) || {};
    DEF.forEach(([t, km, mo], i) => { $('it-km-' + i).value = st[t]?.km ?? km; $('it-mo-' + i).value = st[t]?.mo ?? mo; });
  };
  $('form-bike-setup').addEventListener('submit', () => {
    const id = $('setup-bike-id').value || activeBikeId, s = store();
    s[id] = {};
    DEF.forEach(([t, km], i) => { s[id][t] = { km: +$('it-km-' + i).value || km, mo: Math.max(0, +$('it-mo-' + i).value || 0) }; });
    localStorage.setItem('motolog_items', JSON.stringify(s));
    renderDashboard();
  });

  // ---- Add + Edit entries (this handler replaces the original save handlers) ----
  let editing = null;
  const sb = f => $(f).querySelector('[type=submit]');
  const v = id => $(id).value;
  function commit(kind, rec, modal, form) {
    const arr = allLogs[activeBikeId][kind];
    if (editing) {
      const it = arr.find(x => x.id === editing.id);
      if (it) Object.assign(it, rec);
    } else {
      if (rec.odo < curOdo() && !confirm(`That odometer (${rec.odo.toLocaleString()} km) is lower than your current ${curOdo().toLocaleString()} km. Save anyway?`)) return;
      arr.push({ id: (kind === 'service' ? 's_' : 'f_') + Date.now(), ...rec });
    }
    editing = null; save();
    $(modal).classList.add('hidden'); $(form).reset(); setupDateInputs(); renderDashboard();
  }
  $('form-add-log').addEventListener('submit', e => {
    e.preventDefault(); e.stopImmediatePropagation();
    commit('service', { date: v('log-date'), type: v('log-type'), odo: parseFloat(v('log-odo')) || 0, partsCost: parseFloat(v('log-parts-cost')) || 0, laborCost: parseFloat(v('log-labor-cost')) || 0, isDiy: $('log-is-diy').checked, desc: v('log-desc').trim(), shop: v('log-shop').trim() }, 'modal-log', 'form-add-log');
  });
  $('form-add-fuel').addEventListener('submit', e => {
    e.preventDefault(); e.stopImmediatePropagation();
    commit('fuel', { date: v('fuel-date'), odo: parseFloat(v('fuel-odo')) || 0, liters: parseFloat(v('fuel-liters')) || 0, cost: parseFloat(v('fuel-cost')) || 0, full: $('fuel-full').checked }, 'modal-fuel', 'form-add-fuel');
  });
  [['btn-open-log-modal', 'form-add-log', 'Save Service Log'], ['btn-open-fuel-modal', 'form-add-fuel', 'Save Fuel Log']].forEach(([b, f, t]) =>
    $(b).addEventListener('click', () => { editing = null; $(f).reset(); setupDateInputs(); sb(f).textContent = t; }));

  const eb = document.createElement('button');
  eb.id = 'btn-edit-detail'; eb.textContent = 'Edit Entry';
  eb.className = 'w-full py-2.5 bg-brand-600/20 hover:bg-brand-600 text-brand-300 hover:text-white font-bold rounded-xl text-xs';
  $('btn-delete-detail').before(eb);
  eb.onclick = () => {
    const kind = activeDetailKind, it = allLogs[activeBikeId][kind].find(x => x.id === activeDetailId);
    if (!it) return;
    const set = (id, val) => { $(id).value = val ?? ''; };
    editing = { id: it.id };
    $('modal-detail').classList.add('hidden');
    if (kind === 'service') {
      set('log-date', it.date); set('log-type', it.type); set('log-odo', it.odo); set('log-parts-cost', it.partsCost || ''); set('log-labor-cost', it.laborCost || '');
      $('log-is-diy').checked = !!it.isDiy; set('log-desc', it.desc); set('log-shop', it.shop);
      sb('form-add-log').textContent = 'Save Changes'; $('modal-log').classList.remove('hidden');
    } else {
      set('fuel-date', it.date); set('fuel-odo', it.odo); set('fuel-liters', it.liters); set('fuel-cost', it.cost);
      $('fuel-full').checked = it.full !== false;
      sb('form-add-fuel').textContent = 'Save Changes'; $('modal-fuel').classList.remove('hidden');
    }
  };
  const _od = window.openDetailModal;
  window.openDetailModal = (id, kind) => {
    _od(id, kind);
    const it = allLogs[activeBikeId][kind].find(x => x.id === id), box = $('detail-body').firstElementChild;
    if (!it || !box) return;
    const row = (k, val) => `<div class="flex justify-between gap-4"><span class="text-slate-400">${k}:</span><span class="font-bold text-white text-right">${val}</span></div>`;
    if (it.shop) box.insertAdjacentHTML('afterbegin', row('Shop', esc(it.shop)));
    if (kind === 'fuel') box.insertAdjacentHTML('afterbegin', row('Tank', it.full === false ? 'Partial fill' : 'Full tank'));
  };

  // ---- Dashboard: attention card, extra gauges, accurate km/L, DIY rate ----
  const mg = document.createElement('div');
  mg.className = 'space-y-4';
  $('gauge-chain-bar').closest('.space-y-4').appendChild(mg);
  const att = document.createElement('div');
  att.className = 'bg-slate-800/70 border border-amber-500/40 rounded-2xl p-4 space-y-2 hidden';
  $('btn-fetch-weather').closest('.rounded-2xl').before(att);
  $('metric-diy-saved').parentElement.style.cursor = 'pointer';
  $('metric-diy-saved').parentElement.onclick = () => {
    const n = parseFloat(prompt('Typical shop labor cost per job (₱):', localStorage.getItem('motolog_diy') || 250));
    if (n >= 0) { localStorage.setItem('motolog_diy', n); renderDashboard(); }
  };

  function extras() {
    const b = bikes.find(x => x.id === activeBikeId);
    if (!b) return;
    const g = allLogs[b.id] || { service: [], fuel: [] }, odo = curOdo(), st = store()[b.id] || {};
    const stat = (t, km, mo) => {
      const L = g.service.filter(l => l.type === t).sort((a, c) => c.odo - a.odo)[0];
      const used = Math.max(0, odo - (L ? L.odo : b.initialOdo));
      const m = L ? (Date.now() - new Date(L.date + 'T00:00:00')) / 2.63e9 : 0;
      return { t, km, mo, used, m, r: Math.max(used / (km || 1), mo && L ? m / mo : 0) };
    };
    const base = [stat('Change Oil', b.oilInterval || 3000, 6), stat('Chain Maintenance', b.chainInterval || 500, 0)];
    const more = DEF.map(([t, km, mo]) => stat(t, st[t]?.km || km, st[t] ? st[t].mo : mo));
    const col = r => r >= 1 ? 'bg-rose-500' : r >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500';
    mg.innerHTML = more.map(i => `<div><div class="flex justify-between text-xs mb-1"><span class="text-slate-300 font-semibold">${i.t}</span><span class="${i.r >= 1 ? 'text-rose-400 font-bold' : 'text-slate-400'}">${i.used.toLocaleString()} / ${i.km.toLocaleString()} km${i.mo ? ' · ' + Math.floor(i.m) + '/' + i.mo + ' mo' : ''}</span></div><div class="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-700/50"><div class="${col(i.r)} h-2.5 rounded-full transition-all" style="width:${Math.min(100, i.r * 100)}%"></div></div></div>`).join('');

    const line = (dot, txt) => `<div class="flex items-center gap-2 text-xs"><span class="w-2 h-2 rounded-full shrink-0 ${dot}"></span><span class="text-slate-200">${txt}</span></div>`;
    let rows = [...base, ...more].filter(i => i.r >= 0.9).sort((a, c) => c.r - a.r)
      .map(i => line(i.r >= 1 ? 'bg-rose-500' : 'bg-amber-500', `${NAME[i.t] || i.t}: ${i.r >= 1 ? 'overdue' : 'due soon'} <span class="text-slate-400">(${i.mo && i.m / i.mo > i.used / (i.km || 1) ? Math.floor(i.m) + ' / ' + i.mo + ' months' : i.used.toLocaleString() + ' / ' + i.km.toLocaleString() + ' km'})</span>`));
    if (b.ltoDate) {
      const d = Math.ceil((new Date(b.ltoDate + 'T00:00:00') - new Date()) / 864e5);
      if (d <= 30) rows.unshift(line(d < 0 ? 'bg-rose-500' : 'bg-amber-500', `LTO registration: ${d < 0 ? 'expired' : 'due in ' + d + ' days'}`));
    }
    att.classList.toggle('hidden', !rows.length);
    att.innerHTML = rows.length ? `<h3 class="text-xs font-bold text-amber-300 uppercase tracking-wider">Needs attention</h3>${rows.join('')}` : '';

    // km/L only between full-tank fill-ups (older entries count as full)
    let d = 0, l = 0, a = null, acc = 0;
    [...g.fuel].sort((x, y) => x.odo - y.odo).forEach(x => {
      if (a) acc += x.liters;
      if (x.full !== false) { if (a) { d += x.odo - a.odo; l += acc; } a = x; acc = 0; }
    });
    $('metric-avg-fuel').textContent = d > 0 && l > 0 ? (d / l).toFixed(1) + ' km/L' : '-- km/L';
    $('metric-diy-saved').textContent = peso(g.service.filter(x => x.isDiy).length * (parseFloat(localStorage.getItem('motolog_diy')) || 250));
  }
  const _rd = window.renderDashboard;
  window.renderDashboard = function () { _rd(); extras(); };

  // ---- Resale report: fills the missing odometer, adds shop names, newest first ----
  $('btn-open-resale').addEventListener('click', () => setTimeout(() => {
    const s = [...allLogs[activeBikeId].service].sort((a, c) => c.date.localeCompare(a.date));
    $('report-odo').textContent = curOdo().toLocaleString() + ' km';
    $('report-log-list').innerHTML = s.map(x => `<div class="p-2 bg-slate-900 border border-slate-700 rounded text-slate-200 flex justify-between gap-2"><div><span class="font-bold text-brand-300">${esc(x.date)}</span> - <strong>${esc(x.type)}</strong> (${x.odo.toLocaleString()} km)${x.shop ? ' · ' + esc(x.shop) : ''}${x.isDiy ? ' · DIY' : ''}</div><div class="font-bold">${peso((x.partsCost || 0) + (x.laborCost || 0))}</div></div>`).join('') || '<div class="text-slate-500">No records found.</div>';
  }, 0));

  if (bikes.length) renderDashboard();
})();
/* MotoLog fixes3.js - load AFTER fixes.js and fixes2.js, just before </body> */
(() => {
  const $ = id => document.getElementById(id);
  const v = id => $(id).value;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peso = n => '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const iso = d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const cost = l => (l.partsCost || 0) + (l.laborCost || 0);
  const OTHER = ['Insurance', 'Parking / Toll', 'Accessories', 'Traffic Ticket'], OILCH = ['Change Oil', 'Chain Maintenance'];
  const GROUPS = ['Fuel', 'Oil & chain', 'Other service', 'Running costs'];
  const grp = l => OTHER.includes(l.type) ? 'Running costs' : OILCH.includes(l.type) ? 'Oil & chain' : 'Other service';
  const logs = () => allLogs[activeBikeId] || { service: [], fuel: [] };
  const docs = () => { try { return JSON.parse(localStorage.getItem('motolog_docs')) || {}; } catch (_) { return {}; } };
  const DOCS = [['Driver license', 'lic'], ['Insurance', 'ins'], ['Emission test', 'emi']];
  if (!localStorage.getItem('motolog_first_seen')) localStorage.setItem('motolog_first_seen', Date.now());

  // ---- Home-screen icons (PNG; iPhones need apple-touch-icon) ----
  [['apple-touch-icon', 'apple-touch-icon.png'], ['icon', 'icon-192.png']].forEach(([rel, href]) => {
    const l = document.createElement('link'); l.rel = rel; l.href = href; document.head.appendChild(l);
  });

  // ---- Document expiry dates in the bike setup form ----
  const inp = 'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white';
  $('form-bike-setup').querySelector('.pt-2').insertAdjacentHTML('beforebegin', `<div class="border-t border-slate-700/80 pt-3 space-y-2">
    <h4 class="font-bold text-slate-200 uppercase tracking-wider text-[10px]">Document Expiry Dates</h4>
    ${DOCS.map(([n, k]) => `<div class="grid grid-cols-[1fr_9rem] gap-2 items-center"><label class="text-slate-300" for="doc-${k}">${n}</label><input type="date" id="doc-${k}" class="${inp}"></div>`).join('')}</div>`);
  const _sm = window.showSetupModal;
  window.showSetupModal = (mode, bike) => {
    _sm(mode, bike);
    const D = (bike && docs()[bike.id]) || {};
    DOCS.forEach(([, k]) => { $('doc-' + k).value = D[k] || ''; });
  };
  $('form-bike-setup').addEventListener('submit', () => {
    const id = $('setup-bike-id').value || activeBikeId, s = docs();
    s[id] = {}; DOCS.forEach(([, k]) => { s[id][k] = v('doc-' + k); });
    localStorage.setItem('motolog_docs', JSON.stringify(s));
    renderDashboard();
  });

  // ---- Backup reminder + CSV export ----
  $('bk-exp').addEventListener('click', () => localStorage.setItem('motolog_last_backup', Date.now()));
  const csvBtn = document.createElement('button');
  csvBtn.className = 'col-span-2 py-3 bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl';
  csvBtn.textContent = 'Export Spreadsheet (CSV)';
  $('bk-exp').parentElement.appendChild(csvBtn);
  csvBtn.onclick = () => {
    const b = bikes.find(x => x.id === activeBikeId), g = logs();
    if (!b) return;
    const q = x => { let t = String(x ?? ''); if (/^[=+\-@]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
    const head = ['Type', 'Date', 'Odometer km', 'Category', 'Parts', 'Labor', 'Total', 'Liters', 'Price per L', 'Full tank', 'DIY', 'Shop', 'Notes'];
    const rows = [
      ...g.service.map(l => ['Service', l.date, l.odo, l.type, l.partsCost || 0, l.laborCost || 0, cost(l), '', '', '', l.isDiy ? 'Yes' : 'No', l.shop || '', l.desc || '']),
      ...g.fuel.map(x => ['Fuel', x.date, x.odo, 'Fuel', '', '', x.cost, x.liters, x.liters ? (x.cost / x.liters).toFixed(2) : '', x.full === false ? 'No' : 'Yes', '', '', ''])
    ].sort((a, c) => c[1].localeCompare(a[1]));
    const blob = new Blob(['\ufeff' + [head, ...rows].map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `motolog-${(b.plate || 'bike').replace(/\W+/g, '')}-${iso(new Date())}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ---- Needs-attention card: document expiry + backup reminder ----
  function attn() {
    const b = bikes.find(x => x.id === activeBikeId);
    if (!b) return;
    const line = (dot, t) => `<div class="flex items-center gap-2 text-xs"><span class="w-2 h-2 rounded-full shrink-0 ${dot}"></span><span class="text-slate-200">${t}</span></div>`;
    const D = docs()[b.id] || {}, rows = [];
    DOCS.forEach(([n, k]) => {
      if (!D[k]) return;
      const d = Math.ceil((new Date(D[k] + 'T00:00:00') - new Date()) / 864e5);
      if (d <= 30) rows.push(line(d < 0 ? 'bg-rose-500' : 'bg-amber-500', `${n}: ${d < 0 ? 'expired' : d === 0 ? 'expires today' : 'expires in ' + d + ' days'}`));
    });
    const last = +localStorage.getItem('motolog_last_backup') || +localStorage.getItem('motolog_first_seen');
    if (Date.now() - last > 30 * 864e5) rows.push(line('bg-sky-500', 'Backup: it has been over a month. Tap Export Backup at the bottom.'));
    if (!rows.length) return;
    const card = $('btn-fetch-weather').closest('.rounded-2xl').previousElementSibling;
    if (card.classList.contains('hidden')) { card.classList.remove('hidden'); card.innerHTML = '<h3 class="text-xs font-bold text-amber-300 uppercase tracking-wider">Needs attention</h3>'; }
    card.insertAdjacentHTML('beforeend', rows.join(''));
  }

  // ---- Insights card: charts, monthly summary, yearly report ----
  const box = (id, title) => `<div><div class="text-[11px] text-slate-400 mb-1">${title}</div><div class="h-36"><canvas id="${id}"></canvas></div><p id="${id}-e" class="text-[11px] text-slate-500 hidden">Not enough data yet.</p></div>`;
  const card = document.createElement('div');
  card.className = 'bg-slate-800/70 border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4';
  card.innerHTML = `<h3 class="text-sm font-bold text-white">Insights</h3><p id="ins-month" class="text-xs text-slate-300"></p>
    ${box('ch-kmpl', 'Fuel economy (km/L, between full tanks)')}${box('ch-price', 'Fuel price per liter (₱)')}${box('ch-split', 'Where your money goes')}
    <div class="border-t border-slate-700 pt-3 space-y-2 text-xs"><div class="flex items-center justify-between"><span class="font-bold text-white">Yearly cost report</span><select id="ins-year" class="bg-slate-900 text-white text-xs px-2 py-1 rounded-lg border border-slate-700"></select></div><div id="ins-year-box" class="space-y-1"></div></div>`;
  $('expenseChart').closest('.rounded-2xl').after(card);
  const charts = [], ax = { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1e293b' } };
  let yearSel = String(new Date().getFullYear());
  const draw = (id, type, labels, data, color) => {
    const ok = data.length >= (type === 'doughnut' ? 1 : 2);
    $(id).parentElement.classList.toggle('hidden', !ok); $(id + '-e').classList.toggle('hidden', ok);
    if (!ok) return;
    const doughnut = type === 'doughnut';
    charts.push(new Chart($(id), {
      type, data: { labels, datasets: [{ data, borderColor: color, backgroundColor: doughnut ? ['#f59e0b', '#3b82f6', '#10b981', '#a855f7'] : color, tension: 0.3, pointRadius: 3, borderWidth: doughnut ? 0 : 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: doughnut, position: 'right', labels: { color: '#cbd5e1', font: { size: 10 } } } }, scales: doughnut ? {} : { x: ax, y: ax } }
    }));
  };
  function yearReport(s, f) {
    const all = [...s, ...f], cur = String(new Date().getFullYear());
    const yrs = [...new Set(all.map(l => (l.date || '').slice(0, 4)).filter(Boolean).concat(cur))].sort().reverse();
    if (!yrs.includes(yearSel)) yearSel = cur;
    $('ins-year').innerHTML = yrs.map(y => `<option ${y === yearSel ? 'selected' : ''}>${y}</option>`).join('');
    const ys = s.filter(l => l.date.startsWith(yearSel)), yf = f.filter(x => x.date.startsWith(yearSel));
    const by = Object.fromEntries(GROUPS.map(n => [n, 0]));
    by.Fuel = yf.reduce((t, x) => t + (x.cost || 0), 0);
    ys.forEach(l => { by[grp(l)] += cost(l); });
    const total = GROUPS.reduce((t, n) => t + by[n], 0), odos = [...ys, ...yf].map(l => l.odo);
    const km = odos.length > 1 ? Math.max(...odos) - Math.min(...odos) : 0;
    const months = yearSel === cur ? new Date().getMonth() + 1 : 12;
    const r = (k, val, bold) => `<div class="flex justify-between ${bold ? 'font-bold text-white border-t border-slate-700 pt-1' : 'text-slate-300'}"><span>${k}</span><span>${val}</span></div>`;
    $('ins-year-box').innerHTML = GROUPS.map(n => r(n, peso(by[n]))).join('') + r('Total', peso(total), true) + r('Average per month', peso(total / months)) + r('Distance ridden', km.toLocaleString() + ' km') + r('Cost per km', km > 0 ? peso(total / km) : '--');
  }
  $('ins-year').onchange = e => { yearSel = e.target.value; const g = logs(); yearReport(g.service, g.fuel); };
  function insights() {
    if (!bikes.find(x => x.id === activeBikeId)) return;
    charts.splice(0).forEach(c => c.destroy());
    const { service: s, fuel: f } = logs();
    const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), now = new Date();
    const tot = k => s.filter(l => l.date.startsWith(k)).reduce((t, l) => t + cost(l), 0) + f.filter(x => x.date.startsWith(k)).reduce((t, x) => t + (x.cost || 0), 0);
    const a = tot(key(now)), b = tot(key(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
    $('ins-month').textContent = `This month you spent ${peso(a)}` + (b > 0 ? ` (${a >= b ? 'up' : 'down'} ${Math.abs(Math.round((a - b) / b * 100))}% from last month's ${peso(b)}).` : '.');
    const seg = []; let p = null, acc = 0;
    [...f].sort((x, y) => x.odo - y.odo).forEach(x => {
      if (p) acc += x.liters;
      if (x.full !== false) { if (p && acc > 0) seg.push([x.date, +((x.odo - p.odo) / acc).toFixed(1)]); p = x; acc = 0; }
    });
    draw('ch-kmpl', 'line', seg.map(x => x[0].slice(5)), seg.map(x => x[1]), '#f59e0b');
    const pr = f.filter(x => x.liters > 0).sort((x, y) => x.date.localeCompare(y.date));
    draw('ch-price', 'line', pr.map(x => x.date.slice(5)), pr.map(x => +(x.cost / x.liters).toFixed(2)), '#38bdf8');
    const sums = GROUPS.map(n => n === 'Fuel' ? f.reduce((t, x) => t + (x.cost || 0), 0) : s.filter(l => grp(l) === n).reduce((t, l) => t + cost(l), 0));
    draw('ch-split', 'doughnut', GROUPS, sums.some(x => x > 0) ? sums : [], '#0f172a');
    yearReport(s, f);
  }
  const _rd = window.renderDashboard;
  window.renderDashboard = function () { _rd(); insights(); attn(); };
  if (bikes.length) renderDashboard();
})();
/* MotoLog automatic backups: rolling snapshots, restore, share. Part of motolog-extras.js */
(() => {
  const $ = id => document.getElementById(id);
  const iso = d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const open = () => new Promise((res, rej) => { const r = indexedDB.open('motolog-backups', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction('s', mode), q = fn(t.objectStore('s')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }));
  const dump = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('motolog_')) o[k] = localStorage.getItem(k); } return o; };
  const hasData = o => { try { return JSON.parse(o.motolog_garage_bikes || '[]').length > 0; } catch (_) { return false; } };
  const payload = () => ({ v: 2, bikes, logs: allLogs, active: activeBikeId, ls: dump() });
  const fname = () => 'motolog-backup-' + iso(new Date()) + '.json';
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const apply = d => {
    Object.keys(localStorage).filter(k => k.startsWith('motolog_')).forEach(k => localStorage.removeItem(k));
    if (d.ls) Object.entries(d.ls).forEach(([k, val]) => k.startsWith('motolog_') && localStorage.setItem(k, val));
    else { localStorage.setItem('motolog_garage_bikes', JSON.stringify(d.bikes)); localStorage.setItem('motolog_garage_logs', JSON.stringify(d.logs)); localStorage.setItem('motolog_active_bike', d.active || ''); }
    location.reload();
  };

  // Rolling snapshots in IndexedDB: newest 7 daily copies + newest 5 "before a risky change" copies
  async function snap(key) {
    const o = dump();
    if (!hasData(o)) return;
    await run('readwrite', s => s.put(JSON.stringify(o), key));
    const keys = await run('readonly', s => s.getAllKeys());
    const old = ['day-', 'pre-'].flatMap((p, i) => keys.filter(k => k.startsWith(p)).sort().reverse().slice(i ? 5 : 7));
    if (old.length) await run('readwrite', s => { old.forEach(k => s.delete(k)); });
  }
  const pre = () => snap('pre-' + Date.now()).catch(() => {});
  let timer;
  const _rd = window.renderDashboard;
  window.renderDashboard = function () { _rd(); clearTimeout(timer); timer = setTimeout(() => snap('day-' + iso(new Date())).catch(() => {}), 4000); };
  [['btn-reset-db', 'click'], ['btn-delete-bike', 'click'], ['btn-delete-detail', 'click'], ['bk-file', 'change']]
    .forEach(([id, ev]) => { if ($(id)) $(id).addEventListener(ev, pre, true); });   // capture: copy is taken before the risky action runs

  // Export / import now include everything (intervals, document dates, settings)
  $('bk-exp').onclick = () => download(new Blob([JSON.stringify(payload())], { type: 'application/json' }), fname());
  $('bk-file').onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then(t => {
      let d; try { d = JSON.parse(t); } catch (_) {}
      if (!d || !(d.ls ? hasData(d.ls) : Array.isArray(d.bikes) && typeof d.logs === 'object')) { alert('This is not a valid MotoLog backup.'); return; }
      if (confirm('Replace ALL current data with this backup?')) apply(d);
      e.target.value = '';
    });
  };

  // Buttons: share to Drive / WhatsApp / email, and restore an automatic copy
  const bar = $('bk-exp').parentElement;
  const mk = t => { const b = document.createElement('button'); b.textContent = t; b.className = 'py-3 bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-xl'; bar.appendChild(b); return b; };
  const shareB = mk('Share Backup'), restB = mk('Restore Previous Version');
  const list = document.createElement('div');
  list.className = 'col-span-2 space-y-2 hidden';
  bar.appendChild(list);
  shareB.onclick = async () => {
    const f = new File([JSON.stringify(payload())], fname(), { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: 'MotoLog backup' }); localStorage.setItem('motolog_last_backup', Date.now()); } catch (_) {}
    } else { download(f, f.name); alert('Sharing is not supported on this device, so the backup was downloaded instead.'); }
  };
  restB.onclick = async () => {
    list.classList.toggle('hidden');
    if (list.classList.contains('hidden')) return;
    const keys = ((await run('readonly', s => s.getAllKeys())) || []).sort().reverse();
    list.innerHTML = keys.length ? '' : '<p class="text-xs text-slate-500">No automatic backups yet. One is saved each day you use the app.</p>';
    keys.forEach(k => {
      const b = document.createElement('button');
      b.className = 'w-full py-2.5 bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl';
      b.textContent = k.startsWith('day-') ? 'Daily backup: ' + k.slice(4) : 'Before a change: ' + new Date(+k.slice(4)).toLocaleString();
      b.onclick = async () => {
        const raw = await run('readonly', s => s.get(k));
        if (!raw || !confirm('Restore this version? Your current data will be replaced (a safety copy is kept).')) return;
        await snap('pre-' + Date.now());
        apply({ ls: JSON.parse(raw) });
      };
      list.appendChild(b);
    });
  };

  // If the phone wiped the app's data but a snapshot survived, offer to bring it back
  if (!hasData(dump())) {
    run('readonly', s => s.getAllKeys()).then(async keys => {
      const k = (keys || []).filter(x => x.startsWith('day-')).sort().pop();
      if (!k) return;
      const raw = await run('readonly', s => s.get(k));
      if (raw && hasData(JSON.parse(raw)) && confirm(`Your garage looks empty, but an automatic backup from ${k.slice(4)} was found. Restore it?`)) apply({ ls: JSON.parse(raw) });
    }).catch(() => {});
  }
})();
