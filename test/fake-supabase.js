// In-memory stand-in for Supabase, used only by the local smoke test.
const docs = window.__FAKE_DOCS__ || [];
const FID = 'fam-1', UID = 'user-1';
const session = { user: { id: UID, email: 'test@example.com', user_metadata: { full_name: 'Test' } } };
function q(table) {
  const f = []; let op = 'select', payload = null, single = false;
  const api = {
    select() { return api; }, eq(k, v) { f.push([k, v]); return api; }, in(k, v) { f.push([k, v, 'in']); return api; },
    order() { return api; }, maybeSingle() { single = true; return api; }, single() { single = true; return api; },
    insert(p) { op = 'insert'; payload = p; return api; }, upsert(p) { op = 'upsert'; payload = p; return api; },
    update(p) { op = 'update'; payload = p; return api; }, delete() { op = 'delete'; return api; },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); },
  };
  const match = r => f.every(([k, v, m]) => m === 'in' ? v.includes(r[k]) : r[k] === v);
  function run() {
    if (table === 'family_members') { const all = [{ family_id: FID, user_id: UID, role: window.__ROLE__ || 'owner', person_id: 'chad-garson', families: { name: 'Garson Family' } },
      { family_id: FID, user_id: 'user-2', role: 'contributor', person_id: 'scott-garson', families: { name: 'Garson Family' } }];
      return { data: f.some(([k]) => k === 'user_id') ? all.filter(match) : all }; }
    if (table === 'contact_requests') { const R = window.__REQS__ = window.__REQS__ || [];
      if (op === 'insert') { const r = { id: 'r' + R.length, from_user: UID, status: 'pending', ...payload }; R.push(r); return { data: r }; }
      if (op === 'delete') { for (let i = R.length - 1; i >= 0; i--) if (match(R[i])) R.splice(i, 1); return { data: null }; }
      const rows = R.filter(match); return { data: single ? rows[0] || null : rows }; }
    if (table === 'member_contacts') { if (op === 'upsert') { window.__MC__ = payload; return {}; } return { data: window.__MC__ || null }; }
    if (table === 'profiles') return { data: [] };
    if (table === 'invites') return { data: [] };
    if (op === 'select') { const rows = docs.filter(match); return { data: single ? rows[0] || null : rows }; }
    if (op === 'upsert' || op === 'insert') { const i = docs.findIndex(r => r.collection === payload.collection && r.doc_id === payload.doc_id); if (i >= 0) docs[i] = { ...docs[i], ...payload }; else docs.push(payload); return { data: null }; }
    if (op === 'delete') { for (let i = docs.length - 1; i >= 0; i--) if (match(docs[i])) docs.splice(i, 1); return { data: null }; }
    return { data: null };
  }
  return api;
}
export function createClient() {
  return {
    auth: { onAuthStateChange(cb) { setTimeout(() => cb('SIGNED_IN', session)); return { data: {} }; }, signOut() {} },
    from: q,
    functions: { invoke: async (n, o) => { (window.__MAIL__ = window.__MAIL__ || []).push(o.body); return {}; } },
    rpc: async (fn, a) => { if (fn === 'respond_contact_request') { const r = window.__REQS__.find(x => x.id === a.req); r.status = a.accept ? 'accepted' : 'declined'; r.shared = a.share; return {}; } if (fn === 'merge_doc') { const r = docs.find(x => x.collection === a.coll && x.doc_id === a.did); if (!r) return { error: { message: 'not_found' } }; r.data = { ...r.data, ...a.patch }; } return { data: null }; },
    channel: () => ({ on() { return this; }, subscribe(cb) { cb && cb('SUBSCRIBED'); return this; } }),
    storage: { from: () => ({ createSignedUrls: async paths => ({ data: paths.map(p => ({ signedUrl: '/fake/' + p })) }), upload: async () => ({}), remove: async () => ({}) }) },
  };
}
