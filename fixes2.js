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
      .map(i => line(i.r >= 1 ? 'bg-rose-500' : 'bg-amber-500', `${NAME[i.t] || i.t}: ${i.r >= 1 ? 'overdue' : 'due soon'} <span class="text-slate-400">(${i.used.toLocaleString()} / ${i.km.toLocaleString()} km)</span>`));
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
