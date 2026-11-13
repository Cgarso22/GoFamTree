// GoFamTree: sign-in, families, invites, and the data layer the tree runs on (Supabase).
import { createClient } from '@supabase/supabase-js';
import './tree.css';
import './site.css';
import { startTree, refreshPanel } from './tree.js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const BUCKET = 'family-media';
const $ = id => document.getElementById(id);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 3200); }

// ---------- screens ----------
const gate = (...kids) => { $('app').hidden = true; $('gate').hidden = false; $('gateCard').replaceChildren(
  h('div', { class: 'gate-brand' }, h('span', { class: 'mark', 'aria-hidden': 'true' }), 'GoFamTree'), ...kids); };

if (!SB_URL || !SB_KEY) {
  gate(h('p', { class: 'gate-lead', text: 'The site isn’t connected to its database yet.' }),
    h('p', { class: 'gate-note', text: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the environment and rebuild.' }));
  throw new Error('Missing Supabase settings');
}
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });

// keep an invite token across the sign-in round trip
const params = new URLSearchParams(location.search);
try { if (params.get('invite')) localStorage.setItem('gft-invite', params.get('invite')); } catch (e) {}
try { if (params.get('request')) localStorage.setItem('gft-request', params.get('request')); } catch (e) {}
if (params.get('invite') || params.get('request')) history.replaceState(null, '', location.pathname + location.hash);
const pendingInvite = () => { try { return localStorage.getItem('gft-invite'); } catch (e) { return null; } };
const clearInvite = () => { try { localStorage.removeItem('gft-invite'); } catch (e) {} };

function signInScreen(note) {
  let mode = 'signin';
  const msg = h('p', { class: 'gate-msg', role: 'status' });
  const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'you@example.com', required: true });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Password', minlength: '8' });
  const name = h('input', { type: 'text', autocomplete: 'name', placeholder: 'Your full name' });
  const nameRow = h('label', { hidden: true }, 'Your name', name);
  const submit = h('button', { class: 'btn primary wide', type: 'submit', text: 'Sign in' });
  const swap = h('button', { type: 'button', class: 'linkish' });
  const setMode = m => { mode = m; nameRow.hidden = m !== 'signup'; submit.textContent = m === 'signup' ? 'Create account' : 'Sign in';
    pass.autocomplete = m === 'signup' ? 'new-password' : 'current-password';
    swap.textContent = m === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'; msg.textContent = ''; };
  swap.onclick = () => setMode(mode === 'signup' ? 'signin' : 'signup');
  setMode(pendingInvite() ? 'signup' : 'signin');
  const form = h('form', { class: 'gate-form' }, nameRow, h('label', null, 'Email', email), h('label', null, 'Password', pass), submit, msg);
  form.onsubmit = async e => {
    e.preventDefault(); submit.disabled = true; msg.textContent = '';
    try {
      if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email: email.value.trim(), password: pass.value,
          options: { data: { full_name: name.value.trim() }, emailRedirectTo: location.origin } });
        if (error) throw error;
        if (!data.session) msg.textContent = 'Check your email to confirm your account, then come back here.';
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
        if (error) throw error;
      }
    } catch (err) { msg.textContent = err.message || 'That didn’t work. Try again.'; }
    submit.disabled = false;
  };
  const magic = h('button', { type: 'button', class: 'btn wide', text: 'Email me a sign-in link', onclick: async () => {
    if (!email.value.trim()) { msg.textContent = 'Enter your email first.'; email.focus(); return; }
    const { error } = await sb.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: location.origin } });
    msg.textContent = error ? error.message : 'Sign-in link sent. Open it on this device.'; } });
  const google = h('button', { type: 'button', class: 'btn wide', text: 'Continue with Google', onclick: () =>
    sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } }) });
  gate(
    h('p', { class: 'gate-lead', text: note || 'A private family tree your whole family can explore and add to.' }),
    form, h('div', { class: 'gate-or' }, h('span', { text: 'or' })), magic, google, swap,
    h('p', { class: 'gate-note', text: 'Only people invited to a family can see it.' }));
}

// ---------- after sign-in ----------
let session = null, started = false;
sb.auth.onAuthStateChange((_ev, s) => {
  const was = session?.user?.id; session = s;
  if (!s) { if (started) location.reload(); else signInScreen(pendingInvite() ? 'You’ve been invited to a family tree. Create an account or sign in to open it.' : null); return; }
  if (s.user.id !== was && !started) setTimeout(enter, 0);
});

async function enter() {
  if (started) return; started = true;
  const uid = session.user.id;
  const inv = pendingInvite();
  if (inv) {
    const { data, error } = await sb.rpc('accept_invite', { invite_token: inv });
    clearInvite();
    if (error) toast(error.message.includes('no longer valid') ? 'That invite link was already used or has expired.' : 'Couldn’t accept the invite.');
    else try { localStorage.setItem('gft-family', data); } catch (e) {}
  }
  const { data: mems, error } = await sb.from('family_members').select('family_id, role, person_id, families(name)').eq('user_id', uid);
  if (error) { gate(h('p', { class: 'gate-lead', text: 'Couldn’t load your families.' }), h('p', { class: 'gate-note', text: error.message })); return; }
  if (!mems.length) return noFamily();
  let pick = null; try { pick = localStorage.getItem('gft-family'); } catch (e) {}
  const m = mems.find(x => x.family_id === pick) || mems[0];
  openFamily(m, mems);
}

function noFamily() {
  const name = h('input', { type: 'text', placeholder: 'e.g. The Garson Family', required: true });
  const msg = h('p', { class: 'gate-msg', role: 'status' });
  const form = h('form', { class: 'gate-form' }, h('label', null, 'Name your family tree', name),
    h('button', { class: 'btn primary wide', type: 'submit', text: 'Start a family tree' }), msg);
  form.onsubmit = async e => { e.preventDefault();
    const { data, error } = await sb.rpc('create_family', { family_name: name.value.trim() });
    if (error) { msg.textContent = error.message; return; }
    try { localStorage.setItem('gft-family', data); } catch (e) {}
    location.reload(); };
  gate(h('p', { class: 'gate-lead', text: 'You’re signed in as ' + session.user.email + '.' }),
    h('p', { class: 'gate-note', text: 'If a relative invited you, open the link they sent. Or start your own family’s tree:' }),
    form, h('button', { class: 'linkish', type: 'button', text: 'Sign out', onclick: () => sb.auth.signOut() }));
}

const rank = r => ({ viewer: 1, contributor: 2, editor: 3, owner: 4 }[r] || 0);

function openFamily(m, mems) {
  const uid = session.user.id, fid = m.family_id;
  try { localStorage.setItem('gft-family', fid); } catch (e) {}
  $('gate').hidden = true; $('app').hidden = false;
  $('brand').textContent = m.families?.name || 'Family Tree';
  document.title = (m.families?.name || 'Family Tree') + ' · GoFamTree';
  const canManage = rank(m.role) >= 3;
  $('familyBtn').hidden = !canManage;
  $('familyBtn').onclick = () => familyModal(fid, m.role);
  $('acctBtn').onclick = () => accountModal(m, mems);

  const media = makeMedia(fid);
  startTree({
    db: makeDb(fid, uid), assets: makeAssets(fid, media), downloads, dictation: makeDictation(),
    url: media.url, urlAsync: media.urlAsync, signAll: media.signAll,
    profiles: async ids => { const { data } = await sb.from('profiles').select('id, display_name').in('id', ids);
      return Object.fromEntries((data || []).map(p => [p.id, p.display_name || ''])); },
    canManage, canContribute: rank(m.role) >= 2, uid, myPersonId: m.person_id,
    addSelf: () => addSelf(fid, uid),
    contactActions: pid => contactActions(pid),
  });
  initContacts(fid, uid);
}

async function addSelf(fid, uid) {
  const meta = session.user.user_metadata || {};
  const name = (window.prompt('Your full name, as it should appear in the tree', meta.full_name || meta.name || '') || '').trim();
  if (!name) return;
  const id = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'me';
  const { error } = await sb.from('family_docs').insert({ family_id: fid, collection: 'people', doc_id: id, data: { name, parents: [] }, updated_by: uid });
  if (error) { toast('Couldn’t add you: ' + error.message); return; }
  await sb.from('family_members').update({ person_id: id }).eq('family_id', fid).eq('user_id', uid);
  location.hash = encodeURIComponent(id); location.reload();
}

// ---------- data layer: documents stored in family_docs ----------
function makeDb(fid, uid) {
  const listeners = new Set();
  const tbl = () => sb.from('family_docs');
  const snapOf = rows => ({ docs: rows.map(r => ({ id: r.doc_id, exists: true, data: () => r.data })), size: rows.length, empty: !rows.length });
  const docSnap = row => ({ id: row?.doc_id, exists: !!row, data: () => row ? row.data : undefined });
  const fail = error => { const e = new Error(error.message); e.code = error.code; return e; };

  function poke(coll) { for (const l of listeners) if (!coll || l.coll === coll) l.refresh(); }
  sb.channel('family-' + fid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'family_docs', filter: 'family_id=eq.' + fid },
      p => poke(p.new?.collection || p.old?.collection))
    .subscribe(status => { if (status === 'SUBSCRIBED') poke(); });
  // catch up after the tab sleeps
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poke(); });

  function listen(coll, docId, fetcher, cb, err) {
    let timer = null, alive = true;
    const run = async () => { try { const v = await fetcher(); if (alive) cb(v); } catch (e) { if (alive && err) err(e); } };
    const l = { coll, docId, refresh: () => { clearTimeout(timer); timer = setTimeout(run, 120); } };
    listeners.add(l); run();
    return () => { alive = false; listeners.delete(l); };
  }

  const collection = coll => ({
    async get() { const { data, error } = await tbl().select('doc_id, data').eq('family_id', fid).eq('collection', coll); if (error) throw fail(error); return snapOf(data); },
    onSnapshot(cb, err) { return listen(coll, null, () => this.get(), cb, err); },
    doc: id => doc(coll + '/' + id),
  });

  function doc(path) {
    const [coll, id] = path.split('/');
    const get = async () => { const { data, error } = await tbl().select('doc_id, data').eq('family_id', fid).eq('collection', coll).eq('doc_id', id).maybeSingle();
      if (error) throw fail(error); return docSnap(data); };
    return {
      id, get,
      async set(data) { const { error } = await tbl().upsert({ family_id: fid, collection: coll, doc_id: id, data, updated_by: uid, updated_at: new Date().toISOString() });
        if (error) throw fail(error); poke(coll); },
      async update(patch) { const { error } = await sb.rpc('merge_doc', { fam: fid, coll, did: id, patch });
        if (error) throw fail(error); poke(coll); },
      async delete() { const { error } = await tbl().delete().eq('family_id', fid).eq('collection', coll).eq('doc_id', id);
        if (error) throw fail(error); poke(coll); },
      onSnapshot(cb, err) { return listen(coll, id, get, cb, err); },
    };
  }
  return { collection, doc };
}

// ---------- photos, documents and recordings (Supabase Storage) ----------
// Media ids are storage paths: "<family id>/<random>.<ext>". Pages need signed links, made in batches.
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
function makeMedia(fid) {
  const cache = new Map(); // id -> {url, exp}
  let queue = new Set(), timer = null;
  const fresh = id => { const c = cache.get(id); return c && c.exp > Date.now() + 60e3 ? c.url : null; };
  const pathOf = id => id.includes('/') ? id : fid + '/' + id;
  async function sign(ids) {
    ids = [...new Set(ids)].filter(id => id && !fresh(id));
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { data } = await sb.storage.from(BUCKET).createSignedUrls(chunk.map(pathOf), 6 * 3600);
      (data || []).forEach((r, k) => { if (r.signedUrl) cache.set(chunk[k], { url: r.signedUrl, exp: Date.now() + 6 * 3600e3 }); });
    }
  }
  // swap placeholders already on the page for real links
  function patch() {
    for (const el of document.querySelectorAll('[data-gft-pending]')) el.removeAttribute('data-gft-pending');
    const tag = PIXEL + '#gft=';
    for (const el of document.querySelectorAll(`[src^="${PIXEL}#gft="], [style*="#gft="]`)) {
      if (el.getAttribute('src')?.startsWith(tag)) { const id = decodeURIComponent(el.getAttribute('src').slice(tag.length)); const u = fresh(id); if (u) el.src = u; }
      const st = el.getAttribute('style');
      if (st && st.includes('#gft=')) el.setAttribute('style', st.replace(/data:image\/gif;base64,[^"#)]+#gft=([^")]+)/g, (all, id) => fresh(decodeURIComponent(id)) || all));
    }
  }
  function url(id) {
    if (!id) return '';
    const u = fresh(id); if (u) return u;
    queue.add(id); clearTimeout(timer);
    timer = setTimeout(async () => { const ids = [...queue]; queue = new Set(); await sign(ids); patch(); }, 30);
    return PIXEL + '#gft=' + encodeURIComponent(id);
  }
  async function urlAsync(id) { if (!fresh(id)) await sign([id]); return fresh(id) || ''; }
  async function signAll(people) {
    const ids = [];
    for (const p of people.values()) {
      if (p.portrait) ids.push(p.portrait);
      for (const g of p.gallery || []) ids.push(g.id);
      for (const d of p.docs || []) if (d.assetId) ids.push(d.assetId);
      for (const s of p.stories || []) if (s.audioId) ids.push(s.audioId);
      for (const v of Object.values(p.photos || {})) if (typeof v === 'string') ids.push(v);
    }
    try { await sign(ids); } catch (e) {}
    patch();
  }
  const remember = (id, u) => cache.set(id, { url: u, exp: Date.now() + 6 * 3600e3 });
  return { url, urlAsync, signAll, remember, pathOf };
}

const OK_TYPES = /^(image\/|application\/pdf$|audio\/|video\/)/;
function makeAssets(fid, media) {
  return {
    async upload(file, opts = {}) {
      const type = opts.type || file.type || 'application/octet-stream';
      if (file.size > 50 * 1024 * 1024) throw Object.assign(new Error('too big'), { code: 'too_large' });
      if (!OK_TYPES.test(type)) throw Object.assign(new Error('type'), { code: 'unsupported_type' });
      const ext = ((file.name || '').split('.').pop() || type.split('/')[1] || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
      const id = `${fid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(id, file, { contentType: type, upsert: false });
      if (error) throw Object.assign(new Error(error.message), { code: /exceed|size/i.test(error.message) ? 'too_large' : 'upload_failed' });
      media.remember(id, URL.createObjectURL(file));
      return { id, url: media.url(id), sizeBytes: file.size, contentType: type };
    },
    async delete(id) { const { error } = await sb.storage.from(BUCKET).remove([media.pathOf(id)]); if (error) throw error; },
  };
}

const downloads = {
  async save({ filename, data }) {
    const u = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    const a = h('a', { href: u, download: filename || 'download' }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10e3);
  },
};

// speech-to-text for typing stories (Chrome, Edge, Safari)
function makeDictation() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  let rec = null; const fns = { partial: [], final: [], state: [] };
  const emit = (k, v) => fns[k].forEach(f => f(v));
  return {
    onPartial: f => { fns.partial = [f]; }, onFinal: f => { fns.final = [f]; }, onState: f => { fns.state = [f]; },
    start() {
      return new Promise((resolve, reject) => {
        rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = navigator.language || 'en-US';
        rec.onstart = () => { emit('state', { state: 'listening' }); resolve(); };
        rec.onresult = e => { let part = '';
          for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i];
            if (r.isFinal) emit('final', { text: r[0].transcript.trim() }); else part += r[0].transcript; }
          emit('partial', { text: part }); };
        rec.onerror = e => { if (e.error === 'not-allowed') reject(Object.assign(new Error('blocked'), { code: 'not_granted' })); };
        rec.onend = () => emit('state', { state: 'idle', reason: 'stopped' });
        try { rec.start(); } catch (e) { reject(e); }
      });
    },
    async stop() { try { rec?.stop(); } catch (e) {} },
  };
}

// ---------- modals: family members & invites, account ----------
function modal(...kids) {
  const m = $('modal'); $('modalCard').replaceChildren(
    h('button', { class: 'btn ghost small modal-x', text: 'Close', onclick: closeModal }), ...kids.filter(k => k != null && k !== false));
  m.hidden = false; m.onclick = e => { if (e.target === m) closeModal(); };
}
function closeModal() { $('modal').hidden = true; }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

const ROLE_HELP = {
  viewer: 'Can look around the tree.',
  contributor: 'Can suggest additions and photos, which you review.',
  editor: 'Can change the tree directly and review suggestions.',
  owner: 'Runs the family tree.',
};

async function familyModal(fid, myRole) {
  modal(h('h2', { text: 'Family members' }), h('p', { class: 'gate-note', text: 'Loading…' }));
  const [{ data: mems }, { data: invs }, { data: ppl }] = await Promise.all([
    sb.from('family_members').select('user_id, role, person_id').eq('family_id', fid),
    sb.from('invites').select('id, email, role, person_id, token, accepted_at, created_at').eq('family_id', fid).order('created_at', { ascending: false }),
    sb.from('family_docs').select('doc_id, data').eq('family_id', fid).eq('collection', 'people'),
  ]);
  const ids = (mems || []).map(m => m.user_id);
  const { data: profs } = ids.length ? await sb.from('profiles').select('id, display_name').in('id', ids) : { data: [] };
  const pname = Object.fromEntries((profs || []).map(p => [p.id, p.display_name]));
  const people = (ppl || []).map(p => ({ id: p.doc_id, name: p.data?.name || p.doc_id })).sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = pid => people.find(p => p.id === pid)?.name;
  const isOwner = myRole === 'owner';

  const roleSel = (val, max) => h('select', null, ...['viewer', 'contributor', 'editor', ...(max === 'owner' ? ['owner'] : [])]
    .map(r => h('option', { value: r, selected: r === val }, r[0].toUpperCase() + r.slice(1))));

  const memberRows = (mems || []).sort((a, b) => rank(b.role) - rank(a.role)).map(m => {
    const me = m.user_id === session.user.id;
    const who = h('div', { class: 'm-who' }, h('strong', { text: (pname[m.user_id] || 'Member') + (me ? ' (you)' : '') }),
      h('span', { class: 'm-sub', text: nameOf(m.person_id) ? 'In the tree as ' + nameOf(m.person_id) : 'Not linked to a person yet' }));
    if (!isOwner || me || m.role === 'owner') return h('div', { class: 'm-row' }, who, h('span', { class: 'm-role', text: m.role }));
    const sel = roleSel(m.role);
    sel.onchange = async () => { const { error } = await sb.from('family_members').update({ role: sel.value }).eq('family_id', fid).eq('user_id', m.user_id);
      toast(error ? 'Couldn’t change it' : 'Updated'); };
    const rm = h('button', { class: 'btn small danger', text: 'Remove', onclick: async e => {
      if (e.target.dataset.armed !== '1') { e.target.dataset.armed = '1'; e.target.textContent = 'Tap again to remove'; return; }
      const { error } = await sb.from('family_members').delete().eq('family_id', fid).eq('user_id', m.user_id);
      if (error) toast('Couldn’t remove them'); else familyModal(fid, myRole); } });
    return h('div', { class: 'm-row' }, who, sel, rm);
  });

  // new invite
  const email = h('input', { type: 'email', placeholder: 'their@email.com', required: true });
  const role = roleSel('contributor');
  const help = h('p', { class: 'm-sub', text: ROLE_HELP.contributor });
  role.onchange = () => help.textContent = ROLE_HELP[role.value];
  const person = h('select', null, h('option', { value: '' }, 'Choose who they are (optional)'), ...people.map(p => h('option', { value: p.id }, p.name)));
  const out = h('div');
  const form = h('form', { class: 'gate-form' }, h('label', null, 'Email', email), h('label', null, 'Access', role), help,
    h('label', null, 'Who they are in the tree', person),
    h('button', { class: 'btn primary', type: 'submit', text: 'Create invite link' }), out);
  form.onsubmit = async e => { e.preventDefault();
    const { data, error } = await sb.from('invites').insert({ family_id: fid, email: email.value.trim().toLowerCase(), role: role.value,
      person_id: person.value || null, invited_by: session.user.id }).select('token').single();
    if (error) { out.replaceChildren(h('p', { class: 'gate-msg', text: error.message })); return; }
    out.replaceChildren(linkBox(inviteUrl(data.token), 'Send this link to ' + email.value.trim() + '. It works once.'));
  };

  const openInv = (invs || []).filter(i => !i.accepted_at);
  modal(
    h('h2', { text: 'Family members' }),
    h('div', { class: 'm-list' }, memberRows),
    h('h3', { text: 'Invite a relative' }), form,
    openInv.length ? h('h3', { text: 'Invites not used yet' }) : null,
    openInv.length ? h('div', { class: 'm-list' }, openInv.map(i => h('div', { class: 'm-row' },
      h('div', { class: 'm-who' }, h('strong', { text: i.email }), h('span', { class: 'm-sub', text: i.role + (nameOf(i.person_id) ? ' · ' + nameOf(i.person_id) : '') })),
      h('button', { class: 'btn small', text: 'Copy link', onclick: () => copy(inviteUrl(i.token)) }),
      h('button', { class: 'btn small danger', text: 'Cancel', onclick: async () => { await sb.from('invites').delete().eq('id', i.id); familyModal(fid, myRole); } })))) : null,
  );
}
const inviteUrl = t => location.origin + '/?invite=' + t;
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Link copied'); } catch (e) { window.prompt('Copy this link', text); } }
function linkBox(url, note) {
  const inp = h('input', { type: 'text', readonly: true, value: url, onclick: e => e.target.select() });
  return h('div', { class: 'linkbox' }, h('p', { class: 'm-sub', text: note }), h('div', { class: 'row' }, inp, h('button', { type: 'button', class: 'btn', text: 'Copy', onclick: () => copy(url) })));
}

function accountModal(m, mems) {
  const switcher = mems.length > 1 ? h('label', null, 'Family tree', (() => { const s = h('select', null, ...mems.map(x =>
    h('option', { value: x.family_id, selected: x.family_id === m.family_id }, x.families?.name || 'Family')));
    s.onchange = () => { try { localStorage.setItem('gft-family', s.value); } catch (e) {} location.reload(); }; return s; })()) : null;
  modal(h('h2', { text: 'Account' }),
    h('p', { class: 'm-sub', text: 'Signed in as ' + session.user.email + ' · ' + m.role }),
    switcher,
    h('div', { class: 'row', style: 'margin-top:14px;gap:8px;display:flex;flex-wrap:wrap' },
      h('button', { class: 'btn', text: 'My contact info', onclick: () => myContactModal() }),
      h('button', { class: 'btn', text: 'Sign out', onclick: () => sb.auth.signOut() })));
}

// ---------- contact requests ----------
// Members' phone, email and address stay private. A relative asks to exchange contact info;
// the other person gets an email from GoFamTree and picks what (if anything) to share back.
const CR = { fid: null, uid: null, members: new Map(), reqs: [], mine: null, names: new Map() };
const FIELDS = [['email', 'Email', 'email'], ['phone', 'Phone', 'tel'], ['address', 'Mailing address', 'text']];

async function initContacts(fid, uid) {
  CR.fid = fid; CR.uid = uid;
  await loadContacts();
  sb.channel('requests-' + uid).on('postgres_changes', { event: '*', schema: 'public', table: 'contact_requests' },
    () => loadContacts().then(refreshPanel)).subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadContacts().then(refreshPanel); });
  refreshPanel();
  let rid = null; try { rid = localStorage.getItem('gft-request'); localStorage.removeItem('gft-request'); } catch (e) {}
  if (rid) openRequestLink(rid);
}
async function loadContacts() {
  const [{ data: mems }, { data: reqs }] = await Promise.all([
    sb.from('family_members').select('user_id, person_id').eq('family_id', CR.fid),
    sb.from('contact_requests').select('*').eq('family_id', CR.fid).order('created_at', { ascending: false }),
  ]);
  CR.members = new Map((mems || []).filter(m => m.person_id).map(m => [m.person_id, m.user_id]));
  CR.reqs = reqs || [];
}
const personOfUser = u => [...CR.members].find(([, v]) => v === u)?.[0];
async function displayName(userId) {
  if (CR.names.has(userId)) return CR.names.get(userId);
  let name = '';
  const pid = personOfUser(userId);
  if (pid) { const { data } = await sb.from('family_docs').select('data').eq('family_id', CR.fid).eq('collection', 'people').eq('doc_id', pid).maybeSingle(); name = data?.data?.name || ''; }
  if (!name) { const { data } = await sb.from('profiles').select('display_name').eq('id', userId).maybeSingle(); name = data?.display_name || 'A family member'; }
  CR.names.set(userId, name); return name;
}
const first = n => (n || '').split(' ')[0] || n;

async function myContact() {
  if (CR.mine) return CR.mine;
  const { data } = await sb.from('member_contacts').select('email, phone, address').eq('user_id', CR.uid).maybeSingle();
  let c = data || {};
  if (!data) { // first time: start from what's in the tree, if anything
    const pid = personOfUser(CR.uid);
    if (pid) { const { data: d } = await sb.from('family_docs').select('collection, data').eq('family_id', CR.fid).eq('doc_id', pid).in('collection', ['contacts', 'hiddencontacts']);
      const t = (d || [])[0]?.data || {};
      c = { email: t.email || '', phone: t.phone || '', address: [t.street, t.addr, t.zip].filter(Boolean).join(', ') }; }
    if (!c.email) c.email = session.user.email;
  }
  return (CR.mine = c);
}
async function saveMyContact(c) {
  CR.mine = c;
  await sb.from('member_contacts').upsert({ user_id: CR.uid, ...c, updated_at: new Date().toISOString() });
}

// what someone has shared with me, from any accepted request in either direction
function sharedBy(otherUid) {
  const out = {};
  for (const r of CR.reqs) {
    if (r.status === 'accepted' && r.from_user === CR.uid && r.to_user === otherUid) Object.assign(out, r.shared || {});
    if (r.status === 'accepted' && r.from_user === otherUid && r.to_user === CR.uid) Object.assign(out, r.offered || {});
  }
  return out;
}
function infoList(c) {
  const rows = FIELDS.filter(([k]) => c[k]).map(([k, label]) => h('div', { class: 'cr-line' }, h('span', { class: 'm-sub', text: label }), h('span', { text: c[k] }),
    h('button', { type: 'button', class: 'btn ghost small', text: 'Copy', onclick: () => copy(c[k]) })));
  return rows.length ? h('div', { class: 'cr-info' }, rows) : null;
}

function contactActions(pid) {
  const other = CR.members.get(pid);
  if (!CR.uid || !other) return null;
  const box = h('div', { class: 'cr-box' });
  if (other === CR.uid) {
    box.append(h('p', { class: 'm-sub', text: 'Your email, phone and address stay private. Relatives can ask to exchange contact info, and you choose what to share.' }),
      h('button', { class: 'btn small', text: 'My contact info', onclick: () => myContactModal() }));
    return box;
  }
  const incoming = CR.reqs.find(r => r.status === 'pending' && r.from_user === other && r.to_user === CR.uid);
  const outgoing = CR.reqs.find(r => r.status === 'pending' && r.from_user === CR.uid && r.to_user === other);
  const shared = sharedBy(other);
  const list = infoList(shared);
  if (list) box.append(h('p', { class: 'm-sub', text: 'Shared with you' }), list);
  if (incoming) box.append(h('p', { class: 'cr-note', text: 'They asked to exchange contact info with you.' }),
    h('button', { class: 'btn primary small', text: 'Respond', onclick: () => respondModal(incoming) }));
  else if (outgoing) box.append(h('p', { class: 'm-sub', text: 'Request sent. They’ll get an email and choose what to share.' }),
    h('button', { class: 'btn ghost small', text: 'Withdraw request', onclick: async () => {
      await sb.from('contact_requests').delete().eq('id', outgoing.id); await loadContacts(); refreshPanel(); toast('Request withdrawn'); } }));
  else box.append(h('button', { class: 'btn small', text: list ? 'Ask for more contact info' : 'Ask to exchange contact info', onclick: () => requestModal(pid, other) }));
  return box;
}

// checkboxes + editable fields for what I'm willing to share
function shareFields(mine, defaults) {
  const rows = FIELDS.map(([k, label, type]) => {
    const cb = h('input', { type: 'checkbox', checked: !!(defaults[k] && mine[k]) });
    const inp = type === 'text' ? h('textarea', { rows: '2', placeholder: 'Street, city, state, ZIP' }) : h('input', { type, placeholder: label });
    inp.value = mine[k] || ''; inp.oninput = () => { cb.checked = !!inp.value.trim(); };
    return { k, cb, inp, el: h('div', { class: 'cr-field' }, h('label', { class: 'check' }, cb, label), inp) };
  });
  const read = () => { const share = {}, all = {}; for (const r of rows) { const v = r.inp.value.trim(); all[r.k] = v; if (r.cb.checked && v) share[r.k] = v; } return { share, all }; };
  return { el: h('div', { class: 'cr-fields' }, rows.map(r => r.el)), read };
}

async function requestModal(pid, other) {
  const name = await displayName(other);
  const mine = await myContact();
  const sf = shareFields(mine, { email: true, phone: true });
  const note = h('textarea', { rows: '3', maxlength: '500', placeholder: 'Add a note (optional), e.g. “It’s your cousin Chad. Would love to catch up!”' });
  const send = h('button', { class: 'btn primary', type: 'submit', text: 'Send request' });
  const form = h('form', { class: 'gate-form' },
    h('p', { class: 'gate-note', text: `${first(name)} will get an email from GoFamTree asking to exchange contact info. They choose what to share back, or decline.` }),
    h('label', null, 'Note', note),
    h('h3', { text: 'What you’ll share with ' + first(name) }), sf.el,
    h('p', { class: 'm-sub', text: 'They see this only if they accept.' }), send);
  form.onsubmit = async e => { e.preventDefault(); send.disabled = true;
    const { share, all } = sf.read(); await saveMyContact(all);
    const { data, error } = await sb.from('contact_requests').insert({ family_id: CR.fid, to_user: other, note: note.value.trim() || null, offered: share }).select('id').single();
    if (error) { toast(error.message.includes('one_open') ? 'You already have a request waiting with them.' : error.message); send.disabled = false; return; }
    const { error: mailErr } = await sb.functions.invoke('contact-email', { body: { request_id: data.id, kind: 'request' } });
    closeModal(); await loadContacts(); refreshPanel();
    toast(mailErr ? 'Request saved. They’ll see it next time they sign in.' : 'Request sent to ' + first(name));
  };
  modal(h('h2', { text: 'Contact ' + name }), form);
}

async function respondModal(r) {
  const name = await displayName(r.from_user);
  const mine = await myContact();
  const sf = shareFields(mine, { email: true });
  const msg = h('p', { class: 'gate-msg', role: 'status' });
  const answer = async accept => {
    const { share, all } = sf.read();
    if (accept && !Object.keys(share).length) { msg.textContent = 'Check at least one thing to share, or decline.'; return; }
    await saveMyContact(all);
    const { error } = await sb.rpc('respond_contact_request', { req: r.id, accept, share: accept ? share : null });
    if (error) { msg.textContent = error.message; return; }
    if (accept) await sb.functions.invoke('contact-email', { body: { request_id: r.id, kind: 'response' } });
    closeModal(); await loadContacts(); refreshPanel();
    toast(accept ? 'Shared with ' + first(name) : 'Declined. They won’t see any of your info.');
  };
  modal(h('h2', { text: name + ' would like to exchange contact info' }),
    r.note ? h('blockquote', { class: 'cr-quote', text: r.note }) : null,
    h('h3', { text: 'Choose what to share with ' + first(name) }), sf.el,
    h('p', { class: 'm-sub', text: 'Only ' + first(name) + ' will see what you check. Nothing is shared if you decline.' }), msg,
    h('div', { class: 'row', style: 'display:flex;gap:8px;flex-wrap:wrap' },
      h('button', { class: 'btn primary', text: 'Accept and share', onclick: () => answer(true) }),
      h('button', { class: 'btn', text: 'Decline', onclick: () => answer(false) })),
    Object.keys(r.offered || {}).length ? h('p', { class: 'm-sub', text: `If you accept, you’ll also see what ${first(name)} offered to share.` }) : null);
}

async function myContactModal() {
  const mine = await myContact();
  const inputs = FIELDS.map(([k, label, type]) => { const i = type === 'text' ? h('textarea', { rows: '2' }) : h('input', { type }); i.value = mine[k] || ''; return [k, label, i]; });
  const form = h('form', { class: 'gate-form' },
    h('p', { class: 'gate-note', text: 'Kept private. It fills in automatically when you accept a contact request, and you still choose each time what to share.' }),
    ...inputs.map(([, label, i]) => h('label', null, label, i)),
    h('button', { class: 'btn primary', type: 'submit', text: 'Save' }));
  form.onsubmit = async e => { e.preventDefault(); await saveMyContact(Object.fromEntries(inputs.map(([k, , i]) => [k, i.value.trim()]))); closeModal(); toast('Saved'); };
  modal(h('h2', { text: 'My contact info' }), form);
}

async function openRequestLink(id) {
  const { data: r } = await sb.from('contact_requests').select('*').eq('id', id).maybeSingle();
  if (!r) { toast('That request is no longer available.'); return; }
  if (r.family_id !== CR.fid) { try { localStorage.setItem('gft-family', r.family_id); localStorage.setItem('gft-request', id); } catch (e) {} location.reload(); return; }
  const otherPid = personOfUser(r.to_user === CR.uid ? r.from_user : r.to_user);
  if (otherPid) location.hash = encodeURIComponent(otherPid);
  if (r.to_user === CR.uid && r.status === 'pending') respondModal(r);
  else if (r.to_user === CR.uid) toast('You already answered this request.');
  else if (r.status === 'accepted') toast('They shared their contact info. It’s on their page.');
  else if (r.status === 'pending') toast('Still waiting for them to answer.');
}
