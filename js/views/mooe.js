// ============================================================
// MOOE MONITORING VIEW
// ============================================================
const MOOEView = {
  filters: { school_id: '', year: new Date().getFullYear().toString(), status: '', fund_type: '' },
  schools: [],

  render() {
    this._schoolId = typeof Auth !== 'undefined' ? Auth.getSchoolId() : null;
    if (this._schoolId) this.filters.school_id = this._schoolId;

    const schoolDropdown = this._schoolId
      ? `<select class="form-select" id="f-school" disabled>
           <option value="${this._schoolId}">My School</option>
         </select>`
      : `<select class="form-select" id="f-school" onchange="MOOEView.applyFilter()">
           <option value="">All Schools</option>
         </select>`;

    return `
    <div class="page-header flex items-start justify-between flex-wrap gap-3">
      <div><h2>Fund Releases</h2><p>Track all ADA disbursements per school</p></div>
      <button class="btn btn-primary" onclick="MOOEView.openForm()">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        Add MOOE/Special Funds
      </button>
    </div>

    <!-- Filters -->
    <div class="section-card mb-4">
      <div class="section-card-body">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label class="form-label">School</label>
            ${schoolDropdown}
          </div>
          <div>
            <label class="form-label">Year</label>
            <select class="form-select" id="f-year" onchange="MOOEView.applyFilter()">
              ${[2026, 2025, 2024].map(y => `<option value="${y}" ${this.filters.year == y ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Status</label>
            <select class="form-select" id="f-status" onchange="MOOEView.applyFilter()">
              <option value="">All Statuses</option>
              ${STATUSES.map(s => `<option value="${s.value}" ${this.filters.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Fund Type</label>
            <select class="form-select" id="f-fund" onchange="MOOEView.applyFilter()">
              <option value="">All Funds</option>
              ${FUND_TYPES.map(f => `<option value="${f}" ${this.filters.fund_type === f ? 'selected' : ''}>${f}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
    </div>

    <div id="mooe-table-container">
      <div class="flex justify-center py-10"><div class="spinner"></div></div>
    </div>
    `;
  },

  afterRender() { this._initView(); },

  async _initView() {
    const { data: schools } = await DB.getSchools();
    this.schools = schools || [];
    const sel = document.getElementById('f-school');
    if (sel) {
      if (this._schoolId) {
        const s = this.schools.find(s => s.id === this._schoolId);
        if (s) sel.innerHTML = `<option value="${this._schoolId}">${s.name}</option>`;
      } else {
        sel.innerHTML = `<option value="">All Schools</option>` +
          this.schools.map(s => `<option value="${s.id}" ${this.filters.school_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('');
      }
    }
    this.loadTable();
  },

  applyFilter() {
    this.filters.school_id = this._schoolId || document.getElementById('f-school')?.value || '';
    this.filters.year = document.getElementById('f-year')?.value || '';
    this.filters.status = document.getElementById('f-status')?.value || '';
    this.filters.fund_type = document.getElementById('f-fund')?.value || '';
    this.loadTable();
  },

  async loadTable() {
    const container = document.getElementById('mooe-table-container');
    if (!container) return;
    const { data, error } = await DB.getDisbursements(this.filters);
    const rows = data || [];

    // Apply fund_type filter locally
    const filtered = this.filters.fund_type ? rows.filter(r => r.fund_type === this.filters.fund_type) : rows;
    const total = filtered.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    if (error) { container.innerHTML = `<div class="section-card section-card-body text-red-600">Error loading data: ${error.message || error}</div>`; return; }

    container.innerHTML = `
    <div class="section-card">
      <div class="section-card-header">
        <h3>${filtered.length} disbursement(s) — Total: <span class="text-[#0038A8]">${fmt(total)}</span></h3>
        <button class="btn btn-secondary btn-sm" onclick="MOOEView.exportCSV()">⬇ Export CSV</button>
      </div>
      ${filtered.length === 0 ? emptyState('No disbursements found. Add one above.') : `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr>
            <th>ADA No.</th><th>ADA Date</th><th>Fund Type</th><th>Bank</th>
            <th>School</th><th class="col-amount">Amount</th>
            <th>Status</th><th>Remarks</th><th class="text-center">Action</th>
          </tr></thead>
          <tbody>
            ${filtered.map(r => `
            <tr>
              <td class="font-mono text-xs">${r.ada_no || '—'}</td>
              <td class="whitespace-nowrap">${formatDate(r.ada_date)}</td>
              <td>${r.fund_type || '—'}</td>
              <td><span class="badge ${r.bank === 'LBP' ? 'badge-submitted' : 'badge-pending'}">${r.bank || '—'}</span></td>
              <td>${schoolNameById(r.school_id, this.schools)}</td>
              <td class="col-amount font-semibold tabular-nums">${fmt(r.amount)}</td>
              <td>${statusBadge(r.status)}</td>
              <td class="text-xs text-gray-500 max-w-xs truncate">${r.remarks || ''}</td>
              <td class="text-center whitespace-nowrap">
                <button class="btn btn-secondary btn-sm mr-1" onclick="MOOEView.openForm('${r.id}')">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="MOOEView.deleteDisbursement('${r.id}')">Del</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>`;
  },

  async openForm(id = null) {
    const { data: schools } = await DB.getSchools();
    let row = { ada_no: '', ada_date: '', fund_type: '', bank: 'LBP', school_id: '', amount: '', status: 'pending', remarks: '' };
    if (id) {
      const { data: disb } = await DB.getDisbursements();
      const found = (disb || []).find(r => r.id === id);
      if (found) row = found;
    }
    App.openModal(id ? 'Edit Disbursement' : 'Add Disbursement', `
    <form id="disb-form" onsubmit="MOOEView.saveForm(event, '${id || ''}')">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label class="form-label">ADA No.</label>
          <input class="form-input" name="ada_no" value="${row.ada_no || ''}" placeholder="e.g. 2626003" required />
        </div>
        <div>
          <label class="form-label">ADA Date</label>
          <input class="form-input" type="date" name="ada_date" value="${row.ada_date || ''}" required />
        </div>
        <div>
          <label class="form-label">School</label>
          <select class="form-select" name="school_id" required>
            <option value="">— Select School —</option>
            ${(schools || []).map(s => `<option value="${s.id}" ${row.school_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Fund Type</label>
          <select class="form-select" name="fund_type" required>
            <option value="">— Select —</option>
            ${FUND_TYPES.map(f => `<option value="${f}" ${row.fund_type === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Bank</label>
          <select class="form-select" name="bank">
            ${BANKS.map(b => `<option value="${b}" ${row.bank === b ? 'selected' : ''}>${b}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Amount (₱)</label>
          <input class="form-input" type="number" step="0.01" name="amount" value="${row.amount || ''}" placeholder="0.00" required />
        </div>
        <div>
          <label class="form-label">Status</label>
          <select class="form-select" name="status">
            ${STATUSES.map(s => `<option value="${s.value}" ${row.status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Remarks</label>
          <input class="form-input" name="remarks" value="${row.remarks || ''}" placeholder="Optional remarks" />
        </div>
      </div>
      <div class="flex justify-end gap-3">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);
  },

  async saveForm(e, id) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const row = {
      id: id || DB.newId(),
      ada_no: fd.get('ada_no'),
      ada_date: fd.get('ada_date'),
      fund_type: fd.get('fund_type'),
      bank: fd.get('bank'),
      school_id: fd.get('school_id'),
      amount: parseFloat(fd.get('amount')),
      status: fd.get('status'),
      remarks: fd.get('remarks'),
    };
    const { error } = await DB.upsertDisbursement(row);
    if (error) { App.toast('Error saving: ' + (error.message || error), 'error'); return; }
    App.closeModal();
    App.toast('Disbursement saved!');
    await this.loadTable();
  },

  async deleteDisbursement(id) {
    if (!confirm('Delete this disbursement?')) return;
    const { error } = await DB.deleteDisbursement(id);
    if (error) { App.toast('Error: ' + (error?.message || error), 'error'); return; }
    App.toast('Deleted.');
    await this.loadTable();
  },

  async exportCSV() {
    const { data } = await DB.getDisbursements(this.filters);
    const rows = data || [];
    const headers = ['ADA No.', 'ADA Date', 'Fund Type', 'Bank', 'School', 'Amount', 'Status', 'Remarks'];
    const csv = [headers.join(','), ...rows.map(r => [
      r.ada_no, r.ada_date, r.fund_type, r.bank,
      schoolNameById(r.school_id, this.schools), r.amount, r.status, r.remarks
    ].map(v => `"${v || ''}"`).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `MOOE-${this.filters.year}.csv`;
    a.click();
  }
};

function schoolNameById(id, schools) {
  const s = (schools || []).find(s => s.id === id);
  return s ? s.name : '—';
}
