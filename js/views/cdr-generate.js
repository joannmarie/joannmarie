// ============================================================
// CDR GENERATE — copies a JSON data block to the clipboard
// for pasting into a Google Sheets CDR Tools script.
// ============================================================
const CDRGenerate = {
  async copyBlock(cdrHeaderId) {
    try {
      const [headerRes, entriesRes, schoolsRes] = await Promise.all([
        DB.getCDRHeader(cdrHeaderId),
        DB.getCDREntries(cdrHeaderId),
        DB.getSchools(),
      ]);

      const header  = headerRes.data;
      if (!header) { App.toast('CDR not found.', 'error'); return; }

      const school  = (schoolsRes.data || []).find(s => s.id === header.school_id) || {};
      const entries = (entriesRes.data || []).slice().sort((a, b) => a.sort_order - b.sort_order);

      const block = {
        header: {
          school_name:  school.name        || '',
          school_short: school.short_name  || '',
          school_head:  school.school_head || '',
          designation:  school.designation || '',
          quarter:      header.quarter     || '',
          register_no:  header.register_no || '',
          sheet_no:     header.sheet_no    || '',
        },
        entries: entries.map(e => ({
          entry_date:  e.entry_date  || '',
          ref_no:      e.ref_no      || '',
          particulars: e.particulars || '',
          uacs_code:   e.uacs_code   || '',
          uacs_desc:   e.uacs_desc   || '',
          advances:    e.advances    || 0,
          payment:     e.payment     || 0,
        })),
      };

      const json = JSON.stringify(block, null, 2);

      try {
        await navigator.clipboard.writeText(json);
        App.toast('CDR data copied! Paste it in Google Sheets → CDR Tools.');
      } catch (_) {
        // Clipboard blocked — show JSON in modal for manual copy
        App.openModal('Copy CDR Data', `
          <p class="text-sm text-gray-600 mb-3">
            Clipboard access was blocked. Select all and copy manually.
          </p>
          <textarea class="form-input font-mono text-xs w-full" rows="18"
            onclick="this.select()" readonly>${json}</textarea>
          <div class="flex justify-end mt-3">
            <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
          </div>`);
      }
    } catch (err) {
      App.toast('Error generating CDR data: ' + (err.message || err), 'error');
    }
  },
};
