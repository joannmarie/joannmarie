// ============================================================
// CASH DISBURSEMENT REGISTER VIEW  —  Appendix 43
// ============================================================
const CDRView = {
  _category: '',

  render(category = '') {
    this._category = category;
    this._schoolId = typeof Auth !== 'undefined' ? Auth.getSchoolId() : null;

    const schoolDropdown = this._schoolId
      ? `<select id="cdr-filter-school" class="form-select" disabled>
           <option value="${this._schoolId}">My School</option>
         </select>`
      : `<select id="cdr-filter-school" class="form-select" onchange="CDRView.load()">
           <option value="">All Schools</option>
         </select>`;

    const yearOpts = this._category === 'mooe'
      ? `<option value="">All Years</option><option value="2026">2026</option>`
      : `<option value="">All Years</option><option value="2026">2026</option><option value="2025">2025</option>`;

    return `
    <div class="section-card mb-4">
      <div class="section-card-header">
        <h3>Filters</h3>
      </div>
      <div class="section-card-body">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label class="form-label">School</label>
            ${schoolDropdown}
            </select>
          </div>
          <div>
            <label class="form-label">Year</label>
            <select id="cdr-filter-year" class="form-select" onchange="CDRView.load()">
              ${yearOpts}
            </select>
          </div>
          <div>
            <label class="form-label">Fund Type</label>
            <select id="cdr-filter-fundtype" class="form-select" onchange="CDRView.load()">
              <option value="">All Fund Types</option>
            </select>
          </div>
          <div class="flex items-end gap-2">
            <button class="btn btn-primary flex-1" onclick="CDRView.openCreate()">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              New CDR
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-header">
        <h3>CDR List</h3>
      </div>
      <div id="cdr-list-body" class="table-scroll">
        <div class="flex justify-center py-10"><div class="spinner"></div></div>
      </div>
    </div>
    `;
  },

  afterRender() { this._initView(); },

  async _initView() {
    const [schoolsRes, ftRes] = await Promise.all([
      DB.getSchools(),
      DB.getFundTypes(this._category),
    ]);
    this._schools = schoolsRes.data || [];

    // Populate school dropdown
    const schoolSel = document.getElementById('cdr-filter-school');
    if (schoolSel) {
      if (this._schoolId) {
        const s = this._schools.find(s => s.id === this._schoolId);
        if (s) schoolSel.innerHTML = `<option value="${this._schoolId}">${s.name}</option>`;
      } else {
        schoolSel.innerHTML = `<option value="">All Schools</option>` +
          this._schools.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      }
    }

    // Populate fund type dropdown
    const ftSel = document.getElementById('cdr-filter-fundtype');
    if (ftSel) ftSel.innerHTML = `<option value="">All Fund Types</option>` +
      (ftRes.data || []).map(t => `<option value="${t.name}">${t.name}</option>`).join('');

    this.load();
  },

  async load() {
    const school_id = this._schoolId || document.getElementById('cdr-filter-school')?.value || '';
    const year      = document.getElementById('cdr-filter-year')?.value || '';
    const fundType  = document.getElementById('cdr-filter-fundtype')?.value || '';

    const filters = {};
    if (school_id) filters.school_id = school_id;
    if (year)      filters.year = year;

    const [{ data }, { data: fundsData }] = await Promise.all([
      DB.getCDRHeaders(filters),
      DB.getFunds(school_id ? { school_id } : {}),
    ]);
    let rows = data || [];
    const funds = fundsData || [];

    const norm = s => (s || '').trim().toLowerCase();
    if (fundType) rows = rows.filter(r => norm(r.fund_type) === norm(fundType));
    if (this._category === 'mooe') {
      rows = rows.filter(r => DashboardView._isMOOE(r.fund_type) && parseInt(r.year) === 2026);
    } else if (this._category === 'special') {
      rows = rows.filter(r => !DashboardView._isMOOE(r.fund_type) && [2025, 2026].includes(parseInt(r.year)));
    }

    const el = document.getElementById('cdr-list-body');
    if (!el) return;

    if (!rows.length) {
      el.innerHTML = emptyState('No CDR records found. Create one using the "New CDR" button.');
      return;
    }

    const fundAmt = r => {
      const f = (r.fund_id && funds.find(f => f.id === r.fund_id))
             || funds.find(f => f.school_id === r.school_id && norm(f.fund_type) === norm(r.fund_type));
      return f ? parseFloat(f.amount) || 0 : 0;
    };

    const isSpecial = this._category === 'special';

    el.innerHTML = `
    <table class="data-table" style="table-layout:fixed;width:100%">
      <colgroup>
        <col style="width:200px"/>
        <col style="width:55px"/>
        <col style="width:180px"/>
        <col style="width:110px"/>
        <col style="width:60px"/>
        <col style="width:190px"/>
      </colgroup>
      <thead><tr>
        <th>School</th><th>Year</th>
        <th>Fund Type</th>
        <th class="col-amount">Fund Amount</th>
        <th class="text-center">Entries</th>
        <th>Actions</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
        <tr>
          <td class="font-medium" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._schoolName(r.school_id)}</td>
          <td>${r.year}</td>
          <td class="text-xs text-gray-600" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.fund_type || '—'}</td>
          <td class="col-amount font-semibold">${fmt(fundAmt(r))}</td>
          <td class="text-center text-xs text-gray-500">${r.entry_count || 0}</td>
          <td>
            <div class="flex gap-1">
              <button class="btn btn-secondary btn-sm" onclick="CDRView.showDetail('${r.id}')">View</button>
              <button class="btn btn-secondary btn-sm" onclick="CDRXlsx.download('${r.id}')">Excel</button>
              <button class="btn btn-danger btn-sm" onclick="CDRView.deleteHeader('${r.id}')">Del</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  },

  _schoolName(id) {
    const s = (this._schools || []).find(x => x.id === id);
    return s ? s.name : '—';
  },

  _getSchool(id) {
    return (this._schools || []).find(x => x.id === id) || {};
  },

  // ---- Create new CDR header ----
  async openCreate() {
    const schools = this._schools || [];
    const yr = new Date().getFullYear();
    const years = this._category === 'mooe' ? [2026] : [2026, 2025];

    const { data: ftData } = await DB.getFundTypes(this._category);
    const ftOpts = (ftData || []).map(t => `<option value="${t.name}">${t.name}</option>`).join('');

    const html = `
    <form id="cdr-create-form" onsubmit="CDRView.saveHeader(event)">
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div class="col-span-2">
          <label class="form-label">School *</label>
          ${this._schoolId
            ? `<select id="cdr-school" class="form-select" required>
                 <option value="${this._schoolId}">${schools.find(s => s.id === this._schoolId)?.name || 'My School'}</option>
               </select>`
            : `<select id="cdr-school" class="form-select" required>
                 <option value="">Select school…</option>
                 ${schools.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
               </select>`}
        </div>
        <div>
          <label class="form-label">Year *</label>
          <select id="cdr-year" class="form-select" required>
            ${years.map(y => `<option value="${y}" ${y === yr ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
        <div class="col-span-2">
          <label class="form-label">Fund Type</label>
          <select id="cdr-fund-type" class="form-select">
            <option value="">-- Select Fund Type --</option>
            ${ftOpts}
          </select>
        </div>
      </div>
      <div class="flex gap-2 justify-end">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create CDR</button>
      </div>
    </form>`;
    App.openModal('New Cash Disbursement Register', html);
  },

  async saveHeader(e) {
    e.preventDefault();
    const schoolId  = document.getElementById('cdr-school').value;
    const year      = parseInt(document.getElementById('cdr-year').value);
    const fundType  = document.getElementById('cdr-fund-type').value;

    const normalize = s => (s || '').trim().toLowerCase();

    // Duplicate check — block if same school + year + fund_type already exists
    const { data: existing } = await DB.getCDRHeaders({ school_id: schoolId, year });
    const duplicate = (existing || []).find(h => normalize(h.fund_type) === normalize(fundType));
    if (duplicate) {
      App.toast('A CDR for this school, year, and fund type already exists.', 'error');
      return;
    }

    const ordinal = { Q1: '1st', Q2: '2nd', Q3: '3rd', Q4: '4th' };

    // Find matching Fund Release for both MOOE and Special Funds
    const { data: funds } = await DB.getFunds({ school_id: schoolId });
    const matched = (funds || []).filter(f => normalize(f.fund_type) === normalize(fundType));
    matched.sort((a, b) => (b.ada_date || '').localeCompare(a.ada_date || ''));
    const matchingFund = matched[0] || null;

    // Auto-derive quarter from matching fund's fund_type name or ada_date
    let quarter = 'Q1';
    const src = matchingFund || null;
    if (src) {
      const ft = (src.fund_type || '').toLowerCase();
      if      (ft.includes('1st quarter')) quarter = 'Q1';
      else if (ft.includes('2nd quarter')) quarter = 'Q2';
      else if (ft.includes('3rd quarter')) quarter = 'Q3';
      else if (ft.includes('4th quarter')) quarter = 'Q4';
      else if (src.ada_date) {
        const mo = parseInt((src.ada_date || '').split('-')[1] || '1', 10);
        quarter = 'Q' + Math.ceil(mo / 3);
      }
    } else {
      const mo = new Date().getMonth() + 1;
      quarter = 'Q' + Math.ceil(mo / 3);
    }

    const row = {
      id:              DB.newId(),
      school_id:       schoolId,
      year,
      quarter,
      fund_type:       fundType,
      entry_count:     matchingFund ? 1 : 0,
    };

    const { error } = await DB.upsertCDRHeader(row);
    if (error) { App.toast('Error saving CDR: ' + (error?.message || error), 'error'); return; }

    if (matchingFund) {
      const particulars = this._category === 'mooe'
        ? `Operating Advances for ${ordinal[quarter] || quarter} Quarter`
        : `Operating Advances for ${fundType}`;

      await DB.upsertCDREntry({
        id:          DB.newId(),
        cdr_id:      row.id,
        entry_date:  matchingFund.ada_date,
        ref_no:      matchingFund.ada_no || '',
        particulars,
        uacs_code:   '',
        uacs_desc:   '',
        advances:    parseFloat(matchingFund.amount) || 0,
        payment:     0,
        sort_order:  Date.now(),
      });
    }

    App.closeModal();
    App.toast(matchingFund ? 'CDR created with first entry!' : 'CDR created! (No matching Fund Release found.)');
    await this.load();
  },

  async deleteHeader(id) {
    if (!confirm('Delete this CDR and all its entries?')) return;
    await DB.deleteCDRHeader(id);
    App.toast('CDR deleted.');
    await this.load();
  },

  // ---- Detail view (full-page, inline form) ----
  async showDetail(id) {
    this._detailId = id;
    const [headerRes, entriesRes] = await Promise.all([DB.getCDRHeader(id), DB.getCDREntries(id)]);
    const header = headerRes.data;
    const entries = entriesRes.data || [];
    this._detailEntries = entries;
    this._detailHeader  = header;
    if (!header) { App.toast('CDR not found', 'error'); return; }

    const school = this._getSchool(header.school_id);
    const el = document.getElementById('view-container');
    if (!el) return;

    const pt = document.getElementById('page-title');
    const ps = document.getElementById('page-subtitle');
    if (pt) pt.textContent = 'Cash Disbursement Register';
    if (ps) ps.textContent = `${school.name || ''} — ${header.year} ${header.quarter}`;

    // Running balance — starts at 0; first entry is the cash advance receipt
    let balance = 0;
    const rows = entries.map(e => {
      const adv = parseFloat(e.advances) || 0;
      const pay = parseFloat(e.payment) || 0;
      balance = balance + adv - pay;
      return { ...e, running_balance: balance };
    });

    const totalAdv = entries.reduce((s, e) => s + (parseFloat(e.advances) || 0), 0);
    const totalPay = entries.reduce((s, e) => s + (parseFloat(e.payment) || 0), 0);
    const finalBal = rows.length > 0 ? rows[rows.length - 1].running_balance : 0;

    const uacsOpts = UACS_CODES.map(u =>
      `<option value="${u.code}" data-desc="${u.desc}">${u.code} — ${u.desc}</option>`
    ).join('');

    el.innerHTML = `
    <!-- Top bar -->
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <button class="btn btn-secondary btn-sm" onclick="CDRView.backToList()">
        ← Back to CDR List
      </button>
      <button class="btn btn-primary btn-sm" onclick="CDRXlsx.download('${id}')">
        Download Excel
      </button>
    </div>

    <!-- CDR Info -->
    <div class="section-card mb-4">
      <div class="section-card-body py-3">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><span class="text-gray-500 text-xs block">School</span><strong>${school.name || '—'}</strong></div>
          <div><span class="text-gray-500 text-xs block">Year / Quarter</span><strong>${header.year} ${header.quarter}</strong></div>
          <div><span class="text-gray-500 text-xs block">Fund Type</span><strong>${header.fund_type || '—'}</strong></div>
        </div>
      </div>
    </div>

    <!-- Add Transaction Button -->
    <div class="flex justify-end mb-4">
      <button class="btn btn-primary" onclick="CDRView.openCreateMulti('${id}')">
        + Add Transaction
      </button>
    </div>

    <!-- Transactions Table -->
    <div id="cdr-txn-wrap" class="section-card">
      <div class="section-card-header">
        <h3>Transactions</h3>
        <span class="text-xs text-gray-500">${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}</span>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>
            <th>#</th>
            <th>Date</th>
            <th>DV / Check No.</th>
            <th>Payee</th>
            <th>Particulars</th>
            <th>UACS Name</th>
            <th class="col-amount">Cash Advance</th>
            <th class="col-amount">Payment</th>
            <th class="col-amount">Balance</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${rows.length === 0
              ? `<tr><td colspan="10" class="text-center text-gray-400 py-8 text-sm">No transactions yet. Use the form above to add the first entry.</td></tr>`
              : rows.map((e, i) => {
                  const uacsLabel = e.uacs_lines
                    ? (() => { try { return JSON.parse(e.uacs_lines).map(l => l.desc || l.code).join(', '); } catch { return 'Multiple UACS'; } })()
                    : (e.uacs_code ? (e.uacs_desc || UACS_CODES.find(u => u.code === e.uacs_code)?.desc || e.uacs_code) : '—');
                  const dvCheck = e.dv_no || e.check_no
                    ? [e.dv_no, e.check_no].filter(Boolean).join('/')
                    : (e.ref_no || '—');
                  return `
                  <tr>
                    <td class="text-xs text-gray-400">${i + 1}</td>
                    <td class="text-xs whitespace-nowrap">${formatDate(e.entry_date)}</td>
                    <td class="text-xs text-gray-600">${dvCheck}</td>
                    <td class="text-xs">${e.payee || '—'}</td>
                    <td class="text-xs">${e.particulars || '—'}</td>
                    <td class="text-xs">${uacsLabel}</td>
                    <td class="col-amount text-xs">${(parseFloat(e.advances)||0) > 0 ? fmt(e.advances) : ''}</td>
                    <td class="col-amount text-xs font-semibold text-blue-700">${(parseFloat(e.payment)||0) > 0 ? fmt(e.payment) : ''}</td>
                    <td class="col-amount text-xs font-bold">${fmt(e.running_balance)}</td>
                    <td>
                      <button class="btn btn-danger btn-sm" onclick="CDRView.deleteEntry('${e.id}','${id}')">Del</button>
                    </td>
                  </tr>`;
                }).join('')
            }
            ${entries.length > 0 ? `
            <tr class="bg-gray-50 font-bold text-xs">
              <td colspan="6" class="text-right pr-2">TOTAL</td>
              <td class="col-amount">${fmt(totalAdv)}</td>
              <td class="col-amount text-blue-700">${fmt(totalPay)}</td>
              <td class="col-amount">${fmt(finalBal)}</td>
              <td></td>
            </tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>`;
  },

  async backToList() {
    this._detailId = null;
    const el = document.getElementById('view-container');
    const pt = document.getElementById('page-title');
    const ps = document.getElementById('page-subtitle');
    if (pt) pt.textContent = this._category === 'special' ? 'Special Funds' : 'MOOE';
    if (ps) ps.textContent = 'Cash Disbursement Register';
    if (el) el.innerHTML = await this.render();
    await this.afterRender();
  },

  onUACSChange(sel) {
    const opt = sel.options[sel.selectedIndex];
    const desc = opt?.dataset?.desc || '';
    const row = document.getElementById('uacs-desc-row');
    const inp = document.getElementById('entry-uacs-desc');
    if (row) row.style.display = desc ? '' : 'none';
    if (inp) inp.value = desc;
  },

  async deleteEntry(entry_id, cdr_id) {
    if (!confirm('Delete this entry?')) return;
    await DB.deleteCDREntry(entry_id);
    const { data: existing } = await DB.getCDREntries(cdr_id);
    await DB.upsertCDRHeader({ id: cdr_id, entry_count: (existing || []).length });
    App.toast('Entry deleted.');
    await this.showDetail(cdr_id);
  },

  // ---- Multi-UACS entry form ----
  openCreateMulti(cdr_id) {
    const uacsOpts = UACS_CODES.map(u =>
      `<option value="${u.code}">${u.code} — ${u.desc}</option>`
    ).join('');
    const lineHtml = `
      <div class="uacs-line flex gap-2 mb-2 items-center">
        <select class="form-select flex-1 uacs-line-code" style="min-width:0">
          <option value="">— Select UACS —</option>${uacsOpts}
        </select>
        <input type="number" step="0.01" min="0" class="form-input uacs-line-amount"
               style="width:110px;flex-shrink:0" placeholder="0.00"
               oninput="CDRView.updateMultiTotal()" />
        <button type="button" class="btn btn-danger btn-sm"
                onclick="this.closest('.uacs-line').remove(); CDRView.updateMultiTotal()">×</button>
      </div>`;
    const html = `
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label class="form-label">Date *</label>
          <input id="mi-date" type="date" class="form-input" required
                 value="${new Date().toISOString().slice(0,10)}" />
        </div>
        <div>
          <label class="form-label">DV No.</label>
          <input id="mi-dv" type="text" class="form-input"
                 placeholder="e.g. 2026-01-001" />
        </div>
        <div>
          <label class="form-label">Check No. *</label>
          <input id="mi-check" type="text" class="form-input" required
                 placeholder="e.g. 1496368" />
        </div>
        <div>
          <label class="form-label">Payee *</label>
          <input id="mi-payee" type="text" class="form-input" required
                 placeholder="e.g. Juan dela Cruz" />
        </div>
        <div class="col-span-2">
          <label class="form-label">Particulars *</label>
          <input id="mi-particulars" type="text" class="form-input" required
                 placeholder="Description of transaction" />
        </div>
      </div>
      <div class="mb-3">
        <div class="flex items-center justify-between mb-2">
          <label class="form-label mb-0 font-semibold">UACS Breakdown</label>
          <button type="button" class="btn btn-secondary btn-sm"
                  onclick="CDRView.addUACSLine()">+ Add UACS</button>
        </div>
        <div id="mi-uacs-lines">${lineHtml}</div>
      </div>
      <div class="flex items-center justify-between pt-2 border-t border-gray-200">
        <div class="text-sm font-semibold text-gray-700">Total: ₱<span id="mi-total">0.00</span></div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="button" class="btn btn-primary"
                  onclick="CDRView.saveMultiUACS('${cdr_id}')">Save Entry</button>
        </div>
      </div>`;
    App.openModal('Multi-UACS Entry', html);
  },

  addUACSLine() {
    const container = document.getElementById('mi-uacs-lines');
    if (!container) return;
    const uacsOpts = UACS_CODES.map(u =>
      `<option value="${u.code}">${u.code} — ${u.desc}</option>`
    ).join('');
    const div = document.createElement('div');
    div.className = 'uacs-line flex gap-2 mb-2 items-center';
    div.innerHTML = `
      <select class="form-select flex-1 uacs-line-code" style="min-width:0">
        <option value="">— Select UACS —</option>${uacsOpts}
      </select>
      <input type="number" step="0.01" min="0" class="form-input uacs-line-amount"
             style="width:110px;flex-shrink:0" placeholder="0.00"
             oninput="CDRView.updateMultiTotal()" />
      <button type="button" class="btn btn-danger btn-sm"
              onclick="this.closest('.uacs-line').remove(); CDRView.updateMultiTotal()">×</button>`;
    container.appendChild(div);
  },

  updateMultiTotal() {
    const total = Array.from(document.querySelectorAll('.uacs-line-amount'))
      .reduce((s, el) => s + (parseFloat(el.value) || 0), 0);
    const el = document.getElementById('mi-total');
    if (el) el.textContent = total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  async saveMultiUACS(cdr_id) {
    const date        = document.getElementById('mi-date').value;
    const dv_no       = document.getElementById('mi-dv').value.trim();
    const check_no    = document.getElementById('mi-check').value.trim();
    const payee       = document.getElementById('mi-payee').value.trim();
    const particulars = document.getElementById('mi-particulars').value.trim();

    if (!date || !particulars) {
      App.toast('Date and Particulars are required.', 'error'); return;
    }
    if (!check_no) { App.toast('Check No. is required.', 'error'); return; }
    if (!payee)    { App.toast('Payee is required.', 'error'); return; }

    const ref_no = [dv_no, check_no].filter(Boolean).join('/');

    const uacs_lines = [];
    let total = 0;
    for (const line of document.querySelectorAll('#mi-uacs-lines .uacs-line')) {
      const code   = line.querySelector('.uacs-line-code').value;
      const amount = parseFloat(line.querySelector('.uacs-line-amount').value) || 0;
      if (!code)       { App.toast('Select a UACS code for every line.', 'error'); return; }
      if (amount <= 0) { App.toast('Each UACS amount must be greater than 0.', 'error'); return; }
      const desc = UACS_CODES.find(u => u.code === code)?.desc || '';
      uacs_lines.push({ code, desc, amount });
      total += amount;
    }

    if (uacs_lines.length === 0) {
      App.toast('Add at least one UACS line.', 'error'); return;
    }

    const row = {
      id:         DB.newId(),
      cdr_id,
      entry_date: date,
      ref_no,
      dv_no,
      check_no,
      payee,
      particulars,
      uacs_code:  null,
      uacs_desc:  null,
      advances:   0,
      payment:    total,
      uacs_lines: JSON.stringify(uacs_lines),
      sort_order: Date.now(),
    };

    // Optimistic update — show immediately, save in background
    if (!this._detailEntries) this._detailEntries = [];
    this._detailEntries.push(row);
    this._refreshDetailTable();
    App.toast('Transaction added!');

    // Reset form immediately
    const miDate  = document.getElementById('mi-date');
    const miDV    = document.getElementById('mi-dv');
    const miChk   = document.getElementById('mi-check');
    const miPayee = document.getElementById('mi-payee');
    const miPart  = document.getElementById('mi-particulars');
    const miLines = document.getElementById('mi-uacs-lines');
    const miTotal = document.getElementById('mi-total');
    if (miDate)  miDate.value  = new Date().toISOString().slice(0, 10);
    if (miDV)    miDV.value    = '';
    if (miChk)   miChk.value   = '';
    if (miPayee) miPayee.value = '';
    if (miPart)  miPart.value  = '';
    if (miTotal) miTotal.textContent = '0.00';
    if (miLines) {
      const opts = UACS_CODES.map(u => `<option value="${u.code}">${u.code} — ${u.desc}</option>`).join('');
      const line = `<div class="uacs-line flex gap-2 mb-2 items-center">
        <select class="form-select flex-1 uacs-line-code" style="min-width:0">
          <option value="">— Select UACS —</option>${opts}
        </select>
        <input type="number" step="0.01" min="0" class="form-input uacs-line-amount"
               style="width:110px;flex-shrink:0" placeholder="0.00"
               oninput="CDRView.updateMultiTotal()" />
        <button type="button" class="btn btn-danger btn-sm"
                onclick="this.closest('.uacs-line').remove(); CDRView.updateMultiTotal()">×</button>
      </div>`;
      miLines.innerHTML = line;
    }

    // Background save — revert on error
    const { error } = await DB.upsertCDREntry(row);
    if (error) {
      this._detailEntries = this._detailEntries.filter(e => e.id !== row.id);
      this._refreshDetailTable();
      App.toast('Error saving: ' + (error?.message || error), 'error');
      return;
    }
    DB.upsertCDRHeader({ id: cdr_id, entry_count: this._detailEntries.length });
  },

  _refreshDetailTable() {
    const wrap = document.getElementById('cdr-txn-wrap');
    if (!wrap) return;
    const entries = this._detailEntries || [];
    const id = this._detailId;
    let balance = 0;
    const rows = entries.map(e => {
      const adv = parseFloat(e.advances) || 0;
      const pay = parseFloat(e.payment)  || 0;
      balance = balance + adv - pay;
      return { ...e, running_balance: balance };
    });
    const totalAdv = entries.reduce((s, e) => s + (parseFloat(e.advances) || 0), 0);
    const totalPay = entries.reduce((s, e) => s + (parseFloat(e.payment)  || 0), 0);
    const finalBal = rows.length > 0 ? rows[rows.length - 1].running_balance : 0;
    wrap.innerHTML = `
      <div class="section-card-header">
        <h3>Transactions</h3>
        <span class="text-xs text-gray-500">${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}</span>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>
            <th>#</th><th>Date</th><th>DV / Check No.</th><th>Payee</th><th>Particulars</th>
            <th>UACS Name</th>
            <th class="col-amount">Cash Advance</th>
            <th class="col-amount">Payment</th>
            <th class="col-amount">Balance</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${rows.length === 0
              ? `<tr><td colspan="10" class="text-center text-gray-400 py-8 text-sm">No transactions yet. Use the form above to add the first entry.</td></tr>`
              : rows.map((e, i) => {
                  const uacsLabel = e.uacs_lines
                    ? (() => { try { return JSON.parse(e.uacs_lines).map(l => l.desc || l.code).join(', '); } catch { return 'Multiple UACS'; } })()
                    : (e.uacs_code ? (e.uacs_desc || UACS_CODES.find(u => u.code === e.uacs_code)?.desc || e.uacs_code) : '—');
                  const dvCheck = e.dv_no || e.check_no
                    ? [e.dv_no, e.check_no].filter(Boolean).join('/')
                    : (e.ref_no || '—');
                  return `<tr>
                    <td class="text-xs text-gray-400">${i + 1}</td>
                    <td class="text-xs whitespace-nowrap">${formatDate(e.entry_date)}</td>
                    <td class="text-xs text-gray-600">${dvCheck}</td>
                    <td class="text-xs">${e.payee || '—'}</td>
                    <td class="text-xs">${e.particulars || '—'}</td>
                    <td class="text-xs">${uacsLabel}</td>
                    <td class="col-amount text-xs">${(parseFloat(e.advances)||0) > 0 ? fmt(e.advances) : ''}</td>
                    <td class="col-amount text-xs font-semibold text-blue-700">${(parseFloat(e.payment)||0) > 0 ? fmt(e.payment) : ''}</td>
                    <td class="col-amount text-xs font-bold">${fmt(e.running_balance)}</td>
                    <td><button class="btn btn-danger btn-sm" onclick="CDRView.deleteEntry('${e.id}','${id}')">Del</button></td>
                  </tr>`;
                }).join('')
            }
            ${entries.length > 0 ? `
            <tr class="bg-gray-50 font-bold text-xs">
              <td colspan="6" class="text-right pr-2">TOTAL</td>
              <td class="col-amount">${fmt(totalAdv)}</td>
              <td class="col-amount text-blue-700">${fmt(totalPay)}</td>
              <td class="col-amount">${fmt(finalBal)}</td>
              <td></td>
            </tr>` : ''}
          </tbody>
        </table>
      </div>`;
  },

  // ---- Download as PDF (F4 landscape, 8.5 × 13 in) using jsPDF ----
  async downloadPDF(id) {
    // Lazy-load jsPDF then autoTable (sequential — autoTable requires jsPDF first)
    if (typeof window.jspdf === 'undefined') {
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
    }

    const [headerRes, entriesRes] = await Promise.all([DB.getCDRHeader(id), DB.getCDREntries(id)]);
    const header = headerRes.data;
    let entries = entriesRes.data || [];
    if (!header) { App.toast('CDR not found', 'error'); return; }

    const school = this._getSchool(header.school_id);

    // Cash advance injection — same as printCDR
    const hasAdvanceEntry = entries.some(e => (parseFloat(e.advances) || 0) > 0);
    let startBalance = 0;
    if (!hasAdvanceEntry) {
      const { data: releaseFunds } = await DB.getFunds({ school_id: header.school_id });
      const normalize = s => (s || '').trim().toLowerCase();
      const rm = (releaseFunds || []).filter(f => normalize(f.fund_type) === normalize(header.fund_type));
      rm.sort((a, b) => (b.ada_date || '').localeCompare(a.ada_date || ''));
      const rf = rm[0] || null;
      if (rf) {
        const ord = { Q1:'1st', Q2:'2nd', Q3:'3rd', Q4:'4th' };
        const isMOOE = typeof DashboardView !== 'undefined' && DashboardView._isMOOE(header.fund_type);
        const particulars = isMOOE
          ? `Operating Advances for ${ord[header.quarter] || header.quarter} Quarter`
          : `Operating Advances for ${header.fund_type}`;
        entries = [{ id:'_adv', entry_date:rf.ada_date, ref_no:rf.ada_no||'', particulars,
          uacs_code:'', uacs_desc:'', advances:parseFloat(rf.amount)||0, payment:0 }, ...entries];
        startBalance = 0;
      }
    }

    let balance = startBalance;
    const rows = entries.map(e => {
      balance += (parseFloat(e.advances)||0) - (parseFloat(e.payment)||0);
      return { ...e, running_balance: balance };
    });

    const totalAdv = entries.reduce((s,e) => s+(parseFloat(e.advances)||0), 0);
    const totalPay = entries.reduce((s,e) => s+(parseFloat(e.payment)||0),  0);
    const finalBal = rows.length ? rows[rows.length-1].running_balance : startBalance;

    const COL_OFF='5020301000', COL_GEN='5021299000', COL_JAN='5021202000';
    const tOff = entries.filter(e=>e.uacs_code===COL_OFF).reduce((s,e)=>s+(parseFloat(e.payment)||0),0);
    const tGen = entries.filter(e=>e.uacs_code===COL_GEN).reduce((s,e)=>s+(parseFloat(e.payment)||0),0);
    const tJan = entries.filter(e=>e.uacs_code===COL_JAN).reduce((s,e)=>s+(parseFloat(e.payment)||0),0);

    // Recapitulation
    const recap = {};
    entries.forEach(e => {
      const p = parseFloat(e.payment)||0; if (!p) return;
      const code = e.uacs_code||'';
      const desc = e.uacs_desc || UACS_CODES.find(u=>u.code===code)?.desc || code;
      if (!recap[code]) recap[code] = { code, desc, total:0 };
      recap[code].total += p;
    });

    App.toast('Preparing PDF…');

    const { jsPDF } = window.jspdf;
    const doc  = new jsPDF({ orientation:'landscape', unit:'mm', format:[215.9, 330.2] });
    const sName = (school.name || '').toUpperCase();
    const W = 330.2, M = 10;
    const fmt2 = n => (parseFloat(n)||0).toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 });
    const fmtN = n => { const v=parseFloat(n)||0; return v>0 ? fmt2(v) : ''; };

    // ── Title block ──
    doc.setFont('helvetica','bold').setFontSize(10);
    doc.text('DEPED LEYTE DIVISION', W/2, 11, { align:'center' });
    doc.text(sName, W/2, 16, { align:'center' });
    doc.setFont('helvetica','italic').setFontSize(8);
    doc.text('Appendix 43', W - M, 16, { align:'right' });
    doc.setFont('helvetica','bold').setFontSize(11);
    doc.text('CASH DISBURSEMENTS REGISTER', W/2, 24, { align:'center' });

    // ── Entity info ──
    doc.setFont('helvetica','normal').setFontSize(7.5);
    [
      'Entity Name: ' + sName,
      'Sub-Office/District/Division: DULAG WEST DISTRICT',
      'Municipality/City/Province: DULAG, LEYTE',
      'Fund Cluster: 01-REGULAR',
    ].forEach((t, i) => doc.text(t, M, 31 + i*4.5));
    [
      'Name of Accountable Officer: ' + (school.school_head || ''),
      'Official Designation: ' + (school.designation || ''),
      'Station: ' + (school.short_name || school.name || ''),
      'Register No.: ___________________________',
      'Sheet No.: ___________________________',
    ].forEach((t, i) => doc.text(t, W/2 + 5, 31 + i*4.5));

    // ── Table data rows ──
    const tableBody = rows.map(e => {
      const adv=parseFloat(e.advances)||0, pay=parseFloat(e.payment)||0;
      const isOff=e.uacs_code===COL_OFF, isGen=e.uacs_code===COL_GEN, isJan=e.uacs_code===COL_JAN;
      const isOth=!isOff&&!isGen&&!isJan&&pay>0;
      return [
        _fd(e.entry_date)||'', e.ref_no||'', e.particulars||'',
        adv>0?fmtN(adv):'', pay>0?fmtN(pay):'', fmt2(e.running_balance),
        isOff?fmtN(pay):'', isGen?fmtN(pay):'', isJan?fmtN(pay):'',
        isOth?(e.uacs_desc||UACS_CODES.find(u=>u.code===e.uacs_code)?.desc||''):'',
        isOth?(e.uacs_code||''):'',
        isOth?fmtN(pay):'',
      ];
    });

    tableBody.push([
      { content:'Totals', colSpan:3, styles:{ halign:'center', fontStyle:'bold' } },
      { content:fmtN(totalAdv), styles:{ halign:'right', fontStyle:'bold' } },
      { content:fmtN(totalPay), styles:{ halign:'right', fontStyle:'bold' } },
      { content:fmt2(finalBal), styles:{ halign:'right', fontStyle:'bold' } },
      { content:tOff>0?fmtN(tOff):'', styles:{ halign:'right' } },
      { content:tGen>0?fmtN(tGen):'', styles:{ halign:'right' } },
      { content:tJan>0?fmtN(tJan):'', styles:{ halign:'right' } },
      '','',{ content:fmtN(totalPay), styles:{ halign:'right' } },
    ]);

    // 4-row header matching the Excel/print template
    doc.autoTable({
      startY: 55,
      head: [
        [
          { content:'Date',                  rowSpan:4, styles:{ valign:'bottom', halign:'center' } },
          { content:'DV/Payroll/\nCheck No.', rowSpan:4, styles:{ valign:'bottom', halign:'center' } },
          { content:'Particulars',            rowSpan:4, styles:{ valign:'bottom', halign:'center' } },
          { content:'Advances for Operating Expenses', colSpan:3, styles:{ halign:'center' } },
          { content:'BREAKDOWN OF PAYMENTS',           colSpan:6, styles:{ halign:'center' } },
        ],
        [
          { content:'-19901010', colSpan:3, styles:{ halign:'center' } },
          { content:'', colSpan:6 },
        ],
        [
          { content:'Amount', colSpan:3, styles:{ halign:'center' } },
          { content:'Office Supplies\nExpenses',  styles:{ halign:'center' } },
          { content:'Other General\nServices',    styles:{ halign:'center' } },
          { content:'Janitorial\nServices',       styles:{ halign:'center' } },
          { content:'O T H E R S', colSpan:3,    styles:{ halign:'center' } },
        ],
        [
          'Cash Advance','Payments','Balance',
          '5020301000','5021299000','5021202000',
          'Account Description','UACS Object Code','Amount',
        ],
      ],
      body: tableBody,
      theme: 'grid',
      styles:     { fontSize:6, cellPadding:1.2, valign:'middle', font:'helvetica', overflow:'linebreak' },
      headStyles: { fillColor:[230,230,230], textColor:[0,0,0], fontStyle:'bold', halign:'center', fontSize:5.5 },
      columnStyles: {
        0:  { cellWidth:14, halign:'center' },
        1:  { cellWidth:24 },
        2:  { cellWidth:76 },
        3:  { cellWidth:18, halign:'right' },
        4:  { cellWidth:18, halign:'right' },
        5:  { cellWidth:18, halign:'right' },
        6:  { cellWidth:20, halign:'right' },
        7:  { cellWidth:20, halign:'right' },
        8:  { cellWidth:18, halign:'right' },
        9:  { cellWidth:38 },
        10: { cellWidth:16, halign:'center' },
        11: { cellWidth:16, halign:'right' },
      },
      margin: { left:M, right:M },
    });

    let y = (doc.lastAutoTable?.finalY || 160) + 4;

    // ── Note ──
    doc.setFont('helvetica','italic').setFontSize(6);
    doc.text(
      "The total of the 'Advances for Operating Expenses – Payments' column must always be equal to the sum of the totals of the 'Breakdown of Payments' columns.",
      M, y, { maxWidth: W - 2*M }
    );
    y += 8;

    // ── Recapitulation (right-side small table) ──
    const recapRows = Object.values(recap).map(r => [r.desc, r.code, fmt2(r.total)]);
    recapRows.push([
      { content:'Total', colSpan:2, styles:{ halign:'right', fontStyle:'bold' } },
      { content:fmt2(totalPay), styles:{ halign:'right', fontStyle:'bold' } },
    ]);
    const recapLeft = W - M - 72;
    doc.autoTable({
      startY: y,
      head: [
        [{ content:'Recapitulation:', colSpan:3, styles:{ halign:'left', fontStyle:'bold', fillColor:[255,255,255], textColor:[0,0,0] } }],
        [
          { content:'Account Description', styles:{ halign:'center' } },
          { content:'CS Object Code',      styles:{ halign:'center' } },
          { content:'Amount',              styles:{ halign:'center' } },
        ],
      ],
      body: recapRows,
      theme: 'grid',
      styles:     { fontSize:6, cellPadding:1.2, font:'helvetica', overflow:'linebreak' },
      headStyles: { fillColor:[230,230,230], textColor:[0,0,0], fontStyle:'bold', halign:'center', fontSize:5.5 },
      columnStyles: {
        0: { cellWidth:38 },
        1: { cellWidth:18, halign:'center' },
        2: { cellWidth:16, halign:'right' },
      },
      margin: { left:recapLeft, right:M },
    });

    y = (doc.lastAutoTable?.finalY || y + 30) + 10;

    // ── Signature block ──
    const s1 = M + 10, s2 = W/2 + 15;
    doc.setFont('helvetica','normal').setFontSize(8);
    doc.text('CERTIFIED CORRECT:', s1, y);
    doc.text('RECEIVED BY:', s2, y);

    y += 14;
    doc.line(s1, y, s1 + 70, y);
    doc.line(s2, y, s2 + 70, y);

    doc.setFont('helvetica','bold').setFontSize(9);
    doc.text(school.school_head || '', s1 + 35, y - 3, { align:'center' });
    doc.text(BOOKKEEPER,               s2 + 35, y - 3, { align:'center' });

    doc.setFont('helvetica','normal').setFontSize(7.5);
    doc.text(school.designation || 'Principal/Head Teacher', s1 + 35, y + 4, { align:'center' });
    doc.text(BOOKKEEPER_TITLE,                                s2 + 35, y + 4, { align:'center' });

    y += 14;
    doc.text('Date: ____________________', s1, y);
    doc.text('Date: ____________________', s2, y);

    doc.save(`CDR_${(school.name||'School').replace(/\s+/g,'_')}_${header.year}_${header.quarter}.pdf`);
    App.toast('PDF downloaded!');
  },

  // ---- Download as Excel (matches CDR 2026 template exactly) ----
  async downloadExcel(id) {
    if (typeof ExcelJS === 'undefined') { App.toast('Excel library not loaded. Please refresh the page.', 'error'); return; }

    const [headerRes, entriesRes] = await Promise.all([DB.getCDRHeader(id), DB.getCDREntries(id)]);
    const header = headerRes.data;
    const entries = entriesRes.data || [];
    if (!header) { App.toast('CDR not found', 'error'); return; }

    const school   = this._getSchool(header.school_id);
    const sName    = (school.name || '').toUpperCase();
    const COL_OFF  = '5020301000';
    const COL_GEN  = '5021299000';
    const COL_JAN  = '5021202000';
    const numFmt   = '#,##0.00';

    let bal = 0;
    const rows = entries.map(e => {
      bal += (parseFloat(e.advances)||0) - (parseFloat(e.payment)||0);
      return { ...e, running_balance: bal };
    });

    const totalAdv  = entries.reduce((s,e)=>s+(parseFloat(e.advances)||0),0);
    const totalPay  = entries.reduce((s,e)=>s+(parseFloat(e.payment)||0),0);
    const finalBal  = rows.length ? rows[rows.length-1].running_balance : 0;
    const totOff    = entries.filter(e=>e.uacs_code===COL_OFF).reduce((s,e)=>s+(parseFloat(e.payment)||0),0);
    const totGen    = entries.filter(e=>e.uacs_code===COL_GEN).reduce((s,e)=>s+(parseFloat(e.payment)||0),0);
    const totJan    = entries.filter(e=>e.uacs_code===COL_JAN).reduce((s,e)=>s+(parseFloat(e.payment)||0),0);

    // Recapitulation
    const recap = {};
    entries.forEach(e => {
      const p = parseFloat(e.payment)||0; if (!p) return;
      const code = e.uacs_code||'';
      const desc = e.uacs_desc || UACS_CODES.find(u=>u.code===code)?.desc || code;
      if (!recap[code]) recap[code]={code,desc,total:0};
      recap[code].total += p;
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${header.year} ${header.quarter}`,
      { pageSetup:{ paperSize:14, orientation:'landscape', fitToPage:true, fitToWidth:1 } });

    ws.columns = [
      {width:10},{width:22},{width:40},{width:14},{width:13},{width:14},
      {width:15},{width:15},{width:13},{width:28},{width:14},{width:13}
    ];

    // Styles
    const thin  = { style:'thin', color:{argb:'FF000000'} };
    const bord  = { top:thin, left:thin, bottom:thin, right:thin };
    const hFill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFD9D9D9'} };
    const C = (h,a,f,b) => ({ font:{name:'Arial',...h}, alignment:a, fill:f||undefined, border:b||undefined });
    const AL = { horizontal:'left',   vertical:'middle', wrapText:true };
    const AC = { horizontal:'center', vertical:'middle', wrapText:true };
    const AR = { horizontal:'right',  vertical:'middle' };

    const mc  = (r1,c1,r2,c2) => ws.mergeCells(r1,c1,r2,c2);
    const sc  = (r,c,v,font,align,fill,border) => {
      const cl = ws.getCell(r,c);
      cl.value = v;
      if (font)   cl.font      = font;
      if (align)  cl.alignment = align;
      if (fill)   cl.fill      = fill;
      if (border) cl.border    = border;
    };
    const bold   = (sz=9) => ({ name:'Arial', bold:true, size:sz });
    const normal = (sz=9) => ({ name:'Arial', size:sz });

    // ── Rows 1-2: Division / School / Appendix 43 ──
    mc(1,1,1,12); sc(1,1,'DEPED LEYTE DIVISION', bold(12), AC);
    mc(2,1,2,11); sc(2,1, sName, bold(12), AC);
    sc(2,12,'Appendix 43', {name:'Arial',italic:true,size:10}, {horizontal:'right',vertical:'middle'});
    ws.getRow(1).height = 18; ws.getRow(2).height = 18;

    // ── Row 4: CASH DISBURSEMENTS REGISTER ──
    mc(4,1,4,12);
    sc(4,1,'CASH DISBURSEMENTS REGISTER', {name:'Arial',bold:true,size:13,underline:true}, AC);
    ws.getRow(4).height = 22;

    // ── Rows 6-10: Entity info (A-H) + Accountable Officer (I-L) ──
    const info = [
      [`Entity Name: ${sName}`,                             `Name of Accountable Officer: ${school.school_head||''}`],
      [`Sub-Office/District/Division: DULAG WEST DISTRICT`, `Official Designation: ${school.designation||''}`],
      [`Municipality/City/Province: DULAG, LEYTE`,          `Station: ${school.short_name||school.name||''}`],
      [`Fund Cluster : 01-REGULAR`,                         `Register No. : __________________________________`],
      [``,                                                    `Sheet No. : ____________________________________`],
    ];
    info.forEach(([l,r],i) => {
      const row = 6+i;
      mc(row,1,row,8); sc(row,1,l, bold(9), AL);
      mc(row,9,row,12); sc(row,9,r, bold(9), AL);
      ws.getRow(row).height = 15;
    });

    // ── Rows 13-17: 5-row table header ──
    // Date / DV / Particulars span all 5 rows — text pinned to bottom
    const AB = { horizontal:'center', vertical:'bottom', wrapText:true };
    mc(13,1,17,1); sc(13,1,'Date', bold(8), AB, hFill, bord);
    mc(13,2,17,2); sc(13,2,'DV/Payroll/ Check No.', bold(8), AB, hFill, bord);
    mc(13,3,17,3); sc(13,3,'Particulars', bold(8), AB, hFill, bord);

    // Row 13: Advances / Breakdown
    mc(13,4,13,6); sc(13,4,'Advances for\nOperating Expenses', bold(8), AC, hFill, bord);
    mc(13,7,13,12); sc(13,7,'BREAKDOWN OF PAYMENTS', bold(8), AC, hFill, bord);
    ws.getRow(13).height = 22;

    // Row 14: -19901010
    mc(14,4,14,6); sc(14,4,'-19901010', bold(8), AC, hFill, bord);
    mc(14,7,14,12); sc(14,7,'', normal(8), AC, hFill, bord);
    ws.getRow(14).height = 15;

    // Row 15: Amount / fixed cols / O T H E R S
    mc(15,4,15,6); sc(15,4,'Amount', bold(8), AC, hFill, bord);
    mc(15,7,16,7); sc(15,7,'Office Supplies\nExpenses', bold(8), AC, hFill, bord);  // rowspan 2
    mc(15,8,16,8); sc(15,8,'Other General\nServices', bold(8), AC, hFill, bord);     // rowspan 2
    mc(15,9,16,9); sc(15,9,'Janitorial\nServices', bold(8), AC, hFill, bord);        // rowspan 2
    mc(15,10,15,12); sc(15,10,'O T H E R S', bold(8), AC, hFill, bord);
    ws.getRow(15).height = 26;

    // Row 16: Cash Advance / Payments / Balance / Account Desc / UACS / Amount
    sc(16,4,'Cash Advance', bold(8), AC, hFill, bord);
    sc(16,5,'Payments',     bold(8), AC, hFill, bord);
    sc(16,6,'Balance',      bold(8), AC, hFill, bord);
    sc(16,10,'Account Description', bold(8), AC, hFill, bord);
    sc(16,11,'UACS Object Code',    bold(8), AC, hFill, bord);
    sc(16,12,'Amount',              bold(8), AC, hFill, bord);
    ws.getRow(16).height = 26;

    // Row 17: UACS codes for fixed columns
    [4,5,6].forEach(c => sc(17,c,'', normal(7), AC, hFill, bord));
    sc(17,7,'5020301000', bold(7), AC, hFill, bord);
    sc(17,8,'5021299000', bold(7), AC, hFill, bord);
    sc(17,9,'5021202000', bold(7), AC, hFill, bord);
    [10,11,12].forEach(c => sc(17,c,'', normal(7), AC, hFill, bord));
    ws.getRow(17).height = 15;

    // ── Data rows starting at row 18 ──
    let dr = 18;
    rows.forEach(e => {
      const adv = parseFloat(e.advances)||0;
      const pay = parseFloat(e.payment)||0;
      const isOff = e.uacs_code===COL_OFF;
      const isGen = e.uacs_code===COL_GEN;
      const isJan = e.uacs_code===COL_JAN;
      const isOth = !isOff && !isGen && !isJan && pay>0;
      const desc  = isOth ? (e.uacs_desc||UACS_CODES.find(u=>u.code===e.uacs_code)?.desc||'') : '';

      const vals = [
        {v: e.entry_date?_fd(e.entry_date):'', a:AC},
        {v: e.ref_no||'',                       a:AL},
        {v: e.particulars||'',                  a:AL},
        {v: adv>0?adv:'',    a:AR, n:true},
        {v: pay>0?pay:'',    a:AR, n:true},
        {v: e.running_balance, a:AR, n:true},
        {v: isOff?pay:'',    a:AR, n:true},
        {v: isGen?pay:'',    a:AR, n:true},
        {v: isJan?pay:'',    a:AR, n:true},
        {v: desc,             a:AL},
        {v: isOth?(e.uacs_code||''):'', a:AC},
        {v: isOth?pay:'',    a:AR, n:true},
      ];
      vals.forEach(({v,a,n},i) => {
        const cl = ws.getCell(dr, i+1);
        cl.value = v; cl.font = normal(9); cl.border = bord; cl.alignment = a;
        if (n && typeof v==='number') cl.numFmt = numFmt;
      });
      ws.getRow(dr).height = 18;
      dr++;
    });

    // ── Totals row (matches template: label in C, fixed col totals in G/H/I, others total in L) ──
    const totVals = [
      {v:'',         a:AC},
      {v:'',         a:AC},
      {v:'Totals',   a:AC, b:true},
      {v:'',         a:AR},
      {v:'',         a:AR},
      {v:'',         a:AR},
      {v:totOff||'', a:AR, n:true},
      {v:totGen||'', a:AR, n:true},
      {v:totJan||'', a:AR, n:true},
      {v:'',         a:AR},
      {v:'',         a:AR},
      {v:totalPay||'', a:AR, n:true},
    ];
    totVals.forEach(({v,a,b,n},i) => {
      const cl = ws.getCell(dr,i+1);
      cl.value = v;
      cl.font = b ? bold(9) : normal(9);
      cl.border = bord;
      cl.alignment = {horizontal:a.replace('AR','right').replace('AC','center'), vertical:'middle'};
      if (n && typeof v==='number') cl.numFmt = numFmt;
    });
    ws.getRow(dr).height = 18;
    dr += 2;

    // ── Recapitulation (cols J-L) ──
    mc(dr,10,dr,12); sc(dr,10,'Recapitulation:', bold(9), AL);
    dr++;
    sc(dr,10,'Account Description', bold(8), AC, hFill, bord);
    sc(dr,11,'UACS Object Code',    bold(8), AC, hFill, bord);
    sc(dr,12,'Amount',              bold(8), AC, hFill, bord);
    dr++;
    Object.values(recap).forEach(r => {
      sc(dr,10,r.desc,  normal(9), AL, null, bord);
      sc(dr,11,r.code,  normal(9), AC, null, bord);
      const cl=ws.getCell(dr,12); cl.value=r.total; cl.font=normal(9);
      cl.border=bord; cl.alignment=AR; cl.numFmt=numFmt;
      ws.getRow(dr).height=16; dr++;
    });
    sc(dr,10,'Total', bold(9), AR, null, bord);
    sc(dr,11,'',      bold(9), AC, null, bord);
    const tc=ws.getCell(dr,12); tc.value=totalPay; tc.font=bold(9);
    tc.border=bord; tc.alignment=AR; tc.numFmt=numFmt;
    dr += 2;

    // ── Note ──
    mc(dr,1,dr,12);
    sc(dr,1,"The total of the 'Advances for Operating Expenses – Payments' column must always be equal to the sum of the totals of the 'Breakdown of Payments' columns.",
      {name:'Arial',italic:true,size:8}, {horizontal:'left',vertical:'middle',wrapText:true});
    ws.getRow(dr).height = 24; dr += 2;

    // ── Signature block ──
    mc(dr,2,dr,6); sc(dr,2,'CERTIFIED CORRECT:', bold(9), AL);
    mc(dr,9,dr,12); sc(dr,9,'RECEIVED BY:', bold(9), AL);
    dr += 2;
    mc(dr,2,dr,6); sc(dr,2,school.school_head||'', {name:'Arial',bold:true,size:10,underline:true}, AC);
    mc(dr,9,dr,12); sc(dr,9,BOOKKEEPER, {name:'Arial',bold:true,size:10,underline:true}, AC);
    dr++;
    mc(dr,2,dr,6); sc(dr,2,school.designation||'', normal(9), AC);
    mc(dr,9,dr,12); sc(dr,9,BOOKKEEPER_TITLE, normal(9), AC);
    dr += 2;
    mc(dr,2,dr,6); sc(dr,2,'Date: ____________________', normal(9), AL);
    mc(dr,9,dr,12); sc(dr,9,'Date: ______________________', normal(9), AL);

    // ── Download ──
    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `CDR_${(school.name||'School').replace(/\s+/g,'_')}_${header.year}_${header.quarter}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    App.toast('Excel file downloaded!');
  },

  // ---- Print Appendix 43 ----
  async printCDR(id) {
    // Must open window synchronously before any await (popup blocker fix)
    const w = window.open('', '_blank');
    if (!w) { App.toast('Pop-up blocked! Allow pop-ups for this site and try again.', 'error'); return; }
    w.document.write('<html><body style="font-family:Arial;text-align:center;padding:40px">Loading CDR data...</body></html>');

    const [headerRes, entriesRes] = await Promise.all([DB.getCDRHeader(id), DB.getCDREntries(id)]);
    const header = headerRes.data;
    let entries = entriesRes.data || [];
    if (!header) { w.close(); App.toast('CDR not found', 'error'); return; }

    const school = this._getSchool(header.school_id);

    // If no entry already carries an advance amount, inject a cash advance row
    // from the matching Fund Release so the printed CDR always shows it first.
    const hasAdvanceEntry = entries.some(e => (parseFloat(e.advances) || 0) > 0);
    let startBalance = 0;

    if (!hasAdvanceEntry) {
      const { data: releaseFunds } = await DB.getFunds({ school_id: header.school_id });
      const normalize = s => (s || '').trim().toLowerCase();
      const releaseMatched = (releaseFunds || []).filter(f => normalize(f.fund_type) === normalize(header.fund_type));
      releaseMatched.sort((a, b) => (b.ada_date || '').localeCompare(a.ada_date || ''));
      const rf = releaseMatched[0] || null;
      if (rf) {
        const ordinal = { Q1: '1st', Q2: '2nd', Q3: '3rd', Q4: '4th' };
        const isMOOE = typeof DashboardView !== 'undefined' && DashboardView._isMOOE(header.fund_type);
        const particulars = isMOOE
          ? `Operating Advances for ${ordinal[header.quarter] || header.quarter} Quarter`
          : `Operating Advances for ${header.fund_type}`;
        entries = [{
          id: '_adv', entry_date: rf.ada_date, ref_no: rf.ada_no || '',
          particulars, uacs_code: '', uacs_desc: '',
          advances: parseFloat(rf.amount) || 0, payment: 0,
        }, ...entries];
        startBalance = 0;
      }
    }

    let balance = startBalance;
    const rows = entries.map(e => {
      const adv = parseFloat(e.advances) || 0;
      const pay = parseFloat(e.payment)  || 0;
      balance = balance + adv - pay;
      return { ...e, running_balance: balance };
    });

    const totalAdv = entries.reduce((s, e) => s + (parseFloat(e.advances) || 0), 0);
    const totalPay = entries.reduce((s, e) => s + (parseFloat(e.payment)  || 0), 0);
    const finalBal = rows.length > 0 ? rows[rows.length - 1].running_balance : startBalance;

    const COL_OFFICE = '5020301000';
    const COL_GENSVC = '5021299000';
    const COL_JANIT  = '5021202000';

    // Flatten all UACS amounts (handles both single and multi-UACS entries)
    const allUACSAmts = [];
    entries.forEach(e => {
      if (e.uacs_lines) {
        try { JSON.parse(e.uacs_lines).forEach(l => allUACSAmts.push(l)); } catch {}
      } else {
        const pay = parseFloat(e.payment) || 0;
        if (e.uacs_code && pay > 0) allUACSAmts.push({ code: e.uacs_code, desc: e.uacs_desc, amount: pay });
      }
    });
    const totOffice = allUACSAmts.filter(l => l.code === COL_OFFICE).reduce((s,l) => s+(parseFloat(l.amount)||0), 0);
    const totGenSvc = allUACSAmts.filter(l => l.code === COL_GENSVC).reduce((s,l) => s+(parseFloat(l.amount)||0), 0);
    const totJanit  = allUACSAmts.filter(l => l.code === COL_JANIT ).reduce((s,l) => s+(parseFloat(l.amount)||0), 0);

    const tableRowParts = [];
    rows.forEach(e => {
      const adv = parseFloat(e.advances) || 0;
      const pay = parseFloat(e.payment)  || 0;

      if (e.uacs_lines) {
        let lines; try { lines = JSON.parse(e.uacs_lines); } catch { lines = []; }
        const fixedAmts = { [COL_OFFICE]: 0, [COL_GENSVC]: 0, [COL_JANIT]: 0 };
        const otherLines = [];
        lines.forEach(l => {
          const a = parseFloat(l.amount) || 0;
          if (l.code in fixedAmts) fixedAmts[l.code] += a;
          else otherLines.push(l);
        });
        const fo = otherLines[0];
        tableRowParts.push(`<tr>
          <td style="text-align:center;white-space:nowrap;font-size:7pt">${_fd(e.entry_date)}</td>
          <td style="font-size:6pt;word-break:break-all">${e.ref_no || ''}</td>
          <td style="font-size:6.5pt">${e.particulars || ''}</td>
          <td style="text-align:right"></td>
          <td style="text-align:right">${_fp(pay)}</td>
          <td style="text-align:right;font-weight:bold">${_fp(e.running_balance)}</td>
          <td style="text-align:right">${fixedAmts[COL_OFFICE] > 0 ? _fp(fixedAmts[COL_OFFICE]) : ''}</td>
          <td style="text-align:right">${fixedAmts[COL_GENSVC] > 0 ? _fp(fixedAmts[COL_GENSVC]) : ''}</td>
          <td style="text-align:right">${fixedAmts[COL_JANIT]  > 0 ? _fp(fixedAmts[COL_JANIT])  : ''}</td>
          <td style="font-size:6pt">${fo ? (fo.desc||'') : ''}</td>
          <td style="text-align:center;font-size:6pt">${fo ? (fo.code||'') : ''}</td>
          <td style="text-align:right">${fo ? _fp(parseFloat(fo.amount)||0) : ''}</td>
        </tr>`);
        for (let k = 1; k < otherLines.length; k++) {
          const xl = otherLines[k];
          tableRowParts.push(`<tr>
            <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            <td style="font-size:6pt">${xl.desc||''}</td>
            <td style="text-align:center;font-size:6pt">${xl.code||''}</td>
            <td style="text-align:right">${_fp(parseFloat(xl.amount)||0)}</td>
          </tr>`);
        }
      } else {
        const isOffice = e.uacs_code === COL_OFFICE;
        const isGenSvc = e.uacs_code === COL_GENSVC;
        const isJanit  = e.uacs_code === COL_JANIT;
        const isOthers = !isOffice && !isGenSvc && !isJanit && pay > 0;
        const othDesc  = isOthers ? (e.uacs_desc || UACS_CODES.find(u => u.code === e.uacs_code)?.desc || '') : '';
        tableRowParts.push(`<tr>
          <td style="text-align:center;white-space:nowrap;font-size:7pt">${_fd(e.entry_date)}</td>
          <td style="font-size:6pt;word-break:break-all">${e.ref_no || ''}</td>
          <td style="font-size:6.5pt">${e.particulars || ''}</td>
          <td style="text-align:right">${adv > 0 ? _fp(adv) : ''}</td>
          <td style="text-align:right">${pay > 0 ? _fp(pay) : ''}</td>
          <td style="text-align:right;font-weight:bold">${_fp(e.running_balance)}</td>
          <td style="text-align:right">${isOffice ? _fp(pay) : ''}</td>
          <td style="text-align:right">${isGenSvc ? _fp(pay) : ''}</td>
          <td style="text-align:right">${isJanit  ? _fp(pay) : ''}</td>
          <td style="font-size:6pt">${othDesc}</td>
          <td style="text-align:center;font-size:6pt">${isOthers ? (e.uacs_code||'') : ''}</td>
          <td style="text-align:right">${isOthers ? _fp(pay) : ''}</td>
        </tr>`);
      }
    });
    const tableRows = tableRowParts.join('');

    w.document.open();
    w.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/>
<title>CDR — ${school.name || ''} ${header.year} ${header.quarter}</title>
<style>
  @page { size: legal landscape; margin: 8mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 7.5pt; color: #000; margin: 0; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 2px 3px; vertical-align: middle; }
  th { text-align: center; font-size: 6.5pt; background: #f0f0f0; }
  .nb { border: none; } .nb td, .nb th { border: none; }
  .right { text-align: right; } .center { text-align: center; } .bold { font-weight: bold; }
  .sig { border-top: 1px solid #000; text-align: center; padding-top: 3px; margin-top: 40px; }
  @media print { body { margin: 0; } }
</style>
</head><body>

<!-- HEADER: Division / School / Appendix 43 -->
<table style="width:100%" class="nb">
  <tr>
    <td class="center bold" style="font-size:10pt">DEPED LEYTE DIVISION</td>
    <td></td>
  </tr>
  <tr>
    <td class="center bold" style="font-size:10pt">${(school.name || '').toUpperCase()}</td>
    <td class="right" style="font-size:8pt;font-style:italic">Appendix 43</td>
  </tr>
</table>

<br/>
<div class="center bold" style="font-size:11pt;text-decoration:underline">CASH DISBURSEMENTS REGISTER</div>
<br/>

<!-- ENTITY INFO (left) + ACCOUNTABLE OFFICER (right) -->
<table style="width:100%;margin-bottom:6px" class="nb">
  <tr>
    <td style="width:50%;vertical-align:top;padding-right:10px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:1px 0;font-size:7.5pt"><strong>Entity Name:</strong> ${(school.name||'').toUpperCase()}</td></tr>
        <tr><td style="padding:1px 0;font-size:7.5pt"><strong>Sub-Office/District/Division:</strong> DULAG WEST DISTRICT</td></tr>
        <tr><td style="padding:1px 0;font-size:7.5pt"><strong>Municipality/City/Province:</strong> DULAG, LEYTE</td></tr>
        <tr><td style="padding:1px 0;font-size:7.5pt"><strong>Fund Cluster:</strong> 01-REGULAR</td></tr>
      </table>
    </td>
    <td style="width:50%;vertical-align:top">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:1px 0;font-size:7.5pt"><strong>Name of Accountable Officer:</strong> ${school.school_head || ''}</td></tr>
        <tr><td style="padding:1px 0;font-size:7.5pt"><strong>Official Designation:</strong> ${school.designation || ''}</td></tr>
        <tr><td style="padding:1px 0;font-size:7.5pt"><strong>Station:</strong> ${school.short_name || school.name || ''}</td></tr>
        <tr><td style="padding:1px 0;font-size:7.5pt"><strong>Register No.:</strong> ___________________________</td></tr>
        <tr><td style="padding:1px 0;font-size:7.5pt"><strong>Sheet No.:</strong> ___________________________</td></tr>
      </table>
    </td>
  </tr>
</table>

<!-- MAIN CDR TABLE -->
<table style="width:100%;table-layout:fixed">
  <colgroup>
    <col style="width:5%"/>
    <col style="width:11%"/>
    <col style="width:22%"/>
    <col style="width:7%"/>
    <col style="width:7%"/>
    <col style="width:7%"/>
    <col style="width:8%"/>
    <col style="width:8%"/>
    <col style="width:7%"/>
    <col style="width:9%"/>
    <col style="width:6%"/>
    <col style="width:6%"/>
  </colgroup>
  <thead>
    <tr>
      <th colspan="3"></th>
      <th colspan="3">Advances for Operating Expenses</th>
      <th colspan="6">BREAKDOWN OF PAYMENTS</th>
    </tr>
    <tr>
      <th colspan="3"></th>
      <th colspan="3">-19901010</th>
      <th colspan="6"></th>
    </tr>
    <tr>
      <th colspan="3"></th>
      <th colspan="3">Amount</th>
      <th>Office Supplies Expenses</th>
      <th>Other General</th>
      <th>Janitorial Services</th>
      <th colspan="3">O T H E R S</th>
    </tr>
    <tr>
      <th>Date</th>
      <th>DV/Payroll/ Check No.</th>
      <th>Particulars</th>
      <th>Cash Advance</th>
      <th>Payments</th>
      <th>Balance</th>
      <th>5020301000</th>
      <th>5021299000</th>
      <th>5021202000</th>
      <th>Account Description</th>
      <th>UACS Object Code</th>
      <th>Amount</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
    <tr class="bold">
      <td colspan="3" class="center">TOTAL</td>
      <td class="right">${_fp(totalAdv)}</td>
      <td class="right">${_fp(totalPay)}</td>
      <td class="right">${_fp(finalBal)}</td>
      <td class="right">${totOffice > 0 ? _fp(totOffice) : ''}</td>
      <td class="right">${totGenSvc > 0 ? _fp(totGenSvc) : ''}</td>
      <td class="right">${totJanit  > 0 ? _fp(totJanit)  : ''}</td>
      <td></td><td></td><td></td>
    </tr>
  </tbody>
</table>

<!-- SIGNATURE BLOCK -->
<table style="width:100%;margin-top:16px" class="nb">
  <tr>
    <td style="width:40%;vertical-align:bottom">
      <div class="sig">
        <strong>${school.school_head || ''}</strong><br/>
        <span style="font-size:7pt">${school.designation || 'Principal/Head Teacher'}</span><br/>
        <span style="font-size:7pt">${school.short_name || school.name || ''}</span>
      </div>
    </td>
    <td style="width:20%"></td>
    <td style="width:40%;vertical-align:bottom">
      <div class="sig">
        <strong>${BOOKKEEPER}</strong><br/>
        <span style="font-size:7pt">${BOOKKEEPER_TITLE}</span><br/>
        <span style="font-size:7pt">Dulag West District</span>
      </div>
    </td>
  </tr>
</table>

<script>window.onload=()=>window.print();<\/script>
</body></html>`);
    w.document.close();
  },
};

const CDRMOOEView = {
  async render()      { return CDRView.render('mooe'); },
  async afterRender() { return CDRView.afterRender(); },
};
const CDRSpecialView = {
  async render()      { return CDRView.render('special'); },
  async afterRender() { return CDRView.afterRender(); },
};

// Helpers used inside printCDR template literals
function _fp(n) {
  const v = parseFloat(n) || 0;
  return v === 0 ? '' : v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _fd(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return (dt.getMonth() + 1) + '/' + dt.getDate() + '/' + dt.getFullYear();
}

