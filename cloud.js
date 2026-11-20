/* Sinkron online lewat Supabase: login email, satu keluarga berbagi data, tersinkron antar HP.
   Data tetap disimpan di HP (bisa dipakai offline); perubahan dikirim saat ada internet. */
'use strict';

const Cloud = (() => {
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js';
  const FAMILY_KEY = 'fff-cloud-family';
  const SETTING_KEYS = ['categories', 'payments', 'budgets', 'members', 'limitTidak', 'periodStart'];

  let sb = null, user = null, family = null, st = null, channel = null;
  let pushTimer = null, pollTimer = null, pulling = false, pushing = false, pendingRender = false, recovering = false;
  let status = 'off', statusMsg = '', lastSync = null;

  const C = { on: false };
  C.enabled = () => !!(window.FFF_CONFIG && FFF_CONFIG.supabaseUrl && FFF_CONFIG.supabaseAnonKey);

  /* ---------- penyimpanan lokal ---------- */
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* penuh */ } };
  const cacheKey = () => 'fff-cloud:' + family.id;
  const persist = () => { if (family && st) lsSet(cacheKey(), st); };
  C.users = () => (st?.members || []).map(m => ({ id: m.user_id, name: m.name }));
  const displayName = () => user?.user_metadata?.name || (user?.email || 'Saya').split('@')[0];

  /* ---------- data aplikasi <-> baris database ---------- */
  function toRecords(d) {
    const r = {};
    for (const t of d.tx) r['tx:' + t.id] = { kind: 'tx', data: t };
    for (const a of d.accounts) r['account:' + a.id] = { kind: 'account', data: a };
    for (const x of d.recurring) r['recurring:' + x.id] = { kind: 'recurring', data: x };
    for (const k of SETTING_KEYS) r['setting:' + k] = { kind: 'setting', data: { value: d[k] } };
    return r;
  }
  function fromRecords() {
    const d = DEFAULT_DATA();
    d.tx = []; d.accounts = []; d.recurring = [];
    for (const [k, row] of Object.entries(st.rows)) {
      if (row.deleted || !row.data) continue;
      if (row.kind === 'tx') d.tx.push(row.data);
      else if (row.kind === 'account') d.accounts.push(row.data);
      else if (row.kind === 'recurring') d.recurring.push(row.data);
      else if (row.kind === 'setting') {
        const key = k.slice(8);
        if (SETTING_KEYS.includes(key) && row.data.value !== undefined && row.data.value !== null) d[key] = row.data.value;
      }
    }
    const m = merge(d);
    m.users = C.users();
    if (user && !m.users.some(u => u.id === user.id)) m.users.unshift({ id: user.id, name: displayName() });
    return m;
  }
  function setMe() {
    me = data.users.find(u => u.id === user.id) || { id: user.id, name: displayName() };
  }
  function rebuild() {
    data = fromRecords(); setMe();
    if ($('#sheet').open || !$('#auth').hidden) pendingRender = true; else render();
  }

  // Dipanggil setiap kali aplikasi menyimpan: cari yang berubah, antrekan untuk dikirim
  C.commit = () => {
    if (!st) return;
    const recs = toRecords(data);
    let n = 0;
    for (const [k, r] of Object.entries(recs)) {
      const prev = st.rows[k];
      const s = JSON.stringify(r.data);
      if (!prev || prev.deleted || JSON.stringify(prev.data) !== s) {
        const row = { kind: r.kind, data: JSON.parse(s), deleted: false };
        st.rows[k] = row; st.outbox[k] = row; n++;
      }
    }
    for (const [k, prev] of Object.entries(st.rows)) {
      if (!prev.deleted && !recs[k]) {
        const row = { kind: prev.kind, data: null, deleted: true };
        st.rows[k] = row; st.outbox[k] = row; n++;
      }
    }
    persist();
    if (n) schedulePush();
  };

  /* ---------- kirim & tarik ---------- */
  function schedulePush() {
    setStatus('pending');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 700);
  }
  async function push() {
    if (!sb || !family || pushing) return;
    const keys = Object.keys(st.outbox);
    if (!keys.length) return;
    pushing = true; setStatus('sync');
    try {
      for (let i = 0; i < keys.length; i += 400) {
        const snap = keys.slice(i, i + 400).map(k => [k, st.outbox[k]]);
        const { error } = await sb.from('records').upsert(
          snap.map(([k, r]) => ({ family_id: family.id, id: k, kind: r.kind, data: r.data, deleted: r.deleted })),
          { onConflict: 'family_id,id' });
        if (error) throw error;
        for (const [k, r] of snap) if (st.outbox[k] === r) delete st.outbox[k];
        persist();
      }
      lastSync = new Date();
      setStatus(Object.keys(st.outbox).length ? 'pending' : 'ok');
    } catch (e) {
      setStatus('error', errText(e));
    } finally {
      pushing = false;
      if (Object.keys(st.outbox).length && status !== 'error') schedulePush();
    }
  }
  function applyRow(r) {
    if (!r || !r.id || st.outbox[r.id]) return false; // perubahan lokal yang belum terkirim menang
    const prev = st.rows[r.id];
    const row = { kind: r.kind, data: r.data, deleted: !!r.deleted };
    if (prev && prev.deleted === row.deleted && JSON.stringify(prev.data) === JSON.stringify(row.data)) return false;
    st.rows[r.id] = row;
    return true;
  }
  async function loadMembers() {
    const { data: rows, error } = await sb.from('family_members').select('user_id, name').eq('family_id', family.id);
    if (error) throw error;
    const changed = JSON.stringify(rows) !== JSON.stringify(st.members);
    st.members = rows;
    return changed;
  }
  C.pull = async () => {
    if (!sb || !family || pulling) return;
    pulling = true;
    if (status !== 'pending') setStatus('sync');
    try {
      // mundur 3 detik supaya perubahan yang bersamaan tidak terlewat
      const since = st.since ? new Date(new Date(st.since).getTime() - 3000).toISOString() : '1970-01-01T00:00:00Z';
      let from = 0, maxTs = st.since, changed = false;
      for (;;) {
        const { data: rows, error } = await sb.from('records').select('id, kind, data, deleted, updated_at')
          .eq('family_id', family.id).gte('updated_at', since).order('updated_at', { ascending: true }).range(from, from + 999);
        if (error) throw error;
        for (const r of rows) {
          if (applyRow(r)) changed = true;
          if (!maxTs || r.updated_at > maxTs) maxTs = r.updated_at;
        }
        if (rows.length < 1000) break;
        from += 1000;
      }
      st.since = maxTs;
      if (await loadMembers()) changed = true;
      persist();
      if (changed) rebuild();
      lastSync = new Date();
      setStatus(Object.keys(st.outbox).length ? 'pending' : 'ok');
    } catch (e) {
      setStatus('error', errText(e));
    } finally {
      pulling = false;
    }
  };
  C.syncNow = async () => { await push(); await C.pull(); };

  function subscribe() {
    if (!sb || channel) return;
    try {
      channel = sb.channel('fff-' + family.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: 'family_id=eq.' + family.id },
          p => { if (applyRow(p.new)) { persist(); rebuild(); } })
        .subscribe();
    } catch (e) { /* realtime opsional; tetap ada tarik berkala */ }
  }
  function startTimers() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (document.visibilityState === 'visible') C.pull(); }, 60000);
  }
  document.addEventListener('visibilitychange', () => { if (C.on && family && document.visibilityState === 'visible') C.syncNow(); });
  window.addEventListener('online', () => { if (C.on && family) C.syncNow(); });

  /* ---------- status ---------- */
  function statusText() {
    const n = st ? Object.keys(st.outbox).length : 0;
    if (status === 'sync') return 'Menyinkronkan…';
    if (status === 'pending') return `${n} perubahan menunggu dikirim`;
    if (status === 'error') return navigator.onLine === false
      ? `Offline. ${n ? n + ' perubahan dikirim saat online' : 'Data tersimpan di HP'}`
      : 'Gagal sinkron: ' + statusMsg;
    if (status === 'ok') return 'Tersinkron' + (lastSync ? ' ' + lastSync.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '');
    return '';
  }
  function setStatus(s, msg = '') {
    status = s; statusMsg = msg;
    const b = $('#userBtn'); if (b) b.dataset.sync = s;
    const t = $('#syncStatus'); if (t) t.textContent = statusText();
    const d = $('#syncDot'); if (d) d.dataset.s = s;
  }
  function errText(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/invalid login/i.test(m)) return 'Email atau password salah';
    if (/not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Buka link di email kamu dulu.';
    if (/already registered|already been registered/i.test(m)) return 'Email sudah terdaftar. Silakan masuk.';
    if (/password should be|at least 6/i.test(m)) return 'Password minimal 6 karakter';
    if (/failed to fetch|networkerror|network request|load failed/i.test(m)) return 'Tidak ada koneksi internet';
    if (/rate limit|too many/i.test(m)) return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';
    return m;
  }

  /* ---------- mulai ---------- */
  function loadSdk() {
    return new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement('script');
      s.src = SDK_URL; s.onload = res; s.onerror = () => rej(new Error('Failed to fetch'));
      document.head.appendChild(s);
    });
  }
  C.start = async () => {
    C.on = true;
    $('#sheet').addEventListener('close', () => { if (pendingRender) { pendingRender = false; render(); } });
    try {
      await loadSdk();
      sb = window.supabase.createClient(FFF_CONFIG.supabaseUrl, FFF_CONFIG.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'fff-auth' },
      });
    } catch (e) {
      const c = lsGet(FAMILY_KEY);
      if (c) { user = { id: c.uid, email: c.email, user_metadata: { name: c.name } }; return openFamily(c.family); }
      return showAuth('login', 'Butuh koneksi internet untuk masuk pertama kali.');
    }
    sb.auth.onAuthStateChange((ev, s) => {
      if (ev === 'PASSWORD_RECOVERY') { recovering = true; user = s?.user || user; showAuth('newpass'); }
    });
    const { data: { session } } = await sb.auth.getSession();
    if (recovering) return;
    if (session) { user = session.user; afterLogin(); } else showAuth('login');
  };

  async function afterLogin() {
    const cached = lsGet(FAMILY_KEY);
    let fam = null, offline = false;
    try {
      const { data: rows, error } = await sb.from('family_members')
        .select('family_id, name, families(id, name, join_code)').eq('user_id', user.id);
      if (error) throw error;
      if (rows.length && rows[0].families) fam = rows[0].families;
    } catch (e) { offline = true; }
    if (offline) {
      if (cached && cached.uid === user.id) return openFamily(cached.family);
      return showAuth('login', 'Tidak bisa terhubung ke server. Cek koneksi internet.');
    }
    if (!fam) return showFamilySetup();
    openFamily(fam);
  }

  async function openFamily(fam, upload = null) {
    family = fam;
    lsSet(FAMILY_KEY, { uid: user.id, email: user.email, name: displayName(), family: fam });
    st = lsGet(cacheKey()) || { rows: {}, outbox: {}, since: null, members: [] };
    if (upload) {
      data = upload;
      data.users = C.users();
      if (!data.users.some(u => u.id === user.id)) data.users.unshift({ id: user.id, name: displayName() });
      setMe(); C.commit();
    }
    else { data = fromRecords(); setMe(); }
    $('#auth').hidden = true;
    document.body.classList.remove('locked');
    tab = 'home'; render(); window.scrollTo(0, 0);
    setStatus(Object.keys(st.outbox).length ? 'pending' : 'sync');
    if (!sb) return setStatus('error', 'Offline');
    await C.pull();
    ensureCash();
    push(); subscribe(); startTimers();
  }

  // Setiap anggota otomatis punya rekening "Uang Tunai" (id tetap supaya tidak dobel antar HP)
  function ensureCash() {
    const id = 'cash-' + user.id;
    if (data.accounts.some(a => a.id === id || (a.userId === user.id && a.type === 'cash'))) return;
    data.accounts.push({ id, userId: user.id, type: 'cash', bank: 'Tunai', label: '', number: '', initial: 0 });
    C.commit();
    if ($('#sheet').open) pendingRender = true; else render();
  }

  /* ---------- layar masuk / daftar ---------- */
  function lockScreen() {
    const box = $('#auth');
    box.hidden = false;
    document.body.classList.add('locked');
    if ($('#sheet').open) $('#sheet').close();
    return box;
  }
  const HEAD = '<div class="auth-logo"><img src="icons/icon.svg" alt=""><h1>Family Financial Freedom</h1></div>';

  function showAuth(mode = 'login', msg = '', email = '') {
    const box = lockScreen();
    if (mode === 'newpass') {
      box.innerHTML = `<form class="auth-in" id="auForm">${HEAD}
        <p class="muted" style="text-align:center">Buat password baru untuk akun kamu.</p>
        <label class="f"><span>Password baru (min. 6 karakter)</span><input class="inp" id="auPass" type="password" autocomplete="new-password"></label>
        <div class="btns"><button class="btn" type="submit" id="auGo">Simpan password</button></div>
        <p class="muted auth-msg" id="auMsg"></p></form>`;
      $('#auForm').onsubmit = async e => {
        e.preventDefault();
        const p = $('#auPass').value;
        if (p.length < 6) return showMsg('Password minimal 6 karakter');
        busy(true);
        const { data: res, error } = await sb.auth.updateUser({ password: p });
        busy(false);
        if (error) return showMsg(errText(error));
        recovering = false; user = res.user;
        history.replaceState(null, '', location.pathname);
        toast('Password diganti'); afterLogin();
      };
      return;
    }
    const tabs = mode === 'reset' ? '' : `<div class="seg">
        <button type="button" data-am="login" class="${mode === 'login' ? 'on' : ''}">Masuk</button>
        <button type="button" data-am="register" class="${mode === 'register' ? 'on' : ''}">Daftar</button></div>`;
    box.innerHTML = `<form class="auth-in" id="auForm">${HEAD}
      <p class="muted" style="text-align:center">${mode === 'register' ? 'Buat akun. Setelah itu buat keluarga baru atau gabung dengan kode undangan.' : mode === 'reset' ? 'Masukkan email akun kamu. Kami kirim link untuk membuat password baru.' : 'Masuk dengan akun kamu. Data tersinkron di semua HP keluarga.'}</p>
      ${tabs}
      ${mode === 'register' ? '<label class="f"><span>Nama panggilan</span><input class="inp" id="auName" placeholder="mis. Papah, Mamah" autocomplete="nickname"></label>' : ''}
      <label class="f"><span>Email</span><input class="inp" id="auEmail" type="email" autocomplete="email" inputmode="email" value="${esc(email)}"></label>
      ${mode !== 'reset' ? `<label class="f"><span>Password${mode === 'register' ? ' (min. 6 karakter)' : ''}</span><input class="inp" id="auPass" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}"></label>` : ''}
      <div class="btns">
        <button class="btn" type="submit" id="auGo">${mode === 'register' ? 'Daftar' : mode === 'reset' ? 'Kirim link' : 'Masuk'}</button>
        ${mode === 'login' ? '<button class="btn ghost" type="button" id="auForgot">Lupa password?</button>' : ''}
        ${mode === 'reset' ? '<button class="btn ghost" type="button" data-am="login">Kembali</button>' : ''}
      </div>
      <p class="muted auth-msg" id="auMsg">${esc(msg)}</p></form>`;
    box.querySelectorAll('[data-am]').forEach(b => b.onclick = () => showAuth(b.dataset.am, '', $('#auEmail').value));
    const fg = $('#auForgot');
    if (fg) fg.onclick = () => showAuth('reset', '', $('#auEmail').value);
    $('#auForm').onsubmit = async e => {
      e.preventDefault();
      const em = $('#auEmail').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(em)) return showMsg('Isi email yang benar');
      busy(true);
      try {
        if (mode === 'reset') {
          const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
          if (error) throw error;
          return showMsg('Link reset sudah dikirim ke ' + em + '. Buka email kamu.');
        }
        const pw = $('#auPass').value;
        if (mode === 'register') {
          const name = $('#auName').value.trim();
          if (!name) throw new Error('Isi nama panggilan');
          if (pw.length < 6) throw new Error('Password minimal 6 karakter');
          const { data: res, error } = await sb.auth.signUp({ email: em, password: pw, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (!res.session) return showAuth('login', `Cek email ${em} dan buka link konfirmasinya, lalu masuk di sini.`, em);
          user = res.user; return afterLogin();
        }
        const { data: res, error } = await sb.auth.signInWithPassword({ email: em, password: pw });
        if (error) throw error;
        user = res.user; afterLogin();
      } catch (err) {
        showMsg(errText(err));
      } finally { busy(false); }
    };
    setTimeout(() => (mode === 'register' ? $('#auName') : $('#auEmail'))?.focus(), 50);
  }
  const showMsg = m => { const el = $('#auMsg'); if (el) el.textContent = m; };
  const busy = on => { const b = $('#auGo'); if (b) { b.disabled = on; b.style.opacity = on ? .6 : 1; } };
  C.showAuth = () => showAuth('login');

  function showFamilySetup() {
    const box = lockScreen();
    const local = load();
    const nLocal = local.tx.length + local.accounts.length;
    box.innerHTML = `<div class="auth-in">${HEAD}
      <p class="muted" style="text-align:center">Hai! Satu langkah lagi: buat keluarga baru, atau gabung ke keluarga yang sudah ada.</p>
      <label class="f"><span>Nama kamu di keluarga</span><input class="inp" id="fsName" value="${esc(displayName())}"></label>
      <div class="card">
        <h3>Buat keluarga baru</h3>
        <label class="f"><span>Nama keluarga</span><input class="inp" id="fsFam" value="Keluarga ${esc(displayName())}"></label>
        ${nLocal ? `<label class="check"><input type="checkbox" id="fsUpload" checked> Unggah data yang sudah ada di HP ini (${local.tx.length} transaksi, ${local.accounts.length} rekening)</label>` : ''}
        <button class="btn" id="fsCreate">Buat keluarga</button>
      </div>
      <div class="card">
        <h3>Gabung keluarga</h3>
        <p class="muted" style="margin-top:-6px">Minta kode undangan dari anggota keluarga yang sudah terdaftar (menu Atur).</p>
        <label class="f"><span>Kode undangan</span><input class="inp code-in" id="fsCode" placeholder="mis. A1B2C3D4" autocapitalize="characters" autocomplete="off"></label>
        <button class="btn" id="fsJoin">Gabung</button>
      </div>
      <button class="btn ghost" id="fsOut">Keluar</button>
      <p class="muted auth-msg" id="auMsg"></p>
    </div>`;
    const name = () => $('#fsName').value.trim();
    $('#fsCreate').onclick = async () => {
      if (!name()) return showMsg('Isi nama kamu');
      const fam = $('#fsFam').value.trim() || 'Keluarga ' + name();
      const { data: f, error } = await sb.rpc('create_family', { family_name: fam, member_name: name() });
      if (error) return showMsg(errText(error));
      let up = null;
      if ($('#fsUpload')?.checked) {
        up = merge(local);
        up.accounts = up.accounts.map(a => ({ ...a, userId: user.id }));
        up.tx = up.tx.map(t => ({ ...t, userId: user.id }));
      }
      st = null;
      toast('Keluarga dibuat');
      openFamily(f, up);
    };
    $('#fsJoin').onclick = async () => {
      const code = $('#fsCode').value.trim();
      if (!name()) return showMsg('Isi nama kamu');
      if (!code) return showMsg('Isi kode undangan');
      const { data: f, error } = await sb.rpc('join_family', { code, member_name: name() });
      if (error) return showMsg(/tidak ditemukan/i.test(error.message) ? 'Kode keluarga tidak ditemukan' : errText(error));
      toast('Berhasil bergabung');
      openFamily(f);
    };
    $('#fsOut').onclick = () => C.signOut(true);
  }

  C.signOut = async (silent = false) => {
    const n = st ? Object.keys(st.outbox).length : 0;
    if (!silent && !confirm(n ? `Masih ada ${n} perubahan yang belum terkirim (tersimpan di HP ini, dikirim saat kamu masuk lagi). Tetap keluar?` : 'Keluar dari akun?')) return;
    try { if (channel) sb.removeChannel(channel); await sb?.auth.signOut(); } catch (e) { /* abaikan */ }
    channel = null; clearInterval(pollTimer); clearTimeout(pushTimer);
    family = null; st = null; me = null; user = null;
    lsSet(FAMILY_KEY, null);
    setStatus('off');
    showAuth('login');
  };

  /* ---------- bagian di menu Atur ---------- */
  C.settingsHtml = () => `
    <div class="card">
      <div class="me-row"><span class="av">${esc(me.name.charAt(0).toUpperCase())}</span>
        <div><b>${esc(me.name)}</b><div class="muted">${esc(user?.email || '')}</div></div></div>
      <div class="sync-box"><span class="sync-dot" id="syncDot" data-s="${status}"></span><span id="syncStatus" class="muted">${statusText()}</span>
        <button class="btn ghost sm" id="syncNow">Sinkron</button></div>
      <div class="btns"><button class="btn ghost" id="cloudLogout">Keluar</button></div>
    </div>
    <div class="card">
      <h3>${esc(family.name)}</h3>
      <p class="muted" style="margin-top:-6px">Kode undangan untuk anggota keluarga:</p>
      <div class="code-box"><b>${esc(family.join_code)}</b><button class="btn sm" id="shareCode">Bagikan</button></div>
      <p class="muted">Anggota lain: buka aplikasi → <b>Daftar</b> → <b>Gabung keluarga</b> → masukkan kode ini.</p>
      <ul class="list-edit">${C.users().map(u => `<li>${esc(u.name)}${u.id === user.id ? ' <span class="muted">(kamu)</span>' : ''}</li>`).join('')}</ul>
    </div>`;
  C.bindSettings = () => {
    $('#cloudLogout').onclick = () => C.signOut();
    $('#syncNow').onclick = () => C.syncNow();
    $('#shareCode').onclick = async () => {
      const text = `Gabung ke "${family.name}" di aplikasi Family Financial Freedom.\nKode undangan: ${family.join_code}\n${location.origin + location.pathname}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Undangan keluarga', text });
        else { await navigator.clipboard.writeText(text); toast('Undangan disalin'); }
      } catch (e) { /* dibatalkan */ }
    };
  };

  return C;
})();
