// ============================================================
// CDR EXCEL DOWNLOAD  —  fills assets/cdr_template.xlsx
// Uses SheetJS (XLSX) — already loaded — for reliable template edits
// ============================================================
const CDRExcel = {
  async download(id) {
    try {
      if (typeof XLSX === 'undefined') {
        App.toast('SheetJS library not loaded. Please refresh.', 'error');
        return;
      }

      App.toast('Loading template…');

      const [headerRes, entriesRes, schoolsRes, tplResp] = await Promise.all([
        DB.getCDRHeader(id),
        DB.getCDREntries(id),
        DB.getSchools(),
        fetch('assets/cdr_template.xlsx'),
      ]);

      const header = headerRes.data;
      if (!header) { App.toast('CDR not found', 'error'); return; }
      if (!tplResp.ok) throw new Error('Template file not found');

      const school    = (schoolsRes.data || []).find(s => s.id === header.school_id) || {};
      const shortName = school.short_name || school.name || 'School';
      const sName     = (school.name || '').toUpperCase();
      const qNum      = header.quarter.replace('Q', '');
      const suffix    = `-Q${qNum}`;

      // Inject cash advance entry if none present (matches printCDR logic)
      let allEntries = [...(entriesRes.data || [])];
      let startBal   = 0;
      if (!allEntries.some(e => (parseFloat(e.advances) || 0) > 0)) {
        const injected = await _cdrInjectAdvance(header, allEntries);
        if (injected.length > allEntries.length) { allEntries = injected; }
      }

      // Compute running balances in JS
      const COL_OFF = '5020301000', COL_GEN = '5021299000', COL_JAN = '5021202000';
      let bal = startBal;
      const rows = allEntries.map((e, i) => {
        const adv = parseFloat(e.advances) || 0;
        const pay = parseFloat(e.payment)  || 0;
        bal += adv - pay;
        const isOff = e.uacs_code === COL_OFF;
        const isGen = e.uacs_code === COL_GEN;
        const isJan = e.uacs_code === COL_JAN;
        const isOth = !isOff && !isGen && !isJan && pay > 0;
        const desc  = isOth
          ? (e.uacs_desc || (UACS_CODES.find(u => u.code === e.uacs_code)?.desc) || '')
          : '';
        return { e, i, adv, pay, bal, isOff, isGen, isJan, isOth, desc };
      });

      // Load template with SheetJS (cellStyles preserves s= attributes on cells)
      const buf = new Uint8Array(await tplResp.arrayBuffer());
      const wb  = XLSX.read(buf, { type: 'array', cellStyles: true, cellDates: false });

      // Find and rename target sheet
      const wsIdx = wb.SheetNames.findIndex(n => n.endsWith(suffix));
      if (wsIdx === -1) throw new Error(`No sheet ending in "${suffix}" found in template`);
      const ws      = wb.Sheets[wb.SheetNames[wsIdx]];
      const oldName = wb.SheetNames[wsIdx];
      const newName = shortName + suffix;
      wb.SheetNames[wsIdx] = newName;
      wb.Sheets[newName]   = ws;
      if (oldName !== newName) delete wb.Sheets[oldName];

      // Remove other quarter sheets; keep UACS
      [...wb.SheetNames].forEach(n => {
        if (n === newName || n === 'UACS') return;
        wb.SheetNames.splice(wb.SheetNames.indexOf(n), 1);
        delete wb.Sheets[n];
      });

      // In-place cell helpers — update value without destroying style (s= attribute)
      const enc = (r, c) => XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });

      const setStr = (a, v) => {
        const cell = ws[a] || {};
        ws[a] = { ...cell, v: String(v), t: 's', w: String(v) };
        delete ws[a].f;
      };
      const setNum = (a, v, z) => {
        const cell = ws[a] || {};
        ws[a] = { ...cell, v, t: 'n' };
        if (z) ws[a].z = z;
        delete ws[a].f;
        delete ws[a].w;
      };
      const clr = a => {
        const cell = ws[a];
        if (cell) { ws[a] = { ...cell, v: '', t: 's', w: '' }; delete ws[a].f; }
      };

      // Excel date serial (days since Jan 0, 1900; accounts for Excel's leap-year bug)
      const toSerial = dateStr => {
        const ms = new Date(dateStr + 'T00:00:00Z').getTime();
        return Math.round(ms / 86400000) + 25569;
      };

      // ── Header cells ──
      setStr('A3',  sName);
      setStr('A8',  `Entity Name: ${sName}`);
      setStr('I8',  `Name of Accountable Officer: ${school.school_head || ''}`);
      setStr('I9',  `Official Designation: ${school.designation || ''}`);
      setStr('I10', `Station: ${shortName}`);
      setStr('I11', `Register No. : ${header.register_no || '_____'}`);
      setStr('I12', `Sheet No. : ${header.sheet_no || '_____'}`);

      // ── Clear data rows 19-65, columns A-L ──
      const FIRST = 19, LAST = 65;
      for (let r = FIRST; r <= LAST; r++) {
        for (let c = 1; c <= 12; c++) clr(enc(r, c));
      }

      // ── Write data rows ──
      rows.forEach(({ e, i, adv, pay, bal: b, isOff, isGen, isJan, isOth, desc }) => {
        const rn = FIRST + i;
        if (rn > LAST) return;

        if (e.entry_date)  setNum(enc(rn, 1), toSerial(e.entry_date), 'MM/DD/YYYY');
        if (e.ref_no)      setStr(enc(rn, 2), e.ref_no);
        if (e.particulars) setStr(enc(rn, 3), e.particulars);
        if (i === 0 && adv > 0) setNum(enc(rn, 4), adv, '#,##0.00');
        if (pay > 0)            setNum(enc(rn, 5), pay, '#,##0.00');
        setNum(enc(rn, 6), b, '#,##0.00');
        if (isOff) setNum(enc(rn, 7), pay, '#,##0.00');
        if (isGen) setNum(enc(rn, 8), pay, '#,##0.00');
        if (isJan) setNum(enc(rn, 9), pay, '#,##0.00');
        if (isOth) {
          if (desc)        setStr(enc(rn, 10), desc);
          if (e.uacs_code) setStr(enc(rn, 11), e.uacs_code);
          setNum(enc(rn, 12), pay, '#,##0.00');
        }
      });

      // ── Download ──
      const safeName = shortName.replace(/[\s/\\]+/g, '_');
      const out  = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
      const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `CDR_${header.year}_${safeName}_Q${qNum}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      App.toast('Excel downloaded!');
    } catch (err) {
      App.toast('Excel error: ' + (err.message || err), 'error');
    }
  },
};

// Looks up the matching fund release and prepends a cash-advance entry
async function _cdrInjectAdvance(header, entries) {
  const { data: funds } = await DB.getFunds({ school_id: header.school_id });
  const norm    = s => (s || '').trim().toLowerCase();
  const matched = (funds || [])
    .filter(f => norm(f.fund_type) === norm(header.fund_type))
    .sort((a, b) => (b.ada_date || '').localeCompare(a.ada_date || ''));
  const rf = matched[0];
  if (!rf) return entries;
  const ord      = { Q1: '1st', Q2: '2nd', Q3: '3rd', Q4: '4th' };
  const isMOOE   = typeof DashboardView !== 'undefined' && DashboardView._isMOOE(header.fund_type);
  const particulars = isMOOE
    ? `Operating Advances for ${ord[header.quarter] || header.quarter} Quarter`
    : `Operating Advances for ${header.fund_type}`;
  return [{
    id: '_adv', entry_date: rf.ada_date, ref_no: rf.ada_no || '',
    particulars, uacs_code: '', uacs_desc: '',
    advances: parseFloat(rf.amount) || 0, payment: 0,
  }, ...entries];
}
