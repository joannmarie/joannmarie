// ============================================================
// DOWNLOADED FUNDS VIEW
// Tracks ADA disbursements per school with liquidation status
// ============================================================
const FundsView = {
  _schoolId: null,
  _schools: [],
  _category: '',
  _batchFunds: [],

  render(category = '') {
    this._category = category;
    this._schoolId = typeof Auth !== 'undefined' ? Auth.getSchoolId() : null;
    const isAdmin  = typeof Auth !== 'undefined' ? Auth.isAdmin() : false;

    const yr = new Date().getFullYear();
    const years = this._category === 'special' ? [yr, yr - 1] : [yr];

    const schoolFilter = this._schoolId
      ? `<input type="hidden" id="f-school" value="${this._schoolId}" /><div class="text-sm font-semibold text-gray-700">${this._schools.find(s=>s.id===this._schoolId)?.name||'My School'}</div>`
      : `<select id="f-school" class="form-select" onchange="FundsView.load()">
           <option value="">All Schools</option>
         </select>`;

    const fundTypeOpts = '';

    return `
    <div class="section-card mb-4">
      <div class="section-card-header"><h3>Filters</h3></div>
      <div class="section-card-body">
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label class="form-label">School</label>
            ${schoolFilter}
          </div>
          <div>
            <label class="form-label">Year</label>
            <select id="f-year" class="form-select" onchange="FundsView.load()">
              <option value="" ${this._category === 'special' ? 'selected' : ''}>All Years</option>
              ${years.map(y=>`<option value="${y}" ${this._category !== 'special' && y===yr ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Status</label>
            <select id="f-status" class="form-select" onchange="FundsView.load()">
              <option value="">All Statuses</option>
              <option value="unliquidated">Unliquidated</option>
              <option value="liquidated">Liquidated</option>
            </select>
          </div>
          <div>
            <label class="form-label">Fund Type</label>
            <select id="f-fund" class="form-select" onchange="FundsView.load()">
              <option value="">All</option>
              ${fundTypeOpts}
            </select>
          </div>
          ${isAdmin ? `
          <div class="flex items-end gap-2">
            <button class="btn btn-primary flex-1" onclick="FundsView.openBatch()">+ Add</button>
          </div>` : '<div></div>'}
        </div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card-header">
        <h3>Fund Records</h3>
        <div id="funds-summary" class="text-xs text-gray-500"></div>
      </div>
      <div id="funds-body" class="table-scroll">
        <div class="flex justify-center py-10"><div class="spinner"></div></div>
      </div>
    </div>`;
  },

  afterRender() { this._initView(); },

  async _initView() {
    const [schoolsRes, ftRes] = await Promise.all([
      DB.getSchools(),
      DB.getFundTypes(this._category),
    ]);
    this._schools = schoolsRes.data || [];

    // Populate school dropdown for admin
    const schoolSel = document.getElementById('f-school');
    if (schoolSel && !this._schoolId) {
      schoolSel.innerHTML = `<option value="">All Schools</option>` +
        this._schools.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    // Populate fund type dropdown
    const ftSel = document.getElementById('f-fund');
    if (ftSel) ftSel.innerHTML = `<option value="">All</option>` +
      (ftRes.data || []).map(t => `<option value="${t.name}">${t.name}</option>`).join('');

    this.load();
  },

  async load() {
    const school_id = this._schoolId || document.getElementById('f-school')?.value || '';
    const year      = document.getElementById('f-year')?.value   || '';
    const status    = document.getElementById('f-status')?.value || '';
    const fundType  = document.getElementById('f-fund')?.value   || '';

    const filters = {};
    if (school_id) filters.school_id = school_id;
    if (year)      filters.year = year;
    if (status)    filters.status = status;

    const { data } = await DB.getFunds(filters);
    let rows = data || [];
    if (fundType) rows = rows.filter(r => (r.fund_type || '').toLowerCase().includes(fundType.toLowerCase()));
    if (this._category === 'mooe')    rows = rows.filter(r => DashboardView._isMOOE(r.fund_type));
    if (this._category === 'special') rows = rows.filter(r => !DashboardView._isMOOE(r.fund_type));

    const isAdmin = typeof Auth !== 'undefined' ? Auth.isAdmin() : false;
    const el = document.getElementById('funds-body');
    const sumEl = document.getElementById('funds-summary');
    if (!el) return;

    const total    = rows.length;
    const liquid   = rows.filter(r=>r.status==='liquidated').length;
    const totalAmt = rows.reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
    if (sumEl) sumEl.textContent = `${total} records | Total: ${fmt(totalAmt)} | Liquidated: ${liquid} | Unliquidated: ${total - liquid}`;

    if (!rows.length) {
      el.innerHTML = emptyState('No fund records found. Click "+ Add" to add records.');
      return;
    }

    el.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>ADA No.</th>
        <th>ADA Date</th>
        <th>Fund Type</th>
        ${!this._schoolId ? '<th>School</th>' : ''}
        ${this._category === 'special' ? '<th>Bank</th>' : ''}
        <th class="col-amount">Amount</th>
        <th class="col-center">Status</th>
        <th class="col-center">Deadline</th>
        ${isAdmin ? '<th class="col-center">Actions</th>' : ''}
      </tr></thead>
      <tbody>
        ${rows.map(r => {
          const school = this._schools.find(s=>s.id===r.school_id);
          const badge = r.status === 'liquidated'
            ? `<span class="badge badge-liquidated">Liquidated</span>`
            : `<span class="badge badge-missing">Unliquidated</span>`;
          return `
          <tr>
            <td class="font-mono text-xs font-semibold">${r.ada_no || '—'}</td>
            <td class="text-xs whitespace-nowrap">${formatDate(r.ada_date)}</td>
            <td class="text-xs">${r.fund_type || '—'}</td>
            ${!this._schoolId ? `<td class="text-xs">${school?.name || r.school_id || '—'}</td>` : ''}
            ${this._category === 'special' ? `<td class="text-xs">${r.bank || '—'}</td>` : ''}
            <td class="col-amount font-semibold">${fmt(r.amount)}</td>
            <td class="col-center">${badge}</td>
            <td class="col-center text-xs text-gray-500">${r.deadline ? formatDate(r.deadline) : (r.remarks || '—')}</td>
            ${isAdmin ? `
            <td class="col-center">
              <div class="flex gap-1 justify-center">
                <button class="btn btn-secondary btn-sm" onclick="FundsView.openForm('${r.id}')">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="FundsView.deleteFund('${r.id}')">Del</button>
              </div>
            </td>` : ''}
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  },

  // ---- Batch Add ----
  async openBatch() {
    const [ftRes, fundsRes] = await Promise.all([
      DB.getFundTypes(''),
      DB.getFunds({}),
    ]);
    this._batchFunds = fundsRes.data || [];

    const schools = [...this._schools].sort((a, b) => a.name.localeCompare(b.name));
    const ftOpts  = (ftRes.data || []).map(t =>
      `<option value="${t.name}">${t.name}</option>`
    ).join('');

    const html = `
    <form id="fund-batch-form" onsubmit="FundsView.saveBatch(event)">
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
        <div class="col-span-2 md:col-span-3">
          <label class="form-label">Fund Type *</label>
          <select id="fb-fund-type" class="form-select" required onchange="FundsView.onBatchFundTypeChange()">
            <option value="">-- Select Fund Type --</option>
            ${ftOpts}
          </select>
        </div>
        <div>
          <label class="form-label">ADA Number *</label>
          <input id="fb-ada-no" type="text" class="form-input" required placeholder="e.g. 2626003"
                 oninput="FundsView.checkDuplicates()" />
        </div>
        <div>
          <label class="form-label">ADA Date *</label>
          <input id="fb-ada-date" type="date" class="form-input" required />
        </div>
        <div>
          <label class="form-label">Year *</label>
          <select id="fb-year" class="form-select" required>
            <option value="2026">2026</option>
          </select>
        </div>
        <div>
          <label class="form-label">Status</label>
          <select id="fb-status" class="form-select">
            <option value="unliquidated">Unliquidated</option>
            <option value="liquidated">Liquidated</option>
          </select>
        </div>
        <div>
          <label class="form-label">Deadline</label>
          <input id="fb-deadline" type="date" class="form-input" />
        </div>
        <div id="fb-bank-wrap" class="col-span-2 md:col-span-3 ${this._category === 'special' ? '' : 'hidden'}">
          <label class="form-label">Bank</label>
          <select id="fb-bank" class="form-select">
            ${BANKS.map(b=>`<option value="${b}">${b}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="table-scroll mb-3" style="max-height:320px">
        <table class="data-table">
          <thead><tr>
            <th>School</th>
            <th class="col-amount">
              Amount (₱)
              <span class="font-normal text-gray-400 text-xs ml-1">— leave blank to skip</span>
            </th>
          </tr></thead>
          <tbody>
            ${schools.map(s => `
            <tr id="fb-row-${s.id}">
              <td class="text-sm">
                ${s.name}
                <span id="fb-dup-${s.id}" class="text-xs text-amber-700 font-semibold ml-2"></span>
              </td>
              <td class="py-1">
                <input type="number" step="0.01" min="0" id="fb-amt-${s.id}"
                       class="form-input text-right" placeholder="—" />
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="flex gap-2 justify-end">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Batch</button>
      </div>
    </form>`;

    App.openModal('Add Fund Records — Batch', html);
  },

  onBatchFundTypeChange() {
    const ft         = document.getElementById('fb-fund-type')?.value || '';
    const isMOOE     = ft && typeof DashboardView !== 'undefined' && DashboardView._isMOOE(ft);
    const yearSel  = document.getElementById('fb-year');
    const bankWrap = document.getElementById('fb-bank-wrap');

    if (yearSel) {
      yearSel.innerHTML = isMOOE
        ? '<option value="2026">2026</option>'
        : '<option value="2026">2026</option><option value="2025">2025</option>';
    }
    if (bankWrap) bankWrap.classList.toggle('hidden', !!isMOOE);
    this.checkDuplicates();
  },

  checkDuplicates() {
    const adaNo = (document.getElementById('fb-ada-no')?.value || '').trim();
    const ft    = (document.getElementById('fb-fund-type')?.value || '').trim().toLowerCase();
    const schools = [...this._schools].sort((a, b) => a.name.localeCompare(b.name));

    schools.forEach(s => {
      const row  = document.getElementById(`fb-row-${s.id}`);
      const span = document.getElementById(`fb-dup-${s.id}`);
      if (!row || !span) return;

      const dup = adaNo && ft
        ? (this._batchFunds).find(f =>
            f.school_id === s.id &&
            (f.ada_no  || '').trim()       === adaNo &&
            (f.fund_type || '').trim().toLowerCase() === ft
          )
        : null;

      if (dup) {
        row.style.background = '#fffbeb';
        span.textContent     = `existing: ${fmt(dup.amount)}`;
      } else {
        row.style.background = '';
        span.textContent     = '';
      }
    });
  },

  async saveBatch(e) {
    e.preventDefault();
    const fundType = document.getElementById('fb-fund-type').value;
    const adaNo    = document.getElementById('fb-ada-no').value.trim();
    const adaDate  = document.getElementById('fb-ada-date').value;
    const year     = parseInt(document.getElementById('fb-year').value);
    const quarter  = this._category !== 'special' ? (document.getElementById('fb-quarter')?.value || '') : '';
    const status   = document.getElementById('fb-status').value;
    const deadline = document.getElementById('fb-deadline').value || null;
    const bank     = document.getElementById('fb-bank')?.value || '';

    const schools = [...this._schools].sort((a, b) => a.name.localeCompare(b.name));
    let saved = 0, skipped = 0;

    for (const s of schools) {
      const raw = (document.getElementById(`fb-amt-${s.id}`)?.value || '').trim();
      if (!raw) { skipped++; continue; }
      const amount = parseFloat(raw);
      if (isNaN(amount) || amount <= 0) { skipped++; continue; }

      const existing = this._batchFunds.find(f =>
        f.school_id === s.id &&
        (f.ada_no   || '').trim()       === adaNo &&
        (f.fund_type || '').trim().toLowerCase() === fundType.toLowerCase()
      );

      const row = {
        id:        existing ? existing.id : DB.newId(),
        school_id: s.id,
        ada_no:    adaNo,
        ada_date:  adaDate,
        fund_type: fundType,
        amount,
        year,
        quarter,
        status,
        deadline,
        bank,
        remarks: '',
      };

      const { error } = await DB.upsertFund(row);
      if (error) { App.toast(`Error saving ${s.name}: ${error?.message || error}`, 'error'); return; }
      saved++;
    }

    App.closeModal();
    App.toast(`Saved ${saved} record${saved !== 1 ? 's' : ''}${skipped ? ` — ${skipped} skipped` : ''}.`);
    await this.load();
  },

  // ---- Single-school Edit ----
  async openForm(id) {
    const [{ data }, { data: ftData }] = await Promise.all([
      DB.getFunds(),
      DB.getFundTypes(this._category),
    ]);
    const rec = id ? (data||[]).find(r=>r.id===id) : null;
    if (!rec) { App.toast('Record not found.', 'error'); return; }

    const yr    = new Date().getFullYear();
    const years = this._category === 'special' ? [yr, yr - 1] : [yr];
    const school = this._schools.find(s => s.id === rec.school_id);

    const ftOpts = (ftData || []).map(t =>
      `<option value="${t.name}" ${rec.fund_type===t.name?'selected':''}>${t.name}</option>`
    ).join('');

    const html = `
    <form id="fund-form" onsubmit="FundsView.saveFund(event,'${id}')">
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div class="col-span-2">
          <label class="form-label">School</label>
          <div class="form-input bg-gray-50 text-gray-700 text-sm">${school?.name || rec.school_id}</div>
        </div>
        <div>
          <label class="form-label">ADA Number *</label>
          <input id="fd-ada-no" type="text" class="form-input" required value="${rec.ada_no||''}" />
        </div>
        <div>
          <label class="form-label">ADA Date *</label>
          <input id="fd-ada-date" type="date" class="form-input" required value="${rec.ada_date||''}" />
        </div>
        <div class="col-span-2">
          <label class="form-label">Fund Type *</label>
          <select id="fd-fund" class="form-select" required>
            ${ftOpts}
          </select>
        </div>
        <div>
          <label class="form-label">Amount (₱) *</label>
          <input id="fd-amount" type="number" step="0.01" min="0" class="form-input" required value="${rec.amount||''}" />
        </div>
        <div>
          <label class="form-label">Year</label>
          <select id="fd-year" class="form-select">
            ${years.map(y=>`<option value="${y}" ${(rec.year||yr)==y?'selected':''}>${y}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Status *</label>
          <select id="fd-status" class="form-select" required>
            <option value="unliquidated" ${rec.status!=='liquidated'?'selected':''}>Unliquidated</option>
            <option value="liquidated"   ${rec.status==='liquidated'?'selected':''}>Liquidated</option>
          </select>
        </div>
        ${this._category !== 'mooe' ? `
        <div class="col-span-2">
          <label class="form-label">Bank</label>
          <select id="fd-bank" class="form-select">
            ${BANKS.map(b=>`<option value="${b}" ${rec.bank===b?'selected':''}>${b}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="col-span-2">
          <label class="form-label">Deadline</label>
          <input id="fd-deadline" type="date" class="form-input" value="${rec.deadline||rec.remarks||''}" />
        </div>
      </div>
      <div class="flex gap-2 justify-end">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Update Record</button>
      </div>
    </form>`;
    App.openModal('Edit Fund Record', html);
  },

  async saveFund(e, id) {
    e.preventDefault();
    const existing = await DB.getFunds();
    const rec = (existing.data||[]).find(r=>r.id===id);
    const row = {
      ...rec,
      id,
      ada_no:   document.getElementById('fd-ada-no').value.trim(),
      ada_date: document.getElementById('fd-ada-date').value,
      fund_type:document.getElementById('fd-fund').value,
      amount:   parseFloat(document.getElementById('fd-amount').value) || 0,
      year:     parseInt(document.getElementById('fd-year').value),
      quarter:  document.getElementById('fd-quarter')?.value || rec?.quarter || '',
      status:   document.getElementById('fd-status').value,
      deadline: document.getElementById('fd-deadline').value || null,
      bank:     document.getElementById('fd-bank')?.value || rec?.bank || '',
      remarks:  '',
    };
    const { error } = await DB.upsertFund(row);
    if (error) { App.toast('Error: ' + (error?.message || error), 'error'); return; }

    // Sync updated amount into the advance entry of any linked CDR
    const norm = s => (s || '').trim().toLowerCase();
    const { data: headers } = await DB.getCDRHeaders({ school_id: row.school_id });
    const linked = (headers || []).filter(h =>
      h.fund_id === id || norm(h.fund_type) === norm(row.fund_type)
    );
    for (const h of linked) {
      const { data: entries } = await DB.getCDREntries(h.id);
      const adv = (entries || []).find(e => parseFloat(e.advances) > 0);
      if (adv) await DB.upsertCDREntry({ ...adv, advances: row.amount });
    }

    App.closeModal();
    App.toast('Record updated!');
    await this.load();
  },

  async deleteFund(id) {
    if (!confirm('Delete this fund record?')) return;
    await DB.deleteFund(id);
    App.toast('Record deleted.');
    await this.load();
  },
};

const FundsMOOEView = {
  async render()      { return FundsView.render('mooe'); },
  async afterRender() { return FundsView.afterRender(); },
};
const FundsSpecialView = {
  async render()      { return FundsView.render('special'); },
  async afterRender() { return FundsView.afterRender(); },
};
