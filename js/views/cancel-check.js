// ============================================================
// CANCEL CHECK VIEW — records voided / cancelled checks
// ============================================================
const CancelCheckView = {
  _schools:     [],
  _records:     [],
  _currentRows: [],
  _schoolFilter: '',
  _yearFilter:   '',

  async render() {
    const isAdmin = typeof Auth !== 'undefined' && Auth.isAdmin();
    const cols    = isAdmin ? 8 : 7;
    return `
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div class="flex gap-2 flex-wrap">
        ${isAdmin ? `<select id="cc-school" class="form-select" style="min-width:180px"><option value="">All Schools</option></select>` : ''}
        <select id="cc-year" class="form-select" style="min-width:120px"><option value="">All Years</option></select>
      </div>
      <button class="btn btn-primary btn-sm" onclick="CancelCheckView.openForm()">+ Add</button>
    </div>
    <div class="section-card">
      <div class="section-card-header">
        <h3>Cancelled Checks</h3>
        <span id="cc-count" class="text-xs text-gray-500"></span>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>
            <th>#</th>
            <th>Date</th>
            <th>Check No.</th>
            <th>Payee</th>
            ${isAdmin ? '<th>School</th>' : ''}
            <th class="col-amount">Amount</th>
            <th>Reason</th>
            <th class="col-center">Actions</th>
          </tr></thead>
          <tbody id="cc-tbody">
            <tr><td colspan="${cols}" class="text-center text-gray-400 py-8 text-sm">
              <div class="spinner" style="margin:0 auto"></div>
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
  },

  afterRender() {
    const isAdmin      = typeof Auth !== 'undefined' && Auth.isAdmin();
    const userSchoolId = typeof Auth !== 'undefined' ? Auth.getSchoolId() : null;

    this._schoolFilter = isAdmin ? '' : (userSchoolId || '');
    this._yearFilter   = '';

    if (isAdmin) {
      document.getElementById('cc-school')?.addEventListener('change', e => {
        this._schoolFilter = e.target.value; this._paint();
      });
    }
    document.getElementById('cc-year')?.addEventListener('change', e => {
      this._yearFilter = e.target.value; this._paint();
    });

    // If cached from a previous visit, render instantly then refresh in background
    if (this._schools.length || this._records.length) {
      this._rebuildFilters(isAdmin);
      this._paint();
    }

    // Load / refresh data — truly background, does not block navigate()
    this._loadData(isAdmin, userSchoolId);
  },

  _rebuildFilters(isAdmin) {
    if (isAdmin) {
      const sel = document.getElementById('cc-school');
      if (sel) sel.innerHTML = `<option value="">All Schools</option>` +
        this._schools.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
    const years = [...new Set(this._records.map(r => (r.date || '').slice(0, 4)).filter(Boolean))].sort((a, b) => b - a);
    const yrSel = document.getElementById('cc-year');
    if (yrSel) yrSel.innerHTML = `<option value="">All Years</option>` +
      years.map(y => `<option value="${y}">${y}</option>`).join('');
  },

  async _loadData(isAdmin, userSchoolId) {
    const filters = isAdmin ? {} : { school_id: userSchoolId };
    const [schoolsRes, recordsRes] = await Promise.all([
      DB.getSchools(),
      DB.getCancelledChecks(filters),
    ]);
    this._schools = schoolsRes.data || [];
    this._records = recordsRes.data || [];
    this._rebuildFilters(isAdmin);
    this._paint();
  },

  _paint() {
    const tbody   = document.getElementById('cc-tbody');
    const countEl = document.getElementById('cc-count');
    if (!tbody) return;

    const isAdmin   = typeof Auth !== 'undefined' && Auth.isAdmin();
    const cols      = isAdmin ? 8 : 7;
    const schoolMap = new Map(this._schools.map(s => [s.id, s]));

    let rows = [...this._records];
    if (this._schoolFilter) rows = rows.filter(r => r.school_id === this._schoolFilter);
    if (this._yearFilter)   rows = rows.filter(r => (r.date || '').startsWith(this._yearFilter));

    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    this._currentRows = rows;

    if (countEl) countEl.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${cols}" class="text-center text-gray-400 py-8 text-sm">No cancelled checks found.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((r, i) => {
      const school = schoolMap.get(r.school_id);
      return `<tr>
        <td class="text-xs text-gray-400">${i + 1}</td>
        <td class="text-xs whitespace-nowrap">${formatDate(r.date)}</td>
        <td class="text-xs font-mono">${r.check_no || '—'}</td>
        <td class="text-xs">${r.payee || '—'}</td>
        ${isAdmin ? `<td class="text-xs">${school?.short_name || school?.name || '—'}</td>` : ''}
        <td class="col-amount text-xs font-semibold">${r.amount != null ? fmt(r.amount) : '—'}</td>
        <td class="text-xs text-gray-500 max-w-xs truncate">${r.reason || '—'}</td>
        <td class="col-center">
          <div class="flex gap-1 justify-center">
            <button class="btn btn-secondary btn-sm" onclick="CancelCheckView.openForm('${r.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="CancelCheckView.deleteRecord('${r.id}')">Del</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  },

  openForm(id = null) {
    const isAdmin      = typeof Auth !== 'undefined' && Auth.isAdmin();
    const userSchoolId = typeof Auth !== 'undefined' ? Auth.getSchoolId() : null;
    const rec          = id ? this._records.find(r => r.id === id) : null;

    const schoolField = isAdmin
      ? `<div class="col-span-2">
           <label class="form-label">School *</label>
           <select id="cc-school-sel" class="form-select" required>
             <option value="">-- Select School --</option>
             ${this._schools.map(s => `<option value="${s.id}" ${rec?.school_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
           </select>
         </div>`
      : `<input type="hidden" id="cc-school-sel" value="${userSchoolId || ''}" />`;

    const html = `
    <form id="cc-form" onsubmit="CancelCheckView.saveForm(event,'${id || ''}')">
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label class="form-label">Date *</label>
          <input id="cc-date" type="date" class="form-input" required value="${rec?.date || ''}" />
        </div>
        <div>
          <label class="form-label">Check No. *</label>
          <input id="cc-check-no" type="text" class="form-input" required value="${rec?.check_no || ''}" placeholder="e.g. 12345678" />
        </div>
        <div>
          <label class="form-label">Amount (₱)</label>
          <input id="cc-amount" type="number" step="0.01" min="0" class="form-input" value="${rec?.amount ?? ''}" placeholder="0.00" />
        </div>
        <div class="col-span-2">
          <label class="form-label">Payee</label>
          <input id="cc-payee" type="text" class="form-input" value="${rec?.payee || ''}" placeholder="Name of payee (optional)" />
        </div>
        ${schoolField}
        <div class="col-span-2">
          <label class="form-label">Reason for Cancellation</label>
          <textarea id="cc-reason" class="form-input" rows="2" placeholder="e.g. Stale dated, wrong amount, duplicate...">${rec?.reason || ''}</textarea>
        </div>
      </div>
      <div class="flex gap-2 justify-end">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? 'Update' : 'Save'} Record</button>
      </div>
    </form>`;

    App.openModal(id ? 'Edit Cancelled Check' : 'Add Cancelled Check', html);
  },

  async saveForm(e, id) {
    e.preventDefault();
    const row = {
      id:        id || DB.newId(),
      date:      document.getElementById('cc-date').value,
      check_no:  document.getElementById('cc-check-no').value.trim(),
      payee:     document.getElementById('cc-payee').value.trim(),
      amount:    parseFloat(document.getElementById('cc-amount').value) || null,
      school_id: document.getElementById('cc-school-sel').value,
      reason:    document.getElementById('cc-reason').value.trim(),
    };

    // Optimistic update — close modal and refresh table immediately
    const isNew = !id;
    const idx   = this._records.findIndex(r => r.id === row.id);
    const prev  = idx > -1 ? { ...this._records[idx] } : null;
    if (idx > -1) this._records[idx] = row; else this._records.push(row);
    App.closeModal();
    this._paint();
    App.toast(isNew ? 'Record saved!' : 'Record updated!');

    // Background save to Supabase
    const { error } = await DB.upsertCancelledCheck(row);
    if (error) {
      // Revert on failure
      if (isNew) this._records = this._records.filter(r => r.id !== row.id);
      else if (prev && idx > -1) this._records[idx] = prev;
      this._paint();
      App.toast('Error saving: ' + (error?.message || error), 'error');
    }
  },

  async deleteRecord(id) {
    if (!confirm('Delete this cancelled check record?')) return;
    // Optimistic: remove row immediately
    const removed = this._records.find(r => r.id === id);
    this._records = this._records.filter(r => r.id !== id);
    this._paint();
    App.toast('Record deleted.');

    const { error } = await DB.deleteCancelledCheck(id);
    if (error) {
      if (removed) this._records.push(removed);
      this._paint();
      App.toast('Error deleting: ' + (error?.message || error), 'error');
    }
  },
};
