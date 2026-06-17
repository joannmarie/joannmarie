// ============================================================
// SCHOOLS VIEW  —  Accountable Officers management
// ============================================================
const SchoolsView = {
  async render() {
    const isAdmin = typeof Auth !== 'undefined' ? Auth.isAdmin() : false;
    return `
    <div class="page-header">
      <h2>Schools</h2>
      <p>Accountable Officers — 14 schools of Dulag West District</p>
    </div>
    <div class="section-card">
      <div class="section-card-header">
        <h3>School List</h3>
        ${isAdmin ? `<div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="SchoolsView.seedDefaults()">Load Defaults</button>
          <button class="btn btn-primary btn-sm" onclick="SchoolsView.openForm()">+ Add School</button>
        </div>` : ''}
      </div>
      <div id="schools-body" class="table-scroll">
        <div class="flex justify-center py-10"><div class="spinner"></div></div>
      </div>
    </div>`;
  },

  afterRender() { this.load(); },

  async load() {
    const { data } = await DB.getSchools();
    const schools = data || [];
    const isAdmin = typeof Auth !== 'undefined' ? Auth.isAdmin() : false;
    const el = document.getElementById('schools-body');
    if (!el) return;

    if (!schools.length) {
      el.innerHTML = emptyState('No schools yet. Click "Load Defaults" to add all 14 Dulag West District schools.');
      return;
    }

    const today = new Date();
    el.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>#</th><th>School Name</th><th>Short Name</th>
        <th>School Head</th><th>Designation</th>
        <th>Confirmation Letter Expiry</th>${isAdmin ? '<th>Actions</th>' : ''}
      </tr></thead>
      <tbody>
        ${schools.map((s, i) => {
          const expiry = s.confirmation_expiry ? new Date(s.confirmation_expiry) : null;
          const diff = expiry ? (expiry - today) / 86400000 : null;
          let expiryBadge = '—';
          if (expiry) {
            if (diff < 0) expiryBadge = `<span class="badge badge-missing">EXPIRED ${formatDate(s.confirmation_expiry)}</span>`;
            else if (diff <= 30) expiryBadge = `<span class="badge badge-pending">⚠ ${formatDate(s.confirmation_expiry)}</span>`;
            else if (diff <= 60) expiryBadge = `<span class="badge" style="background:#fef9c3;color:#92400e">⏰ ${formatDate(s.confirmation_expiry)}</span>`;
            else expiryBadge = `<span class="badge badge-liquidated">${formatDate(s.confirmation_expiry)}</span>`;
          }
          return `
          <tr>
            <td class="text-xs text-gray-400">${i + 1}</td>
            <td class="font-medium">${s.name}</td>
            <td class="text-xs text-gray-600">${s.short_name || '—'}</td>
            <td>${s.school_head || '—'}</td>
            <td class="text-xs text-gray-600">${s.designation || '—'}</td>
            <td>${expiryBadge}</td>
            ${isAdmin ? `<td>
              <div class="flex gap-1">
                <button class="btn btn-secondary btn-sm" onclick="SchoolsView.openForm('${s.id}')">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="SchoolsView.deleteSchool('${s.id}')">Del</button>
              </div>
            </td>` : ''}
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  },

  openForm(id) {
    DB.getSchools().then(({ data }) => {
      const schools = data || [];
      const s = id ? schools.find(x => x.id === id) : null;

      const html = `
      <form id="school-form" onsubmit="SchoolsView.saveSchool(event,'${id || ''}')">
        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="col-span-2">
            <label class="form-label">School Name *</label>
            <input id="s-name" type="text" class="form-input" required value="${s?.name || ''}" />
          </div>
          <div>
            <label class="form-label">Short Name</label>
            <input id="s-short" type="text" class="form-input" placeholder="e.g. Alegre ES" value="${s?.short_name || ''}" />
          </div>
          <div>
            <label class="form-label">School ID / Code</label>
            <input id="s-code" type="text" class="form-input" placeholder="School BEIS ID" value="${s?.school_code || ''}" />
          </div>
          <div class="col-span-2">
            <label class="form-label">School Head / Principal Name *</label>
            <input id="s-head" type="text" class="form-input" required value="${s?.school_head || ''}" />
          </div>
          <div class="col-span-2">
            <label class="form-label">Designation</label>
            <input id="s-desig" type="text" class="form-input" placeholder="e.g. Principal I, Head Teacher III" value="${s?.designation || ''}" />
          </div>
          <div class="col-span-2">
            <label class="form-label">Confirmation Letter Expiry Date</label>
            <input id="s-expiry" type="date" class="form-input" value="${s?.confirmation_expiry || ''}" />
          </div>
        </div>
        <div class="flex gap-2 justify-end">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">${s ? 'Update' : 'Add'} School</button>
        </div>
      </form>`;

      App.openModal(s ? 'Edit School' : 'Add School', html);
    });
  },

  async saveSchool(e, id) {
    e.preventDefault();
    const row = {
      id: id || DB.newId(),
      name: document.getElementById('s-name').value.trim(),
      short_name: document.getElementById('s-short').value.trim(),
      school_code: document.getElementById('s-code').value.trim(),
      school_head: document.getElementById('s-head').value.trim(),
      designation: document.getElementById('s-desig').value.trim(),
      confirmation_expiry: document.getElementById('s-expiry').value || null,
    };
    const { error } = await DB.upsertSchool(row);
    if (error) { App.toast('Error: ' + (error?.message || error), 'error'); return; }
    App.closeModal();
    App.toast(id ? 'School updated!' : 'School added!');
    await this.load();
  },

  async deleteSchool(id) {
    if (!confirm('Delete this school? This will not delete related disbursements.')) return;
    await DB.deleteSchool(id);
    App.toast('School deleted.');
    await this.load();
  },

  async seedDefaults() {
    if (!confirm('Load all 14 Dulag West District schools? Existing school records with the same name will be updated.')) return;

    const defaults = [
      { id: 's_alegre',     name: 'Alegre Elementary School',       short_name: 'Alegre ES',      school_head: 'CONSUELO V. HINAY',       designation: 'Head Teacher III', confirmation_expiry: '2027-01-09' },
      { id: 's_arado',      name: 'Arado Elementary School',        short_name: 'Arado ES',       school_head: 'RIZALINA B. ARIAS',       designation: 'Head Teacher III', confirmation_expiry: '2026-09-29' },
      { id: 's_batug',      name: 'Batug Elementary School',        short_name: 'Batug ES',       school_head: 'EMY T. ELIZARDE',         designation: 'Head Teacher III', confirmation_expiry: '2026-05-05' },
      { id: 's_cabacungan', name: 'Cabacungan Elementary School',   short_name: 'Cabacungan ES',  school_head: 'ROSALIE C. PALAÑA',       designation: 'Head Teacher III', confirmation_expiry: '2026-05-05' },
      { id: 's_cabarasan',  name: 'Cabarasan Elementary School',    short_name: 'Cabarasan ES',   school_head: 'GLORIA L. PATAWE',        designation: 'Head Teacher III', confirmation_expiry: '2026-09-30' },
      { id: 's_cabatoan',   name: 'Cabatoan Elementary School',     short_name: 'Cabatoan ES',    school_head: 'ROLEXAN L. MERCADO',      designation: 'Head Teacher III', confirmation_expiry: '2027-02-17' },
      { id: 's_calipayan',  name: 'Calipayan Elementary School',    short_name: 'Calipayan ES',   school_head: 'LIGAYA L. SAÑO',          designation: 'Head Teacher III', confirmation_expiry: null },
      { id: 's_delcarmen',  name: 'Del Carmen Elementary School',   short_name: 'Del Carmen ES',  school_head: 'MARVY D. ABAD',           designation: 'Head Teacher III', confirmation_expiry: '2026-09-30' },
      { id: 's_genroxas',   name: 'Gen. Roxas Elementary School',   short_name: 'Gen. Roxas ES',  school_head: 'CRISMERALDA R. BOLLENA',  designation: 'Head Teacher III', confirmation_expiry: '2026-09-30' },
      { id: 's_mhdelpilar', name: 'M.H. Del Pilar Elementary School',short_name: 'M.H Del Pilar ES',school_head: 'REMINA RIVAS',         designation: 'Head Teacher III', confirmation_expiry: null },
      { id: 's_maricum',    name: 'Maricum Elementary School',      short_name: 'Maricum ES',     school_head: 'EFREN V. GENOTIVA',       designation: 'Head Teacher III', confirmation_expiry: '2026-09-30' },
      { id: 's_rawis',      name: 'Rawis Elementary School',        short_name: 'Rawis ES',       school_head: 'BELEN S. GRADO',          designation: 'Head Teacher III', confirmation_expiry: '2027-02-15' },
      { id: 's_sanantonio', name: 'San Antonio Elementary School',  short_name: 'San Antonio ES', school_head: 'RETCHIE G. BRECIO',       designation: 'Head Teacher III', confirmation_expiry: '2027-01-12' },
      { id: 's_tabu',       name: 'Tabu Elementary School',         short_name: 'Tabu ES',        school_head: 'GLENDA L. YU',            designation: 'Head Teacher III', confirmation_expiry: '2026-03-27' },
    ];

    let count = 0;
    for (const s of defaults) {
      await DB.upsertSchool(s);
      count++;
    }
    App.toast(`Loaded ${count} schools!`);
    await this.load();
  },
};
