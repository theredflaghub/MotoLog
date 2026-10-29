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
