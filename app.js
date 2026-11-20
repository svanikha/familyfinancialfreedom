/* Family Financial Freedom — catatan keuangan keluarga (offline, data di perangkat) */
'use strict';

const KEY = 'fff-data-v1';
const SESSION_KEY = 'fff-user';

// tab = bagian form; type = arah uang (in menambah saldo, out mengurangi)
const GROUPS = {
  utama:     { tab: 'in',    type: 'in',  name: 'Pendapatan Utama',  desc: 'Gaji, usaha utama',          color: 'var(--utama)' },
  sampingan: { tab: 'in',    type: 'in',  name: 'Sampingan',         desc: 'Freelance, jualan, bonus',   color: 'var(--sampingan)' },
  terima:    { tab: 'in',    type: 'in',  name: 'Pemasukan Piutang', desc: 'Pinjaman dikembalikan',      color: 'var(--terima)' },
  wajib:     { tab: 'out',   type: 'out', name: 'Wajib Rutin',       desc: 'Listrik, sekolah, makan',    color: 'var(--wajib)' },
  tidak:     { tab: 'out',   type: 'out', name: 'Tidak Penting',     desc: 'Jajan, hiburan, impulsif',   color: 'var(--tidak)' },
  hutang:    { tab: 'out',   type: 'out', name: 'Bayar Hutang',      desc: 'Cicilan, pinjaman, paylater', color: 'var(--hutang)' },
  tabungan:  { tab: 'alloc', type: 'out', name: 'Tabungan',          desc: 'Dana darurat, pendidikan',   color: 'var(--tabungan)' },
  investasi: { tab: 'alloc', type: 'out', name: 'Investasi',         desc: 'Emas, reksa dana, saham',    color: 'var(--investasi)' },
  piutang:   { tab: 'alloc', type: 'out', name: 'Beri Pinjaman',     desc: 'Uang dipinjamkan ke orang',  color: 'var(--piutang)' },
};
// Pindah dana antar rekening (tarik tunai, setor tunai, top up) — tidak dihitung sebagai pemasukan/pengeluaran
const MOVE = { name: 'Pindah Dana', color: 'var(--move)' };
const FORM_TABS = { in: '＋ Masuk', out: '− Keluar', alloc: 'Simpan', move: '⇄ Pindah' };
const ftabOf = g => g === 'pindah' ? 'move' : GROUPS[g].tab;

const SECTIONS = [
  { key: 'pemasukan',   name: 'Pemasukan',         groups: ['utama', 'sampingan'], type: 'in',  color: 'var(--utama)' },
  { key: 'pengeluaran', name: 'Pengeluaran',       groups: ['wajib', 'tidak'],     type: 'out', color: 'var(--wajib)' },
  { key: 'tabungan',    name: 'Tabungan',          groups: ['tabungan'],           type: 'in',  color: 'var(--tabungan)' },
  { key: 'investasi',   name: 'Investasi',         groups: ['investasi'],          type: 'in',  color: 'var(--investasi)' },
  { key: 'hutang',      name: 'Hutang',            groups: ['hutang'],             type: 'out', color: 'var(--hutang)' },
  { key: 'piutang',     name: 'Piutang',           groups: ['piutang'],            type: 'out', color: 'var(--piutang)' },
  { key: 'terima',      name: 'Pemasukan Piutang', groups: ['terima'],             type: 'in',  color: 'var(--terima)' },
];

const ACC_TYPES = { bank: 'Bank', ewallet: 'E-Wallet', cash: 'Tunai' };
const PROVIDERS = {
  bank: ['BCA', 'BRI', 'BNI', 'Mandiri', 'BSI', 'BTN', 'CIMB Niaga', 'Danamon', 'Permata', 'OCBC', 'Bank Kalteng', 'Bank Jago', 'SeaBank', 'blu by BCA', 'Bank Muamalat'],
  ewallet: ['GoPay', 'OVO', 'DANA', 'ShopeePay', 'LinkAja'],
};
const FEE_CAT = 'Biaya Admin Bank';

const DEFAULT_DATA = () => ({
  tx: [],
  users: [],
  accounts: [],
  members: [],
  payments: ['Cash', 'Transfer', 'QRIS', 'Kartu Debit', 'E-Wallet'],
  categories: {
    utama: ['Gaji', 'Usaha', 'Tunjangan'],
    sampingan: ['Freelance', 'Jualan Online', 'Bonus', 'Hadiah', 'Lainnya'],
    terima: ['Pengembalian Pinjaman'],
    wajib: ['Makan & Dapur', 'Rumah', 'Listrik', 'Air', 'Internet & Pulsa', 'Sekolah Anak', 'Transportasi / BBM', 'Kesehatan', 'Laundry & Kebersihan', 'Zakat & Sedekah', FEE_CAT],
    tidak: ['Jajan & Kopi', 'Makan di Luar', 'Hiburan', 'Belanja Online', 'Skincare', 'Hobi', 'Lainnya'],
    hutang: ['Cicilan Kendaraan', 'Cicilan Rumah', 'Kartu Kredit', 'Paylater', 'Pinjaman Keluarga'],
    tabungan: ['Dana Darurat', 'Tabungan Pendidikan', 'Tabungan Umum'],
    investasi: ['Emas', 'Reksa Dana', 'Saham', 'Deposito'],
    piutang: ['Keluarga', 'Teman'],
  },
  budgets: {},
  recurring: [],
  limitTidak: 0,
  periodStart: 0,
});

/* ---------- Penyimpanan ---------- */
function merge(d) {
  const base = DEFAULT_DATA();
  return {
    ...base, ...d,
    categories: { ...base.categories, ...(d.categories || {}) },
    budgets: d.budgets || {}, users: d.users || [], accounts: d.accounts || [],
  };
}
let data = load();
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return merge(JSON.parse(raw)); } catch (e) { /* abaikan */ }
  return DEFAULT_DATA();
}
function save() {
  if (Cloud.on) return Cloud.commit();
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch (e) { toast('Gagal menyimpan. Memori perangkat penuh?'); }
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- Util ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = n => (n < 0 ? '−Rp ' : 'Rp ') + Math.abs(Math.round(n)).toLocaleString('id-ID');
const num = n => Math.round(n).toLocaleString('id-ID');
const rpShort = n => {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(1).replace('.0', '') + ' M';
  if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace('.0', '') + ' jt';
  if (a >= 1e3) return s + Math.round(a / 1e3) + ' rb';
  return s + String(Math.round(a));
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const parseAmount = s => Number(String(s).replace(/\D/g, '')) || 0;
const fmtInput = s => { const n = parseAmount(s); return n ? n.toLocaleString('id-ID') : ''; };
const bkey = (g, c) => `${g}|${c}`;
const opts = (items, sel, blank) => (blank ? `<option value="">${blank}</option>` : '') + items.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- Akun pengguna ---------- */
let me = null;
const sessGet = () => { try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; } };
const sessSet = v => { try { v ? sessionStorage.setItem(SESSION_KEY, v) : sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ } };
const userName = id => data.users.find(u => u.id === id)?.name || '—';
const memberNames = () => [...new Set([...data.users.map(u => u.name), ...data.members])];

async function hashPin(id, pin) {
  const s = `fff:${id}:${pin}`;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return 'd' + h;
}

/* ---------- Rekening ---------- */
const accById = id => data.accounts.find(a => a.id === id);
const mask = n => n ? '••' + String(n).slice(-4) : '';
function accName(a) {
  if (!a) return 'Rekening terhapus';
  if (a.type === 'cash') return 'Uang Tunai' + (a.label ? ` (${a.label})` : '');
  return [a.bank, mask(a.number), a.label ? `(${a.label})` : ''].filter(Boolean).join(' ');
}
const accFull = a => a ? `${accName(a)} · ${userName(a.userId)}` : 'Rekening terhapus';
function balances() {
  const b = {};
  for (const a of data.accounts) b[a.id] = a.initial || 0;
  for (const t of data.tx) {
    if (t.group === 'pindah') {
      if (t.fromAccount in b) b[t.fromAccount] -= t.amount;
      if (t.toAccount in b) b[t.toAccount] += t.amount;
    } else if (t.accountId in b && GROUPS[t.group]) {
      b[t.accountId] += GROUPS[t.group].type === 'in' ? t.amount : -t.amount;
    }
  }
  return b;
}
function usersOrdered() {
  return [...data.users].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : 0));
}
function accOptions(sel, blank = '— tidak dipilih —') {
  return `<option value="">${blank}</option>` + usersOrdered().map(u => {
    const accs = data.accounts.filter(a => a.userId === u.id);
    if (!accs.length) return '';
    return `<optgroup label="${esc(u.name)}">${accs.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(accName(a))}</option>`).join('')}</optgroup>`;
  }).join('');
}
function defaultAccount() {
  if (me?.lastAccount && accById(me.lastAccount)) return me.lastAccount;
  return data.accounts.find(a => a.userId === me?.id && a.type !== 'cash')?.id || data.accounts.find(a => a.userId === me?.id)?.id || '';
}
// Pilih metode yang cocok dengan jenis rekening
function methodFor(acc, current) {
  if (!acc) return current;
  const find = re => data.payments.find(p => re.test(p));
  if (acc.type === 'cash') return find(/cash|tunai/i) || current;
  if (acc.type === 'ewallet') return find(/qris|wallet/i) || current;
  if (/cash|tunai/i.test(current || '')) return find(/transfer/i) || current;
  return current;
}
function moveLabel(t) {
  const f = accById(t.fromAccount), to = accById(t.toAccount);
  if (to?.type === 'cash' && f?.type !== 'cash') return 'Tarik Tunai';
  if (f?.type === 'cash' && to && to.type !== 'cash') return 'Setor Tunai';
  if (to?.type === 'ewallet') return 'Top Up E-Wallet';
  return 'Transfer Antar Rekening';
}

/* ---------- State tampilan ---------- */
const now = new Date();
let cur = { y: now.getFullYear(), m: now.getMonth() };
let tab = 'home';
let histFilter = 'all';
let histPay = '';
let histAcc = '';
let histSearch = '';
let chartSec = 'pengeluaran';
let matSec = 'pengeluaran';

const monthKey = (y, m) => `${y}-${pad(m + 1)}`;
const inMonth = (t, y = cur.y, m = cur.m) => t.date.startsWith(monthKey(y, m));
const monthTx = (y = cur.y, m = cur.m) => data.tx.filter(t => inMonth(t, y, m));

function sums(list) {
  const s = { in: 0, out: 0 };
  for (const k in GROUPS) s[k] = 0;
  for (const t of list) {
    const g = GROUPS[t.group]; if (!g) continue;
    s[t.group] += t.amount; s[g.type] += t.amount;
  }
  s.pemasukan = s.utama + s.sampingan;
  s.pengeluaran = s.wajib + s.tidak;
  s.future = s.tabungan + s.investasi;
  return s;
}

/* ---------- Render utama ---------- */
function render() {
  if (!me) return Cloud.on ? Cloud.showAuth() : showAuth();
  $('#monthLabel').textContent = `${BULAN[cur.m]} ${cur.y}`;
  $('#userBtn').textContent = '👤 ' + me.name;
  document.querySelectorAll('.bottomnav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const views = { home: viewHome, history: viewHistory, report: viewReport, recurring: viewRecurring, settings: viewSettings, accounts: viewAccounts };
  $('#view').innerHTML = (views[tab] || viewHome)();
  bindView();
}

function viewHome() {
  const list = monthTx();
  const s = sums(list);
  const bal = s.in - s.out;
  const futureRate = s.in ? Math.round(((s.future + bal) / s.in) * 100) : 0;

  const keys = Object.keys(GROUPS).filter(k => s[k] > 0);
  const total = keys.reduce((a, k) => a + s[k], 0);
  let acc = 0;
  const parts = keys.map(k => {
    const from = (acc / total) * 360; acc += s[k];
    return `${GROUPS[k].color} ${from}deg ${(acc / total) * 360}deg`;
  });
  const donutBg = total ? `conic-gradient(${parts.join(',')})` : 'var(--line)';
  const legendKeys = keys.length ? keys : ['utama', 'sampingan', 'wajib', 'tidak'];

  const cols = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(cur.y, cur.m - i, 1);
    const ss = sums(monthTx(d.getFullYear(), d.getMonth()));
    cols.push({ label: BULAN[d.getMonth()].slice(0, 3), in: ss.in, out: ss.out });
  }
  const max = Math.max(1, ...cols.map(c => Math.max(c.in, c.out)));

  let limitHtml = '';
  if (data.limitTidak > 0) {
    const pct = Math.min(100, Math.round((s.tidak / data.limitTidak) * 100));
    const over = s.tidak > data.limitTidak;
    limitHtml = `
      <div class="card">
        <div class="row"><h3 style="margin:0">Batas "Tidak Penting"</h3><span class="muted">${pct}%</span></div>
        <div class="bar" style="--c:${over ? 'var(--out)' : 'var(--tidak)'}"><i style="width:${pct}%"></i></div>
        <div class="muted" style="margin-top:6px">${rp(s.tidak)} dari ${rp(data.limitTidak)} ${over ? '— <b class="neg">sudah lewat batas!</b>' : `— sisa ${rp(data.limitTidak - s.tidak)}`}</div>
      </div>`;
  }

  let tip;
  if (!list.length) tip = 'Belum ada catatan bulan ini. Tekan tombol <b>＋</b> untuk mulai mencatat.';
  else if (bal < 0) tip = `Uang keluar bulan ini lebih besar <b>${rp(-bal)}</b> dari uang masuk. Cek pos <b>Tidak Penting</b> dulu, itu yang paling mudah dipangkas.`;
  else if (futureRate < 20) tip = `Tabungan, investasi, dan sisa uang baru <b>${futureRate}%</b> dari pemasukan. Target sehat minimal <b>20%</b>.`;
  else tip = `Bagus! <b>${futureRate}%</b> pemasukan masuk ke tabungan, investasi, atau masih tersisa. Pindahkan sisanya ke tabungan supaya tidak terpakai.`;

  const pendingRec = data.recurring.filter(r => !recurDone(r)).length;
  const extra = [['tabungan', 'Ditabung'], ['investasi', 'Investasi'], ['hutang', 'Bayar hutang'], ['piutang', 'Dipinjamkan']]
    .filter(([k]) => s[k] > 0).map(([k, n]) => `<span>${n} <b>${rpShort(s[k])}</b></span>`).join('');

  const bals = balances();
  const totalSaldo = data.accounts.reduce((a, x) => a + (bals[x.id] || 0), 0);

  const recent = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created).slice(0, 5);

  return `
    <div class="card balance">
      <div class="label">Sisa uang bulan ini</div>
      <div class="big ${bal < 0 ? 'neg' : ''}">${rp(bal)}</div>
      <div class="inout">
        <div><span class="muted">Uang masuk</span><b class="pos">${rp(s.in)}</b></div>
        <div><span class="muted">Pengeluaran</span><b class="neg">${rp(s.pengeluaran)}</b></div>
      </div>
      ${extra ? `<div class="extra muted">${extra}</div>` : ''}
    </div>

    <div class="card acc-card" data-go="accounts">
      <div class="row">
        <div><span class="muted">Saldo semua rekening</span><div class="mid ${totalSaldo < 0 ? 'neg' : ''}">${rp(totalSaldo)}</div></div>
        <span class="go">›</span>
      </div>
      ${data.accounts.length ? `<div class="acc-strip">${usersOrdered().flatMap(u => data.accounts.filter(a => a.userId === u.id)).map(a => `
        <div class="acc-pill" style="--c:var(--acc-${a.type})"><small>${esc(accName(a))}</small><b class="${bals[a.id] < 0 ? 'neg' : ''}">${rpShort(bals[a.id])}</b><small class="muted">${esc(userName(a.userId))}</small></div>`).join('')}</div>`
        : '<div class="muted" style="margin-top:6px">Tambahkan rekening bank, e-wallet, dan uang tunai kamu ›</div>'}
    </div>

    <div class="card rec-card" data-go="recurring">
      <div class="row">
        <div><b>Transaksi rutin</b><div class="muted">${data.recurring.length ? (pendingRec ? `${pendingRec} belum dicatat bulan ini` : 'Semua sudah dicatat bulan ini ✓') : 'Simpan gaji & tagihan bulanan'}</div></div>
        <span class="go">›</span>
      </div>
    </div>

    <div class="card">
      <h3>Rincian per pos</h3>
      <div class="groups">
        ${Object.entries(GROUPS).filter(([k]) => ['utama', 'sampingan', 'wajib', 'tidak'].includes(k) || s[k] > 0).map(([k, g]) => `
          <div class="gbox" style="--c:${g.color}"><div class="t">${g.name}</div><b>${rp(s[k])}</b></div>`).join('')}
      </div>
    </div>

    ${limitHtml}

    <div class="card">
      <h3>Komposisi uang masuk & keluar</h3>
      <div class="donut-wrap">
        <div class="donut" style="background:${donutBg}"></div>
        <div class="legend">
          ${legendKeys.map(k => `
            <div style="--c:${GROUPS[k].color}"><i></i><span>${GROUPS[k].name}</span><b>${total ? Math.round(s[k] / total * 100) : 0}%</b></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <h3>6 bulan terakhir</h3>
      <div class="chart">
        ${cols.map(c => `
          <div class="col">
            <div class="bars">
              <i style="height:${c.in / max * 100}%;background:var(--in)" title="Masuk ${rp(c.in)}"></i>
              <i style="height:${c.out / max * 100}%;background:var(--out)" title="Keluar ${rp(c.out)}"></i>
            </div>
            <div class="m">${c.label}</div>
          </div>`).join('')}
      </div>
      <div class="muted" style="margin-top:8px"><span class="pos">■</span> Masuk &nbsp; <span class="neg">■</span> Keluar</div>
    </div>

    <div class="card tip">${tip}</div>

    <div class="card">
      <div class="row"><h3 style="margin:0">Transaksi terakhir</h3>
        ${list.length ? '<button class="btn ghost sm" data-go="history">Lihat semua</button>' : ''}</div>
      ${recent.length ? `<ul class="tx-list">${recent.map(txRow).join('')}</ul>` : '<div class="empty">Belum ada transaksi</div>'}
    </div>`;
}

function txRow(t) {
  const d = new Date(t.date + 'T00:00');
  const day = `${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)}`;
  if (t.group === 'pindah') {
    const meta = [`${accName(accById(t.fromAccount))} → ${accName(accById(t.toAccount))}`, t.member, day].filter(Boolean).map(esc).join(' · ');
    return `
      <li class="tx" data-edit="${t.id}">
        <div class="dot" style="--c:${MOVE.color}">⇄</div>
        <div class="info"><b>${esc(t.note || moveLabel(t))}</b><span class="muted">${meta}</span></div>
        <div class="amt muted">${rpShort(t.amount)}</div>
      </li>`;
  }
  const g = GROUPS[t.group] || GROUPS.wajib;
  const sign = g.type === 'in' ? '+' : '−';
  const a = accById(t.accountId);
  const via = a?.type === 'cash' && (!t.payment || /cash|tunai/i.test(t.payment)) ? 'Tunai'
    : [t.payment, t.accountId ? accName(a) : ''].filter(Boolean).join(' ');
  const meta = [t.category, via, t.member, day].filter(Boolean).map(esc).join(' · ');
  return `
    <li class="tx" data-edit="${t.id}">
      <div class="dot" style="--c:${g.color}">${esc(t.category.charAt(0).toUpperCase())}</div>
      <div class="info"><b>${esc(t.note || t.category)}</b><span class="muted">${meta}</span></div>
      <div class="amt ${g.type === 'in' ? 'pos' : 'neg'}">${sign}${rpShort(t.amount)}</div>
    </li>`;
}

function viewHistory() {
  let list = monthTx();
  if (histFilter !== 'all') list = list.filter(t => t.group === histFilter);
  if (histPay) list = list.filter(t => (t.payment || '') === histPay);
  if (histAcc) list = list.filter(t => t.accountId === histAcc || t.fromAccount === histAcc || t.toAccount === histAcc);
  if (histSearch) {
    const q = histSearch.toLowerCase();
    list = list.filter(t => [t.note, t.category, t.member, t.payment].join(' ').toLowerCase().includes(q));
  }
  list.sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  const s = sums(list);

  const byDay = {};
  for (const t of list) (byDay[t.date] ||= []).push(t);

  const chips = [['all', 'Semua'], ...Object.entries(GROUPS).map(([k, g]) => [k, g.name]), ['pindah', MOVE.name]];
  return `
    <input class="inp" id="search" placeholder="Cari catatan, kategori, anggota…" value="${esc(histSearch)}" style="margin-bottom:10px">
    <div class="chips">${chips.map(([k, n]) => `<button class="chip ${histFilter === k ? 'on' : ''}" data-filter="${k}">${n}</button>`).join('')}</div>
    <div class="two">
      <select class="inp" id="payFilter"><option value="">Semua metode</option>${data.payments.map(p => `<option ${p === histPay ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      <select class="inp" id="accFilter">${accOptions(histAcc, 'Semua rekening')}</select>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="row"><span class="muted">${list.length} transaksi</span>
        <span><b class="pos">+${rpShort(s.in)}</b> &nbsp; <b class="neg">−${rpShort(s.out)}</b></span></div>
      ${list.length ? Object.entries(byDay).map(([day, items]) => {
        const d = new Date(day + 'T00:00');
        return `<div class="day-head">${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}</div>
          <ul class="tx-list">${items.map(txRow).join('')}</ul>`;
      }).join('') : '<div class="empty">Tidak ada transaksi</div>'}
    </div>`;
}

/* ---------- Rekening ---------- */
function viewAccounts() {
  const bals = balances();
  const total = data.accounts.reduce((a, x) => a + (bals[x.id] || 0), 0);
  return `
    <button class="btn ghost sm" data-go="home" style="margin-bottom:12px">‹ Beranda</button>
    <div class="card balance">
      <div class="label">Total saldo keluarga</div>
      <div class="big ${total < 0 ? 'neg' : ''}">${rp(total)}</div>
      <div class="muted">Saldo = saldo awal + uang masuk − uang keluar yang memakai rekening tersebut.</div>
    </div>
    ${usersOrdered().map(u => {
      const accs = data.accounts.filter(a => a.userId === u.id);
      const own = u.id === me.id;
      const sub = accs.reduce((a, x) => a + (bals[x.id] || 0), 0);
      return `
      <div class="card">
        <div class="row"><h3 style="margin:0">${esc(u.name)}${own ? ' <span class="muted">(kamu)</span>' : ''}</h3><b>${rp(sub)}</b></div>
        ${accs.length ? `<ul class="tx-list">${accs.map(a => `
          <li class="tx" ${own ? `data-acc="${a.id}"` : ''}>
            <div class="dot" style="--c:var(--acc-${a.type})">${a.type === 'cash' ? 'Rp' : esc(a.bank.charAt(0))}</div>
            <div class="info"><b>${esc(accName(a))}</b><span class="muted">${ACC_TYPES[a.type]}${a.number ? ' · ' + esc(mask(a.number)) : ''}</span></div>
            <div class="amt ${bals[a.id] < 0 ? 'neg' : ''}">${rp(bals[a.id])}</div>
          </li>`).join('')}</ul>` : '<div class="empty">Belum ada rekening</div>'}
        ${own ? '<div class="btns"><button class="btn ghost" id="accNew">＋ Tambah rekening / e-wallet</button></div>' : '<p class="muted" style="margin:6px 0 0">Hanya pemilik yang bisa mengubah rekening ini.</p>'}
      </div>`;
    }).join('')}`;
}

function openAccountForm(acc) {
  const isEdit = !!acc;
  const bals = balances();
  const st = acc ? { ...acc, current: bals[acc.id] || 0 } : { type: 'bank', bank: PROVIDERS.bank[0], label: '', number: '', current: 0 };
  const sheet = $('#sheet');
  const draw = () => {
    const list = PROVIDERS[st.type] || [];
    const custom = st.type !== 'cash' && !list.includes(st.bank);
    sheet.innerHTML = `
      <form class="sheet-in" method="dialog">
        <h2>${isEdit ? 'Ubah rekening' : 'Tambah rekening'}</h2>
        <div class="seg seg3">
          ${Object.entries(ACC_TYPES).map(([k, n]) => `<button type="button" data-atype="${k}" class="${st.type === k ? 'on' : ''}">${n}</button>`).join('')}
        </div>
        ${st.type !== 'cash' ? `
          <label class="f"><span>${st.type === 'bank' ? 'Nama bank' : 'Penyedia e-wallet'}</span>
            <select class="inp" id="aProv">${list.map(p => `<option ${p === st.bank ? 'selected' : ''}>${esc(p)}</option>`).join('')}<option value="__other" ${custom ? 'selected' : ''}>Lainnya…</option></select></label>
          ${custom ? `<label class="f"><span>Tulis nama ${st.type === 'bank' ? 'bank' : 'e-wallet'}</span><input class="inp" id="aOther" value="${esc(st.bank === '__other' ? '' : st.bank)}"></label>` : ''}
          <label class="f"><span>${st.type === 'bank' ? 'Nomor rekening' : 'Nomor HP / akun'} (opsional)</span>
            <input class="inp" id="aNum" inputmode="numeric" autocomplete="off" value="${esc(st.number)}" placeholder="Cukup 4 angka terakhir juga boleh"></label>` : ''}
        <label class="f"><span>Label (opsional)</span><input class="inp" id="aLabel" value="${esc(st.label)}" placeholder="${st.type === 'cash' ? 'mis. Dompet, Celengan' : 'mis. Rekening gaji, Tabungan anak'}"></label>
        <label class="f"><span>${isEdit ? 'Saldo sekarang' : 'Saldo saat ini'} (Rp)</span>
          <input class="inp amount" id="aBal" inputmode="numeric" placeholder="0" value="${st.current > 0 ? num(st.current) : ''}"></label>
        ${isEdit ? '<p class="muted" style="margin-top:-6px">Ubah kalau saldo di aplikasi tidak sama dengan saldo asli di bank.</p>' : ''}
        <div class="btns">
          <button type="button" class="btn" id="aSave">Simpan</button>
          ${isEdit ? '<button type="button" class="btn danger" id="aDel">Hapus rekening</button>' : ''}
          <button type="button" class="btn ghost" id="aCancel">Batal</button>
        </div>
      </form>`;
    const read = () => {
      const prov = $('#aProv');
      if (prov) st.bank = prov.value === '__other' ? ($('#aOther')?.value.trim() || '__other') : prov.value;
      st.number = ($('#aNum')?.value || '').replace(/\s/g, '');
      st.label = $('#aLabel').value.trim();
      st.current = parseAmount($('#aBal').value);
    };
    sheet.querySelectorAll('[data-atype]').forEach(b => b.onclick = () => {
      read(); st.type = b.dataset.atype;
      st.bank = st.type === 'cash' ? 'Tunai' : PROVIDERS[st.type][0];
      draw();
    });
    const prov = $('#aProv');
    if (prov) prov.onchange = () => { read(); draw(); };
    const bal = $('#aBal'); bal.oninput = () => { bal.value = fmtInput(bal.value); };
    $('#aCancel').onclick = () => sheet.close();
    $('#aSave').onclick = () => {
      read();
      if (st.type !== 'cash' && (!st.bank || st.bank === '__other')) return toast('Isi nama bank / e-wallet');
      const rec = { type: st.type, bank: st.type === 'cash' ? 'Tunai' : st.bank, label: st.label, number: st.type === 'cash' ? '' : st.number };
      if (isEdit) {
        const a = accById(acc.id);
        Object.assign(a, rec);
        a.initial = (a.initial || 0) + (st.current - (bals[acc.id] || 0));
      } else {
        data.accounts.push({ id: uid(), userId: me.id, ...rec, initial: st.current });
      }
      save(); sheet.close(); render(); toast('Rekening disimpan');
    };
    const del = $('#aDel');
    if (del) del.onclick = () => {
      const used = data.tx.filter(t => t.accountId === acc.id || t.fromAccount === acc.id || t.toAccount === acc.id).length;
      if (!confirm(`Hapus rekening ${accName(acc)}?${used ? ` ${used} transaksi tetap ada, tapi tidak lagi terhubung ke rekening ini.` : ''}`)) return;
      data.accounts = data.accounts.filter(a => a.id !== acc.id);
      save(); sheet.close(); render(); toast('Rekening dihapus');
    };
  };
  draw();
  sheet.showModal();
}

/* ---------- Laporan ---------- */
function catAgg(groups, list) {
  const map = new Map();
  for (const g of groups) for (const c of data.categories[g] || []) map.set(bkey(g, c), { g, c, actual: 0 });
  for (const t of list) {
    if (!groups.includes(t.group)) continue;
    const k = bkey(t.group, t.category);
    if (!map.has(k)) map.set(k, { g: t.group, c: t.category, actual: 0 });
    map.get(k).actual += t.amount;
  }
  return [...map.values()].map(r => ({ ...r, budget: data.budgets[bkey(r.g, r.c)] || 0 }));
}

function periodMonths() {
  const s = data.periodStart || 0;
  const py = cur.m >= s ? cur.y : cur.y - 1;
  return Array.from({ length: 12 }, (_, i) => { const d = new Date(py, s + i, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
}

function viewReport() {
  const list = monthTx();
  const label = `${BULAN[cur.m]} ${cur.y}`;

  const budgetHtml = SECTIONS.map(sec => {
    const rows = catAgg(sec.groups, list);
    const tA = rows.reduce((a, r) => a + r.actual, 0);
    const tB = rows.reduce((a, r) => a + r.budget, 0);
    const open = sec.key === 'pemasukan' || sec.key === 'pengeluaran' || tA > 0 || tB > 0;
    return `
      <details class="sec" ${open ? 'open' : ''}>
        <summary class="sec-head" style="--c:${sec.color}"><span>${sec.name}</span><span class="sec-tot">${tB ? `${rpShort(tA)} / ${rpShort(tB)}` : rp(tA)}</span></summary>
        <div class="brow bhead"><span>Kategori</span><span>Anggaran</span><span>Aktual</span></div>
        ${rows.map(r => {
          const pct = r.budget ? Math.round(r.actual / r.budget * 100) : 0;
          const bad = r.budget && (sec.type === 'out' ? r.actual > r.budget : false);
          const good = r.budget && sec.type === 'in' && r.actual >= r.budget;
          return `
          <div class="brow" data-budget="${esc(bkey(r.g, r.c))}">
            <span>${esc(r.c)}${sec.groups.length > 1 ? `<small style="color:${GROUPS[r.g].color}">${GROUPS[r.g].name}</small>` : ''}</span>
            <span class="muted">${r.budget ? num(r.budget) : '＋'}</span>
            <span><b>${num(r.actual)}</b></span>
            ${r.budget ? `<div class="bar mini" style="--c:${bad ? 'var(--out)' : good ? 'var(--in)' : sec.color}"><i style="width:${Math.min(100, pct)}%"></i></div><span class="pct ${bad ? 'neg' : good ? 'pos' : ''}">${pct}%</span>` : ''}
          </div>`;
        }).join('')}
        <div class="brow btot"><span>Total</span><span>${num(tB)}</span><span>${num(tA)}</span></div>
      </details>`;
  }).join('');

  const cs = SECTIONS.find(x => x.key === chartSec);
  const crow = catAgg(cs.groups, list).filter(r => r.actual || r.budget).sort((a, b) => b.actual - a.actual);
  const cmax = Math.max(1, ...crow.map(r => Math.max(r.actual, r.budget)));
  const chartHtml = crow.length ? crow.map(r => `
    <div class="hrow">
      <div class="hl">${esc(r.c)}</div>
      <div class="hb">
        ${r.budget ? `<i class="hb-b" style="width:${r.budget / cmax * 100}%"></i>` : ''}
        <i class="hb-a" style="width:${r.actual / cmax * 100}%;background:${cs.color}"></i>
      </div>
      <div class="hv">${rpShort(r.actual)}</div>
    </div>`).join('') : '<div class="empty">Belum ada data</div>';

  // Per rekening (uang masuk & keluar bulan ini)
  const accRows = usersOrdered().flatMap(u => data.accounts.filter(a => a.userId === u.id)).map(a => {
    const s = sums(list.filter(t => t.accountId === a.id));
    const mv = list.filter(t => t.group === 'pindah');
    const mIn = mv.filter(t => t.toAccount === a.id).reduce((x, t) => x + t.amount, 0);
    const mOut = mv.filter(t => t.fromAccount === a.id).reduce((x, t) => x + t.amount, 0);
    return { a, in: s.in + mIn, out: s.out + mOut };
  }).filter(r => r.in || r.out);

  const pays = [...new Set([...data.payments, ...list.map(t => t.payment).filter(Boolean)])];
  const payRows = pays.map(p => {
    const s = sums(list.filter(t => t.payment === p));
    return { p, in: s.in, out: s.out };
  }).filter(r => r.in || r.out);
  const noPay = sums(list.filter(t => !t.payment));
  if (noPay.in || noPay.out) payRows.push({ p: 'Tanpa keterangan', in: noPay.in, out: noPay.out });

  const months = periodMonths();
  const ms = SECTIONS.find(x => x.key === matSec);
  const first = months[0], last = months[11];
  const fromKey = monthKey(first.y, first.m), toKey = monthKey(last.y, last.m);
  const inPeriod = t => { const mk = t.date.slice(0, 7); return mk >= fromKey && mk <= toKey; };
  const cell = {};
  for (const t of data.tx) {
    if (!ms.groups.includes(t.group) || !inPeriod(t)) continue;
    const k = bkey(t.group, t.category) + '|' + t.date.slice(0, 7);
    cell[k] = (cell[k] || 0) + t.amount;
  }
  const mrows = catAgg(ms.groups, data.tx.filter(inPeriod));
  const colTot = months.map(mo => mrows.reduce((a, r) => a + (cell[bkey(r.g, r.c) + '|' + monthKey(mo.y, mo.m)] || 0), 0));

  const years = new Set([now.getFullYear(), cur.y]);
  data.tx.forEach(t => years.add(+t.date.slice(0, 4)));
  const ys = [...years].sort();
  const yrs = Object.fromEntries(ys.map(y => [y, sums(data.tx.filter(t => t.date.startsWith(y + '-')))]));
  const yRows = [['Pemasukan', 'pemasukan'], ['Pengeluaran', 'pengeluaran'], ['Tabungan', 'tabungan'], ['Investasi', 'investasi'], ['Hutang', 'hutang'], ['Piutang', 'piutang'], ['Pemasukan Piutang', 'terima']];

  const secChips = (state, attr) => SECTIONS.map(x => `<button class="chip ${state === x.key ? 'on' : ''}" data-${attr}="${x.key}">${x.name}</button>`).join('');
  const flowTable = (rows, nameOf) => rows.length ? `<div class="brow bhead"><span></span><span>Masuk</span><span>Keluar</span></div>
    ${rows.map(r => `<div class="brow"><span>${nameOf(r)}</span><span class="pos">${num(r.in)}</span><span class="neg">${num(r.out)}</span></div>`).join('')}`
    : '<div class="empty">Belum ada data</div>';

  return `
    <div class="card">
      <h3>Anggaran vs Aktual · ${label}</h3>
      <p class="muted" style="margin-top:-6px">Tekan kategori untuk mengatur anggaran bulanan.</p>
      ${budgetHtml}
    </div>

    <div class="card">
      <h3>Grafik per kategori · ${label}</h3>
      <div class="chips">${secChips(chartSec, 'chart')}</div>
      ${chartHtml}
      <div class="muted" style="margin-top:8px"><span style="color:${cs.color}">■</span> Aktual &nbsp; <span style="opacity:.5">■</span> Anggaran</div>
    </div>

    <div class="card">
      <h3>Per rekening · ${label}</h3>
      ${flowTable(accRows, r => `${esc(accName(r.a))}<small class="muted">${esc(userName(r.a.userId))}</small>`)}
    </div>

    <div class="card">
      <h3>Per metode pembayaran · ${label}</h3>
      ${flowTable(payRows, r => esc(r.p))}
    </div>

    <div class="card">
      <h3>Per bulan · ${BULAN[first.m].slice(0, 3)} ${first.y} – ${BULAN[last.m].slice(0, 3)} ${last.y}</h3>
      <div class="chips">${secChips(matSec, 'mat')}</div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>${ms.name}</th>${months.map(mo => `<th>${BULAN[mo.m].slice(0, 3)} ${String(mo.y).slice(2)}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>
          ${mrows.map(r => {
            const vals = months.map(mo => cell[bkey(r.g, r.c) + '|' + monthKey(mo.y, mo.m)] || 0);
            return `<tr><th>${esc(r.c)}</th>${vals.map(v => `<td class="${v ? '' : 'z'}">${num(v)}</td>`).join('')}<td><b>${num(vals.reduce((a, b) => a + b, 0))}</b></td></tr>`;
          }).join('')}
          <tr class="tot"><th>Total</th>${colTot.map(v => `<td>${num(v)}</td>`).join('')}<td>${num(colTot.reduce((a, b) => a + b, 0))}</td></tr>
        </tbody>
      </table></div>
      <p class="muted">Awal periode bisa diganti di menu Atur.</p>
    </div>

    <div class="card">
      <h3>Ringkasan tahunan</h3>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th></th>${ys.map(y => `<th>${y}</th>`).join('')}</tr></thead>
        <tbody>${yRows.map(([n, k]) => `<tr><th>${n}</th>${ys.map(y => `<td class="${yrs[y][k] ? '' : 'z'}">${num(yrs[y][k])}</td>`).join('')}</tr>`).join('')}
          <tr class="tot"><th>Sisa uang</th>${ys.map(y => `<td class="${yrs[y].in - yrs[y].out < 0 ? 'neg' : ''}">${num(yrs[y].in - yrs[y].out)}</td>`).join('')}</tr>
        </tbody>
      </table></div>
    </div>`;
}

/* ---------- Rutin ---------- */
function recurDone(r) { return monthTx().some(t => t.recurId === r.id); }

function viewRecurring() {
  const list = data.recurring;
  const pending = list.filter(r => !recurDone(r));
  const totalIn = list.filter(r => GROUPS[r.group].type === 'in').reduce((a, r) => a + r.amount, 0);
  const totalOut = list.filter(r => GROUPS[r.group].type === 'out').reduce((a, r) => a + r.amount, 0);
  return `
    <button class="btn ghost sm" data-go="home" style="margin-bottom:12px">‹ Beranda</button>
    <div class="card">
      <h3>Transaksi rutin bulanan</h3>
      <p class="muted" style="margin-top:-6px">Simpan gaji, tagihan listrik, SPP, cicilan, tabungan bulanan, dll. sekali saja. Tiap bulan tinggal tekan <b>Catat</b>.</p>
      <div class="inout">
        <div><span class="muted">Rutin masuk</span><b class="pos">${rp(totalIn)}</b></div>
        <div><span class="muted">Rutin keluar</span><b class="neg">${rp(totalOut)}</b></div>
      </div>
    </div>
    ${pending.length > 1 ? `<button class="btn" id="recAll" style="margin-bottom:14px">Catat semua yang belum (${pending.length}) untuk ${BULAN[cur.m]}</button>` : ''}
    <div class="card">
      ${list.length ? `<ul class="tx-list">${[...list].sort((a, b) => a.day - b.day).map(r => {
        const g = GROUPS[r.group]; const done = recurDone(r);
        const via = [r.payment, r.accountId ? accName(accById(r.accountId)) : ''].filter(Boolean).join(' ');
        return `<li class="tx">
          <div class="dot" style="--c:${g.color}">${r.day}</div>
          <div class="info" data-recedit="${r.id}"><b>${esc(r.name)}</b>
            <span class="muted">${esc(r.category)}${via ? ' · ' + esc(via) : ''} · tgl ${r.day} · <span class="${g.type === 'in' ? 'pos' : 'neg'}">${rp(r.amount)}</span></span></div>
          ${done ? '<span class="muted">✓ Tercatat</span>' : `<button class="btn sm" data-rec="${r.id}">Catat</button>`}
        </li>`;
      }).join('')}</ul>` : '<div class="empty">Belum ada transaksi rutin</div>'}
      <div class="btns"><button class="btn ghost" id="recNew">＋ Tambah transaksi rutin</button></div>
    </div>`;
}

/* ---------- Pengaturan ---------- */
function listEditor(title, hint, items, attr, placeholder) {
  return `
    <div class="card">
      <h3>${title}</h3>
      ${hint ? `<p class="muted" style="margin-top:-6px">${hint}</p>` : ''}
      <ul class="list-edit">${items.map((m, i) => `<li>${esc(m)}<button class="x" data-del${attr}="${i}" aria-label="Hapus">✕</button></li>`).join('')}</ul>
      <div class="add-line"><input class="inp" id="new-${attr}" placeholder="${placeholder}"><button class="btn sm" data-add="${attr}">Tambah</button></div>
    </div>`;
}

function viewSettings() {
  const myAcc = data.accounts.filter(a => a.userId === me.id).length;
  const accountHtml = Cloud.on ? Cloud.settingsHtml() : `
    <div class="card">
      <div class="row">
        <div class="me-row"><span class="av">${esc(me.name.charAt(0).toUpperCase())}</span>
          <div><b>${esc(me.name)}</b><div class="muted">${me.pin ? 'Dilindungi PIN' : 'Tanpa PIN'} · ${myAcc} rekening</div></div></div>
      </div>
      <div class="btns" style="margin-top:12px">
        <button class="btn ghost" id="changePin">${me.pin ? 'Ganti / hapus PIN' : 'Pasang PIN'}</button>
        <button class="btn ghost" id="logout">Keluar / ganti akun</button>
      </div>
    </div>`;
  const familyHtml = Cloud.on ? '' : `
    <div class="card">
      <h3>Akun keluarga</h3>
      <ul class="list-edit">${data.users.map(u => `<li>${esc(u.name)}${u.id === me.id ? ' <span class="muted">(kamu)</span>' : ''}${u.id === me.id ? '' : `<button class="x" data-deluser="${u.id}" aria-label="Hapus akun">✕</button>`}</li>`).join('')}</ul>
      <p class="muted" style="margin:0">Anggota lain mendaftar lewat <b>Keluar / ganti akun → Daftar akun baru</b>.</p>
    </div>`;
  return `
    ${accountHtml}

    <div class="card rec-card" data-go="accounts">
      <div class="row"><div><b>Rekening & saldo</b><div class="muted">${data.accounts.length} rekening keluarga</div></div><span class="go">›</span></div>
    </div>
    <div class="card rec-card" data-go="recurring">
      <div class="row"><div><b>Transaksi rutin</b><div class="muted">${data.recurring.length} tersimpan</div></div><span class="go">›</span></div>
    </div>

    ${familyHtml}

    ${listEditor('Anggota lain (tanpa akun)', 'Mis. anak yang belum punya akun, untuk menandai siapa yang memakai uang.', data.members, 'member', 'mis. Kakak, Adik, Nenek')}
    ${listEditor('Metode pembayaran', 'Transfer, QRIS, tunai, kartu debit, dan sebagainya.', data.payments, 'payment', 'mis. Virtual Account')}

    <div class="card">
      <h3>Awal periode laporan</h3>
      <p class="muted" style="margin-top:-6px">Tabel 12 bulan di Laporan dimulai dari bulan ini.</p>
      <select class="inp" id="periodStart">${BULAN.map((b, i) => `<option value="${i}" ${i === (data.periodStart || 0) ? 'selected' : ''}>${b}</option>`).join('')}</select>
    </div>

    <div class="card">
      <h3>Batas belanja "Tidak Penting" per bulan</h3>
      <div class="add-line"><input class="inp" id="limit" inputmode="numeric" placeholder="0 = tanpa batas" value="${data.limitTidak ? data.limitTidak.toLocaleString('id-ID') : ''}"><button class="btn sm" id="saveLimit">Simpan</button></div>
    </div>

    ${Object.entries(GROUPS).map(([k, g]) => `
      <details class="card cat-card">
        <summary><b style="color:${g.color}">Kategori: ${g.name}</b> <span class="muted">(${data.categories[k].length})</span></summary>
        <ul class="list-edit">${data.categories[k].map((c, i) => `<li>${esc(c)}<button class="x" data-delcat="${k}:${i}" aria-label="Hapus">✕</button></li>`).join('')}</ul>
        <div class="add-line"><input class="inp" data-newcat="${k}" placeholder="Kategori baru"><button class="btn sm" data-addcat="${k}">Tambah</button></div>
      </details>`).join('')}

    <div class="card">
      <h3>Cadangan data</h3>
      <p class="muted" style="margin-top:-6px">${Cloud.on ? 'Data tersimpan online dan di HP ini. Cadangan tetap berguna sebagai arsip.' : 'Data hanya tersimpan di HP ini. Rutin buat cadangan supaya tidak hilang saat ganti HP atau hapus browser.'}</p>
      <div class="btns">
        <button class="btn" id="exportJson">Simpan cadangan (.json)</button>
        <button class="btn ghost" id="importJson">Pulihkan dari cadangan</button>
        <button class="btn ghost" id="exportCsv">Ekspor ke Excel (.csv)</button>
        ${Cloud.on ? '' : '<button class="btn danger" id="resetAll">Hapus semua data</button>'}
      </div>
      <input type="file" id="fileIn" accept=".json,application/json" hidden>
    </div>
    <p class="muted" style="text-align:center">${data.tx.length} transaksi tersimpan</p>`;
}

/* ---------- Event di tampilan ---------- */
function bindView() {
  const v = $('#view');
  v.querySelectorAll('[data-edit]').forEach(el => el.onclick = () => openTxForm(data.tx.find(t => t.id === el.dataset.edit)));
  v.querySelectorAll('[data-go]').forEach(el => el.onclick = () => { tab = el.dataset.go; render(); window.scrollTo(0, 0); });

  if (tab === 'history') {
    v.querySelectorAll('[data-filter]').forEach(el => el.onclick = () => { histFilter = el.dataset.filter; render(); });
    $('#payFilter').onchange = e => { histPay = e.target.value; render(); };
    $('#accFilter').onchange = e => { histAcc = e.target.value; render(); };
    const s = $('#search');
    s.oninput = () => { histSearch = s.value; const pos = s.selectionStart; render(); const n = $('#search'); n.focus(); n.setSelectionRange(pos, pos); };
  }

  if (tab === 'accounts') {
    $('#accNew').onclick = () => openAccountForm();
    v.querySelectorAll('[data-acc]').forEach(el => el.onclick = () => openAccountForm(accById(el.dataset.acc)));
  }

  if (tab === 'report') {
    v.querySelectorAll('[data-chart]').forEach(el => el.onclick = () => { chartSec = el.dataset.chart; render(); });
    v.querySelectorAll('[data-mat]').forEach(el => el.onclick = () => { matSec = el.dataset.mat; render(); });
    v.querySelectorAll('[data-budget]').forEach(el => el.onclick = () => openBudgetForm(el.dataset.budget));
  }

  if (tab === 'recurring') {
    $('#recNew').onclick = () => openRecurForm();
    v.querySelectorAll('[data-recedit]').forEach(el => el.onclick = () => openRecurForm(data.recurring.find(r => r.id === el.dataset.recedit)));
    v.querySelectorAll('[data-rec]').forEach(el => el.onclick = () => { logRecurring(data.recurring.find(r => r.id === el.dataset.rec)); save(); render(); toast('Tercatat'); });
    const all = $('#recAll');
    if (all) all.onclick = () => { const p = data.recurring.filter(r => !recurDone(r)); p.forEach(logRecurring); save(); render(); toast(`${p.length} transaksi rutin tercatat`); };
  }

  if (tab === 'settings') {
    if (Cloud.on) Cloud.bindSettings();
    else {
      $('#logout').onclick = () => { me = null; sessSet(null); $('#sheet').open && $('#sheet').close(); showAuth(); };
      $('#changePin').onclick = openPinForm;
    }
    v.querySelectorAll('[data-deluser]').forEach(el => el.onclick = () => {
      const u = data.users.find(x => x.id === el.dataset.deluser);
      const n = data.accounts.filter(a => a.userId === u.id).length;
      if (!confirm(`Hapus akun ${u.name}? ${n} rekening miliknya ikut terhapus. Transaksi tetap ada.`)) return;
      data.users = data.users.filter(x => x.id !== u.id);
      data.accounts = data.accounts.filter(a => a.userId !== u.id);
      save(); render();
    });
    const lists = { member: 'members', payment: 'payments' };
    for (const [attr, field] of Object.entries(lists)) {
      v.querySelector(`[data-add="${attr}"]`).onclick = () => {
        const val = $(`#new-${attr}`).value.trim();
        if (!val) return;
        if (!data[field].includes(val)) data[field].push(val);
        save(); render();
      };
      v.querySelectorAll(`[data-del${attr}]`).forEach(el => el.onclick = () => {
        data[field].splice(+el.getAttribute(`data-del${attr}`), 1); save(); render();
      });
    }
    $('#periodStart').onchange = e => { data.periodStart = +e.target.value; save(); toast('Awal periode disimpan'); };
    const lim = $('#limit');
    lim.oninput = () => { lim.value = fmtInput(lim.value); };
    $('#saveLimit').onclick = () => { data.limitTidak = parseAmount(lim.value); save(); toast('Batas disimpan'); render(); };
    const reopen = k => $('#view').querySelectorAll('.cat-card')[Object.keys(GROUPS).indexOf(k)]?.setAttribute('open', '');
    v.querySelectorAll('[data-addcat]').forEach(el => el.onclick = () => {
      const k = el.dataset.addcat; const val = v.querySelector(`[data-newcat="${k}"]`).value.trim();
      if (!val) return;
      if (!data.categories[k].includes(val)) data.categories[k].push(val);
      save(); render(); reopen(k);
    });
    v.querySelectorAll('[data-delcat]').forEach(el => el.onclick = () => {
      const [k, i] = el.dataset.delcat.split(':');
      if (data.categories[k].length <= 1) return toast('Minimal satu kategori');
      data.categories[k].splice(+i, 1); save(); render(); reopen(k);
    });
    $('#exportJson').onclick = () => download(`cadangan-keuangan-${ymd(new Date())}.json`, JSON.stringify(data, null, 1), 'application/json');
    $('#exportCsv').onclick = exportCsv;
    $('#importJson').onclick = () => $('#fileIn').click();
    $('#fileIn').onchange = e => importJson(e.target.files[0]);
    if ($('#resetAll')) $('#resetAll').onclick = () => {
      if (confirm('Hapus SEMUA data, termasuk semua akun dan rekening? Tindakan ini tidak bisa dibatalkan. Buat cadangan dulu jika perlu.')) {
        data = DEFAULT_DATA(); save(); me = null; sessSet(null); showAuth(); toast('Semua data dihapus');
      }
    };
  }
}

function logRecurring(r) {
  const last = new Date(cur.y, cur.m + 1, 0).getDate();
  data.tx.push({
    id: uid(), created: Date.now(), group: r.group, category: r.category, amount: r.amount,
    date: `${monthKey(cur.y, cur.m)}-${pad(Math.min(r.day, last))}`, note: r.name, member: r.member || '',
    payment: r.payment || '', accountId: accById(r.accountId) ? r.accountId : '', recurId: r.id, userId: me.id,
  });
}

/* ---------- Form transaksi ---------- */
function defaultDate() {
  if (cur.y === now.getFullYear() && cur.m === now.getMonth()) return ymd(new Date());
  return `${monthKey(cur.y, cur.m)}-01`;
}

function openTxForm(tx) {
  const isEdit = !!tx;
  const fee0 = isEdit && tx.group === 'pindah' ? data.tx.find(t => t.linkedTo === tx.id) : null;
  const accId = defaultAccount();
  const st = tx ? { payment: '', accountId: '', fee: fee0 ? fee0.amount : 0, ...tx } : {
    group: 'wajib', category: data.categories.wajib[0], amount: 0, date: defaultDate(), note: '', member: me.name,
    accountId: accId, payment: methodFor(accById(accId), data.payments[0] || ''),
    fromAccount: accId, toAccount: '', fee: 0,
  };
  const sheet = $('#sheet');

  const draw = () => {
    const ftab = ftabOf(st.group);
    const isMove = ftab === 'move';
    const cats = isMove ? [] : data.categories[st.group];
    if (!isMove && !cats.includes(st.category)) st.category = cats[0];
    const pays = st.payment && !data.payments.includes(st.payment) ? [...data.payments, st.payment] : data.payments;
    const isIn = !isMove && GROUPS[st.group].type === 'in';
    const noAcc = !data.accounts.length ? '<p class="muted" style="margin:-6px 0 12px">Belum ada rekening. Tambahkan di <b>Atur → Rekening & saldo</b>.</p>' : '';

    const body = isMove ? `
        <p class="muted" style="margin:-4px 0 12px">Tarik tunai, setor tunai, transfer antar rekening, atau top up e-wallet. Tidak dihitung sebagai pemasukan/pengeluaran.</p>
        <label class="f"><span>Jumlah (Rp)</span>
          <input class="inp amount" id="fAmount" inputmode="numeric" autocomplete="off" placeholder="0" value="${st.amount ? num(st.amount) : ''}"></label>
        <label class="f"><span>Dari rekening</span><select class="inp" id="fFrom">${accOptions(st.fromAccount, '— pilih —')}</select></label>
        <label class="f"><span>Ke rekening</span><select class="inp" id="fTo">${accOptions(st.toAccount, '— pilih —')}</select></label>
        ${noAcc}
        <div class="two">
          <label class="f"><span>Biaya admin (opsional)</span><input class="inp" id="fFee" inputmode="numeric" placeholder="0" value="${st.fee ? num(st.fee) : ''}"></label>
          <label class="f"><span>Tanggal</span><input class="inp" type="date" id="fDate" value="${st.date}"></label>
        </div>` : `
        <div class="grp-pick">
          ${Object.entries(GROUPS).filter(([, g]) => g.tab === ftab).map(([k, g]) => `
            <button type="button" data-grp="${k}" class="${st.group === k ? 'on' : ''}" style="--c:${g.color}">
              <b>${g.name}</b><small>${g.desc}</small></button>`).join('')}
        </div>
        <label class="f"><span>Jumlah (Rp)</span>
          <input class="inp amount" id="fAmount" inputmode="numeric" autocomplete="off" placeholder="0" value="${st.amount ? num(st.amount) : ''}"></label>
        <label class="f"><span>${isIn ? 'Masuk ke rekening' : 'Dibayar dari rekening'}</span>
          <select class="inp" id="fAcc">${accOptions(st.accountId)}</select></label>
        ${noAcc}
        <div class="two">
          <label class="f"><span>Kategori</span><select class="inp" id="fCat">${opts(cats, st.category)}</select></label>
          <label class="f"><span>${isIn ? 'Diterima via' : 'Bayar via'}</span><select class="inp" id="fPay">${opts(pays, st.payment, '—')}</select></label>
        </div>
        <label class="f"><span>Tanggal</span><input class="inp" type="date" id="fDate" value="${st.date}"></label>`;

    sheet.innerHTML = `
      <form class="sheet-in" method="dialog">
        <h2>${isEdit ? 'Ubah transaksi' : 'Catat transaksi'}</h2>
        <div class="seg seg4 ${ftab}">
          ${Object.entries(FORM_TABS).map(([k, n]) => `<button type="button" data-ftab="${k}" class="${ftab === k ? 'on' : ''}">${n}</button>`).join('')}
        </div>
        ${body}
        <label class="f"><span>Anggota</span><select class="inp" id="fMember">${opts(memberNames(), st.member, '—')}</select></label>
        <label class="f"><span>Keterangan (opsional)</span><input class="inp" id="fNote" placeholder="${isMove ? 'mis. Tarik di ATM Indomaret' : 'mis. Token listrik, jajan anak'}" value="${esc(st.note)}"></label>
        <div class="btns">
          <button type="button" class="btn" id="fSave">Simpan</button>
          ${isEdit ? '<button type="button" class="btn danger" id="fDel">Hapus transaksi</button>' : ''}
          <button type="button" class="btn ghost" id="fCancel">Batal</button>
        </div>
      </form>`;

    const read = () => {
      st.amount = parseAmount($('#fAmount').value);
      st.date = $('#fDate').value; st.member = $('#fMember').value; st.note = $('#fNote').value.trim();
      if (isMove) {
        st.fromAccount = $('#fFrom').value; st.toAccount = $('#fTo').value; st.fee = parseAmount($('#fFee').value);
      } else {
        st.category = $('#fCat').value; st.payment = $('#fPay').value; st.accountId = $('#fAcc').value;
      }
    };
    sheet.querySelectorAll('[data-ftab]').forEach(b => b.onclick = () => {
      read();
      const t = b.dataset.ftab;
      if (ftabOf(st.group) !== t) {
        if (t === 'move') { st.group = 'pindah'; st.fromAccount = st.fromAccount || st.accountId; }
        else {
          st.group = Object.keys(GROUPS).find(k => GROUPS[k].tab === t);
          st.accountId = st.accountId || st.fromAccount || '';
        }
      }
      draw();
    });
    sheet.querySelectorAll('[data-grp]').forEach(b => b.onclick = () => { read(); st.group = b.dataset.grp; draw(); });
    const acc = $('#fAcc');
    if (acc) acc.onchange = () => { const p = methodFor(accById(acc.value), $('#fPay').value); if (p) $('#fPay').value = p; };
    const amt = $('#fAmount');
    amt.oninput = () => { amt.value = fmtInput(amt.value); };
    const fee = $('#fFee');
    if (fee) fee.oninput = () => { fee.value = fmtInput(fee.value); };
    $('#fCancel').onclick = () => sheet.close();
    $('#fSave').onclick = () => {
      read();
      if (!st.amount) { toast('Isi jumlah uangnya dulu'); amt.focus(); return; }
      if (!st.date) { toast('Isi tanggalnya'); return; }
      let rec;
      if (isMove) {
        if (!st.fromAccount || !st.toAccount) return toast('Pilih rekening asal dan tujuan');
        if (st.fromAccount === st.toAccount) return toast('Rekening asal dan tujuan harus berbeda');
        rec = { group: 'pindah', amount: st.amount, date: st.date, note: st.note, member: st.member, fromAccount: st.fromAccount, toAccount: st.toAccount };
      } else {
        rec = { group: st.group, category: st.category, amount: st.amount, date: st.date, note: st.note, member: st.member, payment: st.payment, accountId: st.accountId };
      }
      let id;
      if (isEdit) {
        const t = data.tx.find(x => x.id === tx.id);
        for (const k of ['category', 'payment', 'accountId', 'fromAccount', 'toAccount', 'fee']) delete t[k];
        Object.assign(t, rec); id = t.id;
      } else {
        id = uid();
        data.tx.push({ ...rec, id, created: Date.now(), userId: me.id });
      }
      // Biaya admin dicatat sebagai pengeluaran terpisah yang terhubung ke transaksi pindah dana
      data.tx = data.tx.filter(t => t.linkedTo !== id);
      if (isMove && st.fee) {
        if (!data.categories.wajib.includes(FEE_CAT)) data.categories.wajib.push(FEE_CAT);
        data.tx.push({
          id: uid(), created: Date.now(), userId: me.id, linkedTo: id, group: 'wajib', category: FEE_CAT,
          amount: st.fee, date: st.date, note: `Biaya ${moveLabel(rec).toLowerCase()}`, member: st.member,
          payment: '', accountId: st.fromAccount,
        });
      }
      const accUsed = isMove ? st.fromAccount : st.accountId;
      if (accUsed && accById(accUsed)?.userId === me.id) { const u = data.users.find(x => x.id === me.id); if (u) { u.lastAccount = accUsed; me = u; } }
      save(); sheet.close();
      const [y, m] = st.date.split('-').map(Number);
      cur = { y, m: m - 1 };
      render(); toast(isEdit ? 'Perubahan disimpan' : 'Tersimpan');
    };
    const del = $('#fDel');
    if (del) del.onclick = () => {
      if (!confirm('Hapus transaksi ini?')) return;
      data.tx = data.tx.filter(t => t.id !== tx.id && t.linkedTo !== tx.id);
      save(); sheet.close(); render(); toast('Transaksi dihapus');
    };
  };
  draw();
  sheet.showModal();
  if (!isEdit) setTimeout(() => $('#fAmount')?.focus(), 50);
}

/* ---------- Form anggaran ---------- */
function openBudgetForm(key) {
  const i = key.indexOf('|');
  const g = key.slice(0, i), c = key.slice(i + 1);
  const cur0 = data.budgets[key] || 0;
  const isIn = GROUPS[g].type === 'in' || g === 'tabungan' || g === 'investasi';
  const sheet = $('#sheet');
  sheet.innerHTML = `
    <form class="sheet-in" method="dialog">
      <h2>${isIn ? 'Target' : 'Anggaran'} bulanan</h2>
      <p class="muted" style="margin-top:-8px"><b style="color:${GROUPS[g].color}">${GROUPS[g].name}</b> · ${esc(c)}</p>
      <label class="f"><span>Jumlah per bulan (Rp)</span>
        <input class="inp amount" id="bAmount" inputmode="numeric" placeholder="0" value="${cur0 ? num(cur0) : ''}"></label>
      <div class="btns">
        <button type="button" class="btn" id="bSave">Simpan</button>
        ${cur0 ? '<button type="button" class="btn danger" id="bDel">Hapus anggaran</button>' : ''}
        <button type="button" class="btn ghost" id="bCancel">Batal</button>
      </div>
    </form>`;
  const amt = $('#bAmount');
  amt.oninput = () => { amt.value = fmtInput(amt.value); };
  $('#bCancel').onclick = () => sheet.close();
  $('#bSave').onclick = () => {
    const n = parseAmount(amt.value);
    if (n) data.budgets[key] = n; else delete data.budgets[key];
    save(); sheet.close(); render(); toast('Anggaran disimpan');
  };
  const del = $('#bDel');
  if (del) del.onclick = () => { delete data.budgets[key]; save(); sheet.close(); render(); };
  sheet.showModal();
  setTimeout(() => amt.focus(), 50);
}

/* ---------- Form rutin ---------- */
function openRecurForm(r) {
  const isEdit = !!r;
  const accId = defaultAccount();
  const st = r ? { payment: '', accountId: '', ...r } : {
    name: '', group: 'wajib', category: data.categories.wajib[0], amount: 0, day: 1, member: me.name,
    accountId: accId, payment: methodFor(accById(accId), data.payments[0] || ''),
  };
  const sheet = $('#sheet');
  const allowed = ['utama', 'sampingan', 'wajib', 'hutang', 'tabungan', 'investasi'];
  const draw = () => {
    const cats = data.categories[st.group];
    if (!cats.includes(st.category)) st.category = cats[0];
    sheet.innerHTML = `
      <form class="sheet-in" method="dialog">
        <h2>${isEdit ? 'Ubah transaksi rutin' : 'Transaksi rutin baru'}</h2>
        <label class="f"><span>Nama</span><input class="inp" id="rName" placeholder="mis. Gaji Ayah, Listrik PLN, SPP" value="${esc(st.name)}"></label>
        <div class="grp-pick">
          ${allowed.map(k => { const g = GROUPS[k]; return `
            <button type="button" data-grp="${k}" class="${st.group === k ? 'on' : ''}" style="--c:${g.color}"><b>${g.name}</b><small>${g.type === 'in' ? 'Uang masuk' : 'Uang keluar'}</small></button>`; }).join('')}
        </div>
        <label class="f"><span>Jumlah (Rp)</span><input class="inp amount" id="rAmount" inputmode="numeric" placeholder="0" value="${st.amount ? num(st.amount) : ''}"></label>
        <label class="f"><span>Rekening</span><select class="inp" id="rAcc">${accOptions(st.accountId)}</select></label>
        <div class="two">
          <label class="f"><span>Kategori</span><select class="inp" id="rCat">${opts(cats, st.category)}</select></label>
          <label class="f"><span>Via</span><select class="inp" id="rPay">${opts(data.payments, st.payment, '—')}</select></label>
        </div>
        <div class="two">
          <label class="f"><span>Tanggal tiap bulan</span><input class="inp" id="rDay" type="number" min="1" max="31" value="${st.day}"></label>
          <label class="f"><span>Anggota</span><select class="inp" id="rMember">${opts(memberNames(), st.member, '—')}</select></label>
        </div>
        <div class="btns">
          <button type="button" class="btn" id="rSave">Simpan</button>
          ${isEdit ? '<button type="button" class="btn danger" id="rDel">Hapus dari daftar rutin</button>' : ''}
          <button type="button" class="btn ghost" id="rCancel">Batal</button>
        </div>
      </form>`;
    const read = () => {
      st.name = $('#rName').value.trim(); st.amount = parseAmount($('#rAmount').value);
      st.category = $('#rCat').value; st.day = Math.min(31, Math.max(1, parseInt($('#rDay').value, 10) || 1));
      st.member = $('#rMember').value; st.payment = $('#rPay').value; st.accountId = $('#rAcc').value;
    };
    sheet.querySelectorAll('[data-grp]').forEach(b => b.onclick = () => { read(); st.group = b.dataset.grp; draw(); });
    $('#rAcc').onchange = e => { const p = methodFor(accById(e.target.value), $('#rPay').value); if (p) $('#rPay').value = p; };
    const amt = $('#rAmount'); amt.oninput = () => { amt.value = fmtInput(amt.value); };
    $('#rCancel').onclick = () => sheet.close();
    $('#rSave').onclick = () => {
      read();
      if (!st.name) return toast('Isi namanya dulu');
      if (!st.amount) return toast('Isi jumlah uangnya');
      if (isEdit) Object.assign(data.recurring.find(x => x.id === r.id), st);
      else data.recurring.push({ ...st, id: uid() });
      save(); sheet.close(); render(); toast('Disimpan');
    };
    const del = $('#rDel');
    if (del) del.onclick = () => {
      if (!confirm('Hapus dari daftar rutin? Transaksi yang sudah tercatat tidak ikut terhapus.')) return;
      data.recurring = data.recurring.filter(x => x.id !== r.id); save(); sheet.close(); render();
    };
  };
  draw();
  sheet.showModal();
}

/* ---------- PIN ---------- */
function openPinForm() {
  const sheet = $('#sheet');
  sheet.innerHTML = `
    <form class="sheet-in" method="dialog">
      <h2>${me.pin ? 'Ganti PIN' : 'Pasang PIN'}</h2>
      ${me.pin ? '<label class="f"><span>PIN lama</span><input class="inp" id="pOld" type="password" inputmode="numeric" maxlength="6"></label>' : ''}
      <label class="f"><span>PIN baru (4–6 angka, kosongkan untuk menghapus PIN)</span><input class="inp" id="pNew" type="password" inputmode="numeric" maxlength="6"></label>
      <label class="f"><span>Ulangi PIN baru</span><input class="inp" id="pNew2" type="password" inputmode="numeric" maxlength="6"></label>
      <div class="btns"><button type="button" class="btn" id="pSave">Simpan</button><button type="button" class="btn ghost" id="pCancel">Batal</button></div>
    </form>`;
  $('#pCancel').onclick = () => sheet.close();
  $('#pSave').onclick = async () => {
    if (me.pin && await hashPin(me.id, $('#pOld').value) !== me.pin) return toast('PIN lama salah');
    const p = $('#pNew').value, p2 = $('#pNew2').value;
    if (p && !/^\d{4,6}$/.test(p)) return toast('PIN harus 4–6 angka');
    if (p !== p2) return toast('PIN tidak sama');
    const u = data.users.find(x => x.id === me.id);
    u.pin = p ? await hashPin(u.id, p) : null; me = u;
    save(); sheet.close(); render(); toast(p ? 'PIN disimpan' : 'PIN dihapus');
  };
  sheet.showModal();
}

/* ---------- Layar masuk & daftar ---------- */
function showAuth(mode) {
  const box = $('#auth');
  box.hidden = false;
  document.body.classList.add('locked');
  if ($('#sheet').open) $('#sheet').close();
  if (!data.users.length || mode === 'register') return drawRegister();
  const head = `<div class="auth-logo"><img src="icons/icon.svg" alt=""><h1>Family Financial Freedom</h1></div>`;
  box.innerHTML = `
    <div class="auth-in">
      ${head}
      <p class="muted" style="text-align:center">Pilih akun untuk masuk</p>
      <div class="profiles">
        ${data.users.map(u => `
          <button class="profile" data-uid="${u.id}"><span class="av">${esc(u.name.charAt(0).toUpperCase())}</span>
            <b>${esc(u.name)}</b><small class="muted">${u.pin ? '🔒 PIN' : 'Tanpa PIN'}</small></button>`).join('')}
      </div>
      <button class="btn ghost" id="toRegister">＋ Daftar akun baru</button>
    </div>`;
  box.querySelectorAll('[data-uid]').forEach(b => b.onclick = () => {
    const u = data.users.find(x => x.id === b.dataset.uid);
    if (!u.pin) return login(u);
    box.innerHTML = `
      <div class="auth-in">
        ${head}
        <div class="profile solo"><span class="av">${esc(u.name.charAt(0).toUpperCase())}</span><b>${esc(u.name)}</b></div>
        <label class="f"><span>Masukkan PIN</span><input class="inp amount pin" id="pinIn" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label>
        <div class="btns"><button class="btn" id="pinGo">Masuk</button><button class="btn ghost" id="pinBack">Kembali</button></div>
      </div>`;
    const inp = $('#pinIn'); inp.focus();
    const go = async () => {
      if (await hashPin(u.id, inp.value) === u.pin) login(u);
      else { toast('PIN salah'); inp.value = ''; inp.focus(); }
    };
    $('#pinGo').onclick = go;
    inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    $('#pinBack').onclick = () => showAuth();
  });
  $('#toRegister').onclick = () => showAuth('register');
}

function drawRegister() {
  const box = $('#auth');
  const first = !data.users.length;
  box.innerHTML = `
    <div class="auth-in">
      <div class="auth-logo"><img src="icons/icon.svg" alt=""><h1>${first ? 'Selamat datang!' : 'Daftar akun baru'}</h1></div>
      <p class="muted" style="text-align:center">${first ? 'Daftarkan akun pertama. Anggota keluarga lain bisa mendaftar nanti di HP ini.' : 'Setiap anggota keluarga punya akun dan rekening sendiri.'}</p>
      <label class="f"><span>Nama</span><input class="inp" id="regName" placeholder="mis. Ayah, Ibu, Papah, Mamah" autocomplete="off"></label>
      <label class="f"><span>PIN 4–6 angka (opsional)</span><input class="inp" id="regPin" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label>
      <label class="f"><span>Ulangi PIN</span><input class="inp" id="regPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></label>
      <div class="btns">
        <button class="btn" id="regGo">Daftar & masuk</button>
        ${first ? '' : '<button class="btn ghost" id="regBack">Kembali</button>'}
      </div>
      <p class="muted" style="font-size:12px;text-align:center">PIN hanya mencegah orang lain membuka akun kamu di HP ini.</p>
    </div>`;
  $('#regName').focus();
  $('#regGo').onclick = async () => {
    const name = $('#regName').value.trim();
    const p = $('#regPin').value, p2 = $('#regPin2').value;
    if (!name) return toast('Isi nama dulu');
    if (data.users.some(u => u.name.toLowerCase() === name.toLowerCase())) return toast('Nama sudah dipakai');
    if (p && !/^\d{4,6}$/.test(p)) return toast('PIN harus 4–6 angka');
    if (p !== p2) return toast('PIN tidak sama');
    const u = { id: uid(), name, pin: null, created: Date.now() };
    if (p) u.pin = await hashPin(u.id, p);
    data.users.push(u);
    data.accounts.push({ id: uid(), userId: u.id, type: 'cash', bank: 'Tunai', label: '', number: '', initial: 0 });
    data.members = data.members.filter(m => m.toLowerCase() !== name.toLowerCase());
    save();
    login(u, 'accounts');
    toast('Akun dibuat. Tambahkan rekening kamu');
  };
  const back = $('#regBack');
  if (back) back.onclick = () => showAuth();
}

function login(u, goTo = 'home') {
  me = u; sessSet(u.id);
  $('#auth').hidden = true;
  document.body.classList.remove('locked');
  tab = goTo; render(); window.scrollTo(0, 0);
}

/* ---------- Ekspor / impor ---------- */
function download(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCsv() {
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Tanggal', 'Jenis', 'Pos', 'Kategori', 'Via', 'Rekening', 'Ke rekening', 'Nominal', 'Anggota', 'Keterangan']];
  [...data.tx].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
    if (t.group === 'pindah') {
      rows.push([t.date, 'Pindah', MOVE.name, moveLabel(t), '', accFull(accById(t.fromAccount)), accFull(accById(t.toAccount)), t.amount, t.member, t.note]);
    } else {
      const g = GROUPS[t.group];
      rows.push([t.date, g.type === 'in' ? 'Masuk' : 'Keluar', g.name, t.category, t.payment, t.accountId ? accFull(accById(t.accountId)) : '', '', t.amount, t.member, t.note]);
    }
  });
  download(`transaksi-${ymd(new Date())}.csv`, '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n'), 'text/csv');
}
function importJson(file) {
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (!Array.isArray(d.tx)) throw new Error('format');
      if (!confirm(`Pulihkan ${d.tx.length} transaksi? Data yang ada sekarang akan diganti.`)) return;
      data = merge(d);
      if (Cloud.on) { data.users = Cloud.users(); save(); render(); toast('Data berhasil dipulihkan'); return; }
      save();
      me = data.users.find(u => u.id === me?.id) || null;
      if (!me) { sessSet(null); showAuth(); } else render();
      toast('Data berhasil dipulihkan');
    } catch (e) { toast('File cadangan tidak valid'); }
  };
  fr.readAsText(file);
}

/* ---------- Navigasi ---------- */
document.querySelectorAll('.bottomnav button').forEach(b => b.onclick = () => {
  if (b.dataset.tab === 'add') return openTxForm();
  tab = b.dataset.tab; render(); window.scrollTo(0, 0);
});
$('#prevMonth').onclick = () => { const d = new Date(cur.y, cur.m - 1, 1); cur = { y: d.getFullYear(), m: d.getMonth() }; render(); };
$('#nextMonth').onclick = () => { const d = new Date(cur.y, cur.m + 1, 1); cur = { y: d.getFullYear(), m: d.getMonth() }; render(); };
$('#userBtn').onclick = () => { tab = 'settings'; render(); window.scrollTo(0, 0); };
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') $('#sheet').close(); });

if (Cloud.enabled()) Cloud.start();
else {
  me = data.users.find(u => u.id === sessGet()) || null;
  if (me) { $('#auth').hidden = true; render(); } else showAuth();
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
