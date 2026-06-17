// ============================================================
// DATABASE LAYER — wraps Supabase calls
// Falls back to localStorage when Supabase is not configured.
// ============================================================

const DB = (() => {
  let sb = null;
  let useLocal = true;
  let _schoolsCache = null;

  async function init() {
    if (!useLocal) return true; // already initialized
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
    if (typeof supabase === 'undefined') {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
          s.onload = resolve;
          s.onerror = () => reject(new Error('Supabase CDN failed to load'));
          document.head.appendChild(s);
        });
      } catch (e) {
        console.warn('Supabase CDN unavailable, using localStorage:', e);
        return false;
      }
    }
    try {
      sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      useLocal = false;
      return true;
    } catch (e) {
      console.warn('Supabase init failed, using localStorage:', e);
      return false;
    }
  }

  // ---- localStorage helpers ----
  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem('dwd_' + key) || '[]'); } catch { return []; }
  }
  function lsSet(key, val) { localStorage.setItem('dwd_' + key, JSON.stringify(val)); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function now() { return new Date().toISOString(); }

  // ---- Generic CRUD for localStorage ----
  function lsInsert(table, row) {
    const rows = lsGet(table);
    row.id = row.id || newId();
    row.created_at = row.created_at || now();
    rows.push(row);
    lsSet(table, rows);
    return { data: row, error: null };
  }
  function lsUpdate(table, id, changes) {
    const rows = lsGet(table);
    const idx = rows.findIndex(r => r.id === id);
    if (idx === -1) return { data: null, error: 'Not found' };
    rows[idx] = { ...rows[idx], ...changes, updated_at: now() };
    lsSet(table, rows);
    return { data: rows[idx], error: null };
  }
  function lsDelete(table, id) {
    const rows = lsGet(table).filter(r => r.id !== id);
    lsSet(table, rows);
    return { error: null };
  }
  function lsAll(table) { return { data: lsGet(table), error: null }; }

  // ============================================================
  // SCHOOLS
  // ============================================================
  async function getSchools() {
    if (_schoolsCache) return { data: _schoolsCache, error: null };
    if (useLocal) {
      const data = lsGet('schools');
      if (data.length) _schoolsCache = data;
      return { data, error: null };
    }
    const { data, error } = await sb.from('schools').select('*').order('name');
    if (!error && data) { _schoolsCache = data; lsSet('schools', data); }
    return { data: data || [], error };
  }
  async function upsertSchool(school) {
    _schoolsCache = null;
    if (useLocal) {
      const rows = lsGet('schools');
      const idx = rows.findIndex(r => r.id === school.id);
      if (idx > -1) { rows[idx] = { ...rows[idx], ...school }; lsSet('schools', rows); return { data: rows[idx], error: null }; }
      return lsInsert('schools', school);
    }
    const { data, error } = await sb.from('schools').upsert(school).select().single();
    return { data, error };
  }
  async function deleteSchool(id) {
    _schoolsCache = null;
    if (useLocal) return lsDelete('schools', id);
    const { error } = await sb.from('schools').delete().eq('id', id);
    return { error };
  }

  // ============================================================
  // DISBURSEMENTS (MOOE monitoring)
  // ============================================================
  async function getDisbursements(filters = {}) {
    if (useLocal) {
      let rows = lsGet('disbursements');
      if (filters.school_id) rows = rows.filter(r => r.school_id === filters.school_id);
      if (filters.year) rows = rows.filter(r => r.ada_date && r.ada_date.startsWith(filters.year));
      if (filters.status) rows = rows.filter(r => r.status === filters.status);
      return { data: rows, error: null };
    }
    let q = sb.from('disbursements').select('*, schools(name, short_name)').order('ada_date', { ascending: false });
    if (filters.school_id) q = q.eq('school_id', filters.school_id);
    if (filters.year) q = q.gte('ada_date', filters.year + '-01-01').lte('ada_date', filters.year + '-12-31');
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    return { data, error };
  }
  async function upsertDisbursement(row) {
    if (useLocal) {
      const rows = lsGet('disbursements');
      const idx = rows.findIndex(r => r.id === row.id);
      if (idx > -1) { rows[idx] = { ...rows[idx], ...row, updated_at: now() }; lsSet('disbursements', rows); return { data: rows[idx], error: null }; }
      return lsInsert('disbursements', row);
    }
    const { data, error } = await sb.from('disbursements').upsert(row).select().single();
    return { data, error };
  }
  async function deleteDisbursement(id) {
    if (useLocal) return lsDelete('disbursements', id);
    const { error } = await sb.from('disbursements').delete().eq('id', id);
    return { error };
  }

  // ============================================================
  // CDR HEADERS
  // ============================================================
  async function getCDRHeaders(filters = {}) {
    if (useLocal) {
      let rows = lsGet('cdr_headers');
      if (filters.school_id) rows = rows.filter(r => r.school_id === filters.school_id);
      if (filters.year) rows = rows.filter(r => r.year == filters.year);
      return { data: rows, error: null };
    }
    let q = sb.from('cdr_headers').select('*, schools(name, short_name, school_head, designation)').order('created_at', { ascending: false });
    if (filters.school_id) q = q.eq('school_id', filters.school_id);
    if (filters.year) q = q.eq('year', filters.year);
    const { data, error } = await q;
    return { data, error };
  }
  async function getCDRHeader(id) {
    if (useLocal) {
      const row = lsGet('cdr_headers').find(r => r.id === id);
      return { data: row || null, error: row ? null : 'Not found' };
    }
    const { data, error } = await sb.from('cdr_headers').select('*, schools(*)').eq('id', id).single();
    return { data, error };
  }
  async function upsertCDRHeader(row) {
    if (useLocal) {
      const rows = lsGet('cdr_headers');
      const idx = rows.findIndex(r => r.id === row.id);
      if (idx > -1) { rows[idx] = { ...rows[idx], ...row }; lsSet('cdr_headers', rows); return { data: rows[idx], error: null }; }
      return lsInsert('cdr_headers', row);
    }
    const { data, error } = await sb.from('cdr_headers').upsert(row).select().single();
    return { data, error };
  }
  async function deleteCDRHeader(id) {
    if (useLocal) {
      lsDelete('cdr_headers', id);
      // also delete entries
      const entries = lsGet('cdr_entries').filter(e => e.cdr_id !== id);
      lsSet('cdr_entries', entries);
      return { error: null };
    }
    const { error } = await sb.from('cdr_headers').delete().eq('id', id);
    return { error };
  }

  // ============================================================
  // CDR ENTRIES
  // ============================================================
  async function getCDREntries(cdr_id) {
    if (useLocal) {
      const rows = lsGet('cdr_entries').filter(r => r.cdr_id === cdr_id).sort((a, b) => a.sort_order - b.sort_order || a.entry_date.localeCompare(b.entry_date));
      return { data: rows, error: null };
    }
    const { data, error } = await sb.from('cdr_entries').select('*').eq('cdr_id', cdr_id).order('sort_order').order('entry_date');
    return { data, error };
  }
  async function getAllCDREntries() {
    if (useLocal) {
      const rows = lsGet('cdr_entries').sort((a, b) => (a.entry_date || '').localeCompare(b.entry_date || ''));
      return { data: rows, error: null };
    }
    const { data, error } = await sb.from('cdr_entries').select('*').order('entry_date');
    return { data, error };
  }
  async function upsertCDREntry(row) {
    if (useLocal) {
      const rows = lsGet('cdr_entries');
      const idx = rows.findIndex(r => r.id === row.id);
      if (idx > -1) { rows[idx] = { ...rows[idx], ...row }; lsSet('cdr_entries', rows); return { data: rows[idx], error: null }; }
      return lsInsert('cdr_entries', row);
    }
    const { data, error } = await sb.from('cdr_entries').upsert(row).select().single();
    return { data, error };
  }
  async function deleteCDREntry(id) {
    if (useLocal) return lsDelete('cdr_entries', id);
    const { error } = await sb.from('cdr_entries').delete().eq('id', id);
    return { error };
  }

  // ============================================================
  // BANK RECONCILIATION
  // ============================================================
  async function getBankRecon(filters = {}) {
    if (useLocal) {
      let rows = lsGet('bank_recon');
      if (filters.school_id) rows = rows.filter(r => r.school_id === filters.school_id);
      if (filters.year) rows = rows.filter(r => r.year == filters.year);
      if (filters.bank) rows = rows.filter(r => r.bank === filters.bank);
      return { data: rows, error: null };
    }
    let q = sb.from('bank_reconciliation').select('*, schools(name, short_name)');
    if (filters.school_id) q = q.eq('school_id', filters.school_id);
    if (filters.year) q = q.eq('year', filters.year);
    if (filters.bank) q = q.eq('bank', filters.bank);
    const { data, error } = await q;
    return { data, error };
  }
  async function upsertBankRecon(row) {
    if (useLocal) {
      const rows = lsGet('bank_recon');
      const idx = rows.findIndex(r => r.school_id === row.school_id && r.bank === row.bank && r.year == row.year && r.month == row.month);
      if (idx > -1) { rows[idx] = { ...rows[idx], ...row }; lsSet('bank_recon', rows); return { data: rows[idx], error: null }; }
      return lsInsert('bank_recon', row);
    }
    const { data, error } = await sb.from('bank_reconciliation').upsert(row, { onConflict: 'school_id,bank,year,month' }).select().single();
    return { data, error };
  }

  // ============================================================
  // RESOURCES
  // ============================================================
  async function getResources(filters = {}) {
    if (useLocal) {
      let rows = lsGet('resources');
      if (filters.category) rows = rows.filter(r => r.category === filters.category);
      return { data: rows, error: null };
    }
    let q = sb.from('resources').select('*').order('created_at', { ascending: false });
    if (filters.category) q = q.eq('category', filters.category);
    const { data, error } = await q;
    return { data, error };
  }
  async function upsertResource(row) {
    if (useLocal) {
      const rows = lsGet('resources');
      const idx = rows.findIndex(r => r.id === row.id);
      if (idx > -1) { rows[idx] = { ...rows[idx], ...row }; lsSet('resources', rows); return { data: rows[idx], error: null }; }
      return lsInsert('resources', row);
    }
    const { data, error } = await sb.from('resources').upsert(row).select().single();
    return { data, error };
  }
  async function deleteResource(id) {
    if (useLocal) return lsDelete('resources', id);
    const { error } = await sb.from('resources').delete().eq('id', id);
    return { error };
  }

  // ============================================================
  // FUND TYPES (localStorage only)
  // ============================================================
  // CANCELLED CHECKS
  // ============================================================
  async function getCancelledChecks(filters = {}) {
    if (useLocal) {
      let rows = lsGet('cancelled_checks');
      if (filters.school_id) rows = rows.filter(r => r.school_id === filters.school_id);
      rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return { data: rows, error: null };
    }
    let q = sb.from('cancelled_checks').select('*').order('date', { ascending: false });
    if (filters.school_id) q = q.eq('school_id', filters.school_id);
    const { data, error } = await q;
    return { data: data || [], error };
  }
  async function upsertCancelledCheck(row) {
    if (useLocal) {
      const rows = lsGet('cancelled_checks');
      const idx  = rows.findIndex(r => r.id === row.id);
      if (idx > -1) { rows[idx] = { ...rows[idx], ...row }; lsSet('cancelled_checks', rows); return { data: rows[idx], error: null }; }
      return lsInsert('cancelled_checks', row);
    }
    const { data, error } = await sb.from('cancelled_checks').upsert(row).select().single();
    return { data, error };
  }
  async function deleteCancelledCheck(id) {
    if (useLocal) return lsDelete('cancelled_checks', id);
    const { error } = await sb.from('cancelled_checks').delete().eq('id', id);
    return { error };
  }

  // ============================================================
  // APP USERS — school accounts stored in Supabase (auto-synced)
  // ============================================================
  function _userToRow(u) {
    return { id: u.id, username: u.username, password_hash: u.passwordHash, role: u.role || 'school', school_id: u.school_id, school_name: u.school_name };
  }
  function _rowToUser(r) {
    return { id: r.id, username: r.username, passwordHash: r.password_hash, role: r.role, school_id: r.school_id, school_name: r.school_name };
  }
  async function getAppUsers() {
    if (useLocal) {
      try {
        const stored = localStorage.getItem('dwd_users');
        if (stored) return { data: JSON.parse(stored).filter(u => u.role === 'school'), error: null };
      } catch {}
      return { data: [], error: null };
    }
    const { data, error } = await sb.from('app_users').select('*');
    return { data: (data || []).map(_rowToUser), error };
  }
  async function upsertAppUser(user) {
    if (useLocal) {
      const stored = localStorage.getItem('dwd_users');
      let users = [];
      try { users = stored ? JSON.parse(stored) : []; } catch {}
      const idx = users.findIndex(u => u.id === user.id);
      if (idx > -1) users[idx] = { ...users[idx], ...user };
      else users.push(user);
      localStorage.setItem('dwd_users', JSON.stringify(users));
      return { data: user, error: null };
    }
    const { data, error } = await sb.from('app_users').upsert(_userToRow(user)).select().single();
    return { data: data ? _rowToUser(data) : null, error };
  }
  async function deleteAppUser(id) {
    if (useLocal) {
      const stored = localStorage.getItem('dwd_users');
      let users = [];
      try { users = stored ? JSON.parse(stored) : []; } catch {}
      localStorage.setItem('dwd_users', JSON.stringify(users.filter(u => u.id !== id)));
      return { error: null };
    }
    const { error } = await sb.from('app_users').delete().eq('id', id);
    return { error };
  }

  // ============================================================
  const DEFAULT_FUND_TYPES = [
    { id: 'ft_mooe_q1',    name: '1st Quarter MOOE',                                    category: 'mooe'    },
    { id: 'ft_mooe_q2',    name: '2nd Quarter MOOE',                                    category: 'mooe'    },
    { id: 'ft_mooe_q3',    name: '3rd Quarter MOOE',                                    category: 'mooe'    },
    { id: 'ft_mooe_q4',    name: '4th Quarter MOOE',                                    category: 'mooe'    },
    { id: 'ft_mooe_add',   name: 'Additional MOOE',                                     category: 'mooe'    },
    { id: 'ft_sf_water',   name: 'LBP Water Testing',                                   category: 'special' },
    { id: 'ft_sf_dbpnut',  name: 'DBP-Nutribun',                                        category: 'special' },
    { id: 'ft_sf_lbpnut',  name: 'LBP-Nutribun',                                        category: 'special' },
    { id: 'ft_sf_dbpmilk', name: 'DBP-SBFP Milk',                                       category: 'special' },
    { id: 'ft_sf_dbpnlc',  name: 'DBP-SBFP NLC',                                        category: 'special' },
    { id: 'ft_sf_lbpnlc',  name: 'LBP-SBFP NLC',                                        category: 'special' },
    { id: 'ft_sf_lbpmilk', name: 'LBP-SBFP Milk',                                       category: 'special' },
    { id: 'ft_sf_dbparal', name: 'DBP-ARAL Program',                                    category: 'special' },
    { id: 'ft_sf_lbppsf',  name: 'LBP-Special Needs Support PSF',                       category: 'special' },
    { id: 'ft_sf_lbparal', name: 'LBP ARAL Program',                                    category: 'special' },
    { id: 'ft_sf_dbphaul', name: 'DBP-Hauling of Textbooks',                            category: 'special' },
    { id: 'ft_sf_lbphaul', name: 'LBP-Hauling of Text',                                 category: 'special' },
    { id: 'ft_sf_lbpell',  name: 'LBP-ELLNA',                                           category: 'special' },
    { id: 'ft_sf_dbpell',  name: 'DBP-ELLNA',                                           category: 'special' },
    { id: 'ft_sf_lbplr',   name: 'LBP-Delivery Support Fund for LRs',                   category: 'special' },
    { id: 'ft_sf_lbplvl',  name: 'LBP-Delivery Support Fund (Leveled Reader Mini Book)', category: 'special' },
    { id: 'ft_sf_lbpemg',  name: 'LBP-Delivery Support Fund (Emergency Situation)',      category: 'special' },
    { id: 'ft_sf_milkop',  name: 'LBP-SBFP Milk Operational Expenses',                  category: 'special' },
  ];

  async function getFundTypes(category = '') {
    let rows = lsGet('fund_types');
    if (!rows.length) {
      lsSet('fund_types', DEFAULT_FUND_TYPES);
      rows = DEFAULT_FUND_TYPES;
    }
    if (category) rows = rows.filter(r => r.category === category);
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return { data: rows, error: null };
  }
  async function upsertFundType(row) {
    const rows = lsGet('fund_types');
    row.id = row.id || newId();
    const idx = rows.findIndex(r => r.id === row.id);
    if (idx > -1) { rows[idx] = { ...rows[idx], ...row }; lsSet('fund_types', rows); return { data: rows[idx], error: null }; }
    rows.push(row);
    lsSet('fund_types', rows);
    return { data: row, error: null };
  }
  async function deleteFundType(id) {
    return lsDelete('fund_types', id);
  }

  // ============================================================
  // UACS CODES (localStorage only)
  // ============================================================
  async function getUACS() {
    const saved = lsGet('uacs');
    if (saved.length) return { data: saved, error: null };
    const defaults = typeof UACS_CODES !== 'undefined'
      ? UACS_CODES.map(u => ({ id: u.code, code: u.code, desc: u.desc }))
      : [];
    return { data: defaults, error: null };
  }
  async function upsertUACS(row) {
    let rows = lsGet('uacs');
    if (!rows.length && typeof UACS_CODES !== 'undefined') {
      rows = UACS_CODES.map(u => ({ id: u.code, code: u.code, desc: u.desc }));
    }
    row.id = row.id || row.code || newId();
    const idx = rows.findIndex(r => r.id === row.id);
    if (idx > -1) { rows[idx] = { ...rows[idx], ...row }; lsSet('uacs', rows); return { data: rows[idx], error: null }; }
    rows.push(row);
    lsSet('uacs', rows);
    return { data: row, error: null };
  }

  // ============================================================
  // SUPABASE FILE UPLOAD (for PDFs)
  // ============================================================
  async function uploadFile(bucket, path, file) {
    if (!sb) return { url: null, error: 'Supabase not connected' };
    const { data, error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) return { url: null, error };
    const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path);
    return { url: urlData.publicUrl, error: null };
  }

  // ============================================================
  // DOWNLOADED FUNDS
  // ============================================================
  async function getFunds(filters = {}) {
    if (useLocal) {
      let rows = lsGet('funds');
      if (filters.school_id) rows = rows.filter(r => r.school_id === filters.school_id);
      if (filters.year)      rows = rows.filter(r => r.year == filters.year);
      if (filters.status)    rows = rows.filter(r => r.status === filters.status);
      rows.sort((a,b) => (a.ada_date||'').localeCompare(b.ada_date||''));
      return { data: rows, error: null };
    }
    let q = sb.from('downloaded_funds').select('*').order('ada_date');
    if (filters.school_id) q = q.eq('school_id', filters.school_id);
    if (filters.year)      q = q.eq('year', filters.year);
    if (filters.status)    q = q.eq('status', filters.status);
    const { data, error } = await q;
    // Write-through: cache the full unfiltered result for instant startup reads
    if (!error && data && !filters.school_id && !filters.year && !filters.status) {
      lsSet('funds', data);
    }
    return { data: data || [], error };
  }
  async function upsertFund(row) {
    if (useLocal) {
      const rows = lsGet('funds');
      const idx = rows.findIndex(r => r.id === row.id);
      if (idx > -1) { rows[idx] = { ...rows[idx], ...row }; lsSet('funds', rows); return { data: rows[idx], error: null }; }
      return lsInsert('funds', row);
    }
    const { data, error } = await sb.from('downloaded_funds').upsert(row).select().single();
    return { data, error };
  }
  async function deleteFund(id) {
    if (useLocal) return lsDelete('funds', id);
    const { error } = await sb.from('downloaded_funds').delete().eq('id', id);
    return { error };
  }

  // Fetch all key tables from Supabase and write to localStorage so the
  // next page load can read data instantly (before Supabase reconnects).
  async function preload() {
    if (useLocal) return;
    try {
      const [schoolsRes, fundsRes] = await Promise.all([
        sb.from('schools').select('*').order('name'),
        sb.from('downloaded_funds').select('*').order('ada_date'),
      ]);
      if (!schoolsRes.error && schoolsRes.data) { _schoolsCache = schoolsRes.data; lsSet('schools', schoolsRes.data); }
      if (!fundsRes.error && fundsRes.data) lsSet('funds', fundsRes.data);

      const [disbRes, cdrRes, cancelRes] = await Promise.all([
        sb.from('disbursements').select('*').order('ada_date', { ascending: false }),
        sb.from('cdr_headers').select('*, schools(name,short_name,school_head,designation)').order('created_at', { ascending: false }),
        sb.from('cancelled_checks').select('*').order('date', { ascending: false }),
      ]);
      if (!disbRes.error && disbRes.data) lsSet('disbursements', disbRes.data);
      if (!cdrRes.error && cdrRes.data) lsSet('cdr_headers', cdrRes.data);
      if (!cancelRes.error && cancelRes.data) lsSet('cancelled_checks', cancelRes.data);
    } catch (e) {
      console.warn('DB.preload:', e);
    }
  }

  return {
    init, isLocal: () => useLocal, preload,
    // schools
    getSchools, upsertSchool, deleteSchool,
    // disbursements
    getDisbursements, upsertDisbursement, deleteDisbursement,
    // cdr
    getCDRHeaders, getCDRHeader, upsertCDRHeader, deleteCDRHeader,
    getCDREntries, getAllCDREntries, upsertCDREntry, deleteCDREntry,
    // bank recon
    getBankRecon, upsertBankRecon,
    // resources
    getResources, upsertResource, deleteResource,
    // fund types
    getFundTypes, upsertFundType, deleteFundType,
    // uacs codes
    getUACS, upsertUACS,
    // downloaded funds
    getFunds, upsertFund, deleteFund,
    // cancelled checks
    getCancelledChecks, upsertCancelledCheck, deleteCancelledCheck,
    // app users
    getAppUsers, upsertAppUser, deleteAppUser,
    // files
    uploadFile,
    // helpers
    newId,
  };
})();
