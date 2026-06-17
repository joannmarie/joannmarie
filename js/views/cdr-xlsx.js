// ============================================================
// CDR EXCEL DOWNLOAD — xlsx-populate (preserves template formatting)
// Unused data/recap rows are hidden (not deleted) so Totals and
// signatures visually follow the last entry.
// ============================================================
async function _loadXlsxPopulate() {
  if (typeof XlsxPopulate !== 'undefined') return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/xlsx-populate@1.21.0/browser/xlsx-populate.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load xlsx-populate'));
    document.head.appendChild(s);
  });
}

const CDRXlsx = {
  async download(headerId) {
    try {
      App.toast('Loading Excel library…');
      await _loadXlsxPopulate();

      App.toast('Building Excel…');

      const [headerRes, entriesRes, schoolsRes, tplResp] = await Promise.all([
        DB.getCDRHeader(headerId),
        DB.getCDREntries(headerId),
        DB.getSchools(),
        fetch('assets/cdr_template.xlsx'),
      ]);

      const header = headerRes.data;
      if (!header) { App.toast('CDR not found.', 'error'); return; }
      if (!tplResp.ok) throw new Error('Template not found');

      const school  = (schoolsRes.data || []).find(s => s.id === header.school_id) || {};
      const entries = (entriesRes.data || []).slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      const buf = await tplResp.arrayBuffer();
      const wb  = await XlsxPopulate.fromDataAsync(buf);
      const ws  = wb.sheet(0);

      // Search cols 1-12; exact=true requires full cell match
      const findRow = (text, from, to, exact) => {
        const t = text.toLowerCase();
        for (let r = (from || 1); r <= (to || 250); r++) {
          for (let c = 1; c <= 12; c++) {
            const v = ws.cell(r, c).value();
            if (typeof v === 'string') {
              const vt = v.trim().toLowerCase();
              if (exact ? vt === t : vt.includes(t)) return r;
            }
          }
        }
        return null;
      };

      // ── Locate structural rows by text ──
      const totalsRow      = findRow('totals',              19,  100)       || 59;
      const recapHeaderRow = findRow('account description', totalsRow, 150) || 62;
      const recapTotalRow  = findRow('total', recapHeaderRow + 1, recapHeaderRow + 20, true) || (recapHeaderRow + 14);
      const certRow        = findRow('certified correct',   totalsRow, 250);
      const recvRow        = findRow('received by',         totalsRow, 250);

      const DATA_START = 19;
      const DATA_END   = totalsRow - 1;
      const capacity   = DATA_END - DATA_START + 1;
      const n          = entries.length;

      const name = (school.name || '').toUpperCase();
      const NUM  = '#,##0.00';

      // ── Header cells ──
      ws.cell('A3').value(name);
      ws.cell('A8').value('Entity Name: ' + name);
      ws.cell('I8').value('Name of Accountable Officer: ' + (school.school_head || ''));
      ws.cell('I9').value('Official Designation: ' + (school.designation || ''));
      ws.cell('I10').value('Station: ' + (school.short_name || ''));
      ws.cell('I11').value('Register No. : ' + (header.register_no || '____'));
      ws.cell('I12').value('Sheet No. : ' + (header.sheet_no || '____'));

      // ── Clear template sample data ──
      for (let r = DATA_START; r <= DATA_END; r++)
        for (let c = 1; c <= 12; c++) ws.cell(r, c).value(null);

      // ── Write entries ──
      let bal = 0, sumPay = 0, sumG = 0, sumH = 0, sumI = 0, sumL = 0;
      const recap = [];

      let dr = DATA_START;  // current data row (may advance extra for multi-UACS continuation rows)

      entries.forEach(e => {
        const rn  = dr;
        const adv = parseFloat(e.advances) || 0;
        const pay = parseFloat(e.payment)  || 0;

        if (e.entry_date)  ws.cell(rn, 1).value(new Date(e.entry_date + 'T00:00:00')).style('numberFormat', 'MM/DD/YYYY');
        if (e.ref_no)      ws.cell(rn, 2).value(String(e.ref_no));
        if (e.particulars) ws.cell(rn, 3).value(String(e.particulars));

        if (adv > 0) {
          ws.cell(rn, 4).value(adv).style('numberFormat', NUM);
          bal = adv;
        } else if (pay > 0) {
          ws.cell(rn, 5).value(pay).style('numberFormat', NUM);
          bal    -= pay;
          sumPay += pay;

          if (e.uacs_lines) {
            // Multi-UACS entry — spread amounts across UACS columns
            let lines; try { lines = JSON.parse(e.uacs_lines); } catch { lines = []; }
            const otherLines = [];
            lines.forEach(line => {
              const lineAmt = parseFloat(line.amount) || 0;
              const lcode   = line.code || '';
              if      (lcode === '5020301000') { ws.cell(rn, 7).value(lineAmt).style('numberFormat', NUM); sumG += lineAmt; }
              else if (lcode === '5021299000') { ws.cell(rn, 8).value(lineAmt).style('numberFormat', NUM); sumH += lineAmt; }
              else if (lcode === '5021202000') { ws.cell(rn, 9).value(lineAmt).style('numberFormat', NUM); sumI += lineAmt; }
              else {
                otherLines.push(line);
                sumL += lineAmt;
                recap.push({ desc: line.desc || '', code: lcode, amt: lineAmt });
              }
            });
            // First "other" on the main row
            if (otherLines.length > 0) {
              const fo = otherLines[0];
              const foAmt = parseFloat(fo.amount) || 0;
              if (fo.desc) ws.cell(rn, 10).value(fo.desc);
              if (fo.code) ws.cell(rn, 11).value(fo.code);
              ws.cell(rn, 12).value(foAmt).style('numberFormat', NUM);
            }
            // Continuation rows for additional "other" UACS lines
            for (let k = 1; k < otherLines.length; k++) {
              dr++;
              const xo = otherLines[k];
              const xAmt = parseFloat(xo.amount) || 0;
              if (xo.desc) ws.cell(dr, 10).value(xo.desc);
              if (xo.code) ws.cell(dr, 11).value(xo.code);
              ws.cell(dr, 12).value(xAmt).style('numberFormat', NUM);
            }
          } else {
            // Single UACS entry
            const code = e.uacs_code || '';
            if      (code === '5020301000') { ws.cell(rn, 7).value(pay).style('numberFormat', NUM); sumG += pay; }
            else if (code === '5021299000') { ws.cell(rn, 8).value(pay).style('numberFormat', NUM); sumH += pay; }
            else if (code === '5021202000') { ws.cell(rn, 9).value(pay).style('numberFormat', NUM); sumI += pay; }
            else {
              const desc = e.uacs_desc || '';
              if (desc) ws.cell(rn, 10).value(desc);
              if (code) ws.cell(rn, 11).value(code);
              ws.cell(rn, 12).value(pay).style('numberFormat', NUM);
              sumL += pay;
              recap.push({ desc, code, amt: pay });
            }
          }
        }
        ws.cell(rn, 6).value(bal).style('numberFormat', NUM);
        dr++;
      });

      const rowsWritten = dr - DATA_START;

      // ── Hide unused data rows (pulls Totals up visually) ──
      if (rowsWritten > capacity) {
        App.toast('Warning: too many entries for one page — all rows filled.', 'error');
      } else {
        for (let r = DATA_START + rowsWritten; r <= DATA_END; r++) ws.row(r).hidden(true);
      }

      // ── Totals row ──
      ws.cell(totalsRow, 5).value(sumPay).style('numberFormat', NUM);
      ws.cell(totalsRow, 6).value(bal).style('numberFormat', NUM);
      ws.cell(totalsRow, 7).value(sumG).style('numberFormat', NUM);
      ws.cell(totalsRow, 8).value(sumH).style('numberFormat', NUM);
      ws.cell(totalsRow, 9).value(sumI).style('numberFormat', NUM);
      ws.cell(totalsRow, 12).value(sumL).style('numberFormat', NUM);

      // ── Recap — group by UACS code, sum amounts ──
      const recapMap = new Map();
      recap.forEach(({ desc, code, amt }) => {
        const key = code || desc;
        if (recapMap.has(key)) recapMap.get(key).amt += amt;
        else recapMap.set(key, { desc, code, amt });
      });
      const recapGrouped = [...recapMap.values()];

      // Clear existing recap item cells
      for (let r = recapHeaderRow + 1; r < recapTotalRow; r++) {
        ws.cell(r, 10).value(null);
        ws.cell(r, 11).value(null);
        ws.cell(r, 12).value(null);
      }
      // Write grouped recap items
      recapGrouped.forEach((item, i) => {
        const r = recapHeaderRow + 1 + i;
        if (item.desc) ws.cell(r, 10).value(item.desc);
        if (item.code) ws.cell(r, 11).value(item.code);
        ws.cell(r, 12).value(item.amt).style('numberFormat', NUM);
      });
      // Hide unused recap rows between last item and Total row
      for (let r = recapHeaderRow + 1 + recapGrouped.length; r < recapTotalRow; r++)
        ws.row(r).hidden(true);
      // Recap total
      ws.cell(recapTotalRow, 12).value(sumL).style('numberFormat', NUM);

      // ── Signatures ──
      if (certRow) {
        ws.cell(certRow + 2, 3).value((school.school_head || '').toUpperCase());
        ws.cell(certRow + 3, 3).value(school.designation || '');
      }
      if (recvRow) {
        ws.cell(recvRow + 2, 9).value('JO ANN MARIE P. CAGARA');
        ws.cell(recvRow + 3, 9).value('ADAS III (Senior Bookkeeper)');
      }

      // ── Download ──
      const safeName = (school.short_name || school.name || 'School').replace(/[\s/\\]+/g, '_');
      const qNum = (header.quarter || 'Q1').replace('Q', '');
      const out  = await wb.outputAsync();
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
