// CDRPdf — builds CDR HTML and handles print/download for Long Bond 8.5 × 13 in (portrait)
// Note: Some browsers default the print dialog to Letter or A4 the first time.
// The user may need to manually select "Custom 8.5 × 13" or "Long Bond" in print settings.
// The @page rule in cdr-pdf.css instructs the browser to use 8.5 × 13 but not all
// browsers honour custom @page sizes — this is a browser limitation, not a code bug.
const CDRPdf = {

  _fp(n) {
    const v = parseFloat(n) || 0;
    return v === 0 ? '' : v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  _fd(d) {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return (dt.getMonth() + 1) + '/' + dt.getDate() + '/' + dt.getFullYear();
  },

  async _getData(id) {
    const [headerRes, entriesRes, schoolsRes] = await Promise.all([
      DB.getCDRHeader(id), DB.getCDREntries(id), DB.getSchools(),
    ]);
    const header  = headerRes.data;
    let   entries = entriesRes.data || [];
    const schools = schoolsRes.data || [];
    if (!header) { App.toast('CDR not found', 'error'); return null; }

    const school = schools.find(s => s.id === header.school_id) || {};

    // Cash advance injection — same logic as printCDR / downloadPDF
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

    const recap = {};
    entries.forEach(e => {
      const p = parseFloat(e.payment)||0; if (!p) return;
      const code = e.uacs_code||'';
      const desc = e.uacs_desc || (typeof UACS_CODES !== 'undefined' ? UACS_CODES.find(u=>u.code===code)?.desc : '') || code;
      if (!recap[code]) recap[code] = { code, desc, total: 0 };
      recap[code].total += p;
    });

    return { header, entries, school, rows, totalAdv, totalPay, finalBal, tOff, tGen, tJan, recap };
  },

  _buildHTML(data) {
    const { header, entries, school, rows, totalAdv, totalPay, finalBal, tOff, tGen, tJan, recap } = data;
    const fp  = n => this._fp(n);
    const fd  = d => this._fd(d);
    const sName = (school.name || '').toUpperCase();
    const bk    = typeof BOOKKEEPER       !== 'undefined' ? BOOKKEEPER       : '';
    const bkT   = typeof BOOKKEEPER_TITLE !== 'undefined' ? BOOKKEEPER_TITLE : '';
    const COL_OFF='5020301000', COL_GEN='5021299000', COL_JAN='5021202000';

    const th = s => `border:1px solid #000;background:#f0f0f0;font-size:5.5pt;padding:1.5px 2px;vertical-align:middle;text-align:center`;
    const td = extra => `border:1px solid #000;padding:1.5px 2px;vertical-align:middle;font-size:6pt;${extra||''}`;

    const tableRows = rows.map(e => {
      const adv = parseFloat(e.advances)||0, pay = parseFloat(e.payment)||0;
      const isOff = e.uacs_code===COL_OFF, isGen = e.uacs_code===COL_GEN, isJan = e.uacs_code===COL_JAN;
      const isOth = !isOff&&!isGen&&!isJan&&pay>0;
      const desc  = isOth ? (e.uacs_desc||(typeof UACS_CODES!=='undefined'?UACS_CODES.find(u=>u.code===e.uacs_code)?.desc||'':'')) : '';
      return `<tr>
        <td style="${td('text-align:center;font-size:6pt;white-space:nowrap')}">${fd(e.entry_date)}</td>
        <td style="${td('font-size:5.5pt;word-break:break-all')}">${e.ref_no||''}</td>
        <td style="${td('font-size:6pt')}">${e.particulars||''}</td>
        <td style="${td('text-align:right')}">${adv>0?fp(adv):''}</td>
        <td style="${td('text-align:right')}">${pay>0?fp(pay):''}</td>
        <td style="${td('text-align:right;font-weight:bold')}">${fp(e.running_balance)}</td>
        <td style="${td('text-align:right')}">${isOff?fp(pay):''}</td>
        <td style="${td('text-align:right')}">${isGen?fp(pay):''}</td>
        <td style="${td('text-align:right')}">${isJan?fp(pay):''}</td>
        <td style="${td('font-size:5.5pt')}">${desc}</td>
        <td style="${td('text-align:center;font-size:5.5pt')}">${isOth?(e.uacs_code||''):''}</td>
        <td style="${td('text-align:right')}">${isOth?fp(pay):''}</td>
      </tr>`;
    }).join('');

    const recapRows = Object.values(recap).map(r => `<tr>
      <td style="${td()}">${r.desc}</td>
      <td style="${td('text-align:center')}">${r.code}</td>
      <td style="${td('text-align:right')}">${fp(r.total)}</td>
    </tr>`).join('');

    return `<div class="cdr-page">
<table style="width:100%;border-collapse:collapse;margin-bottom:2px">
  <tr>
    <td style="text-align:center;font-weight:bold;font-size:9.5pt;line-height:1.2">DEPED LEYTE DIVISION</td>
    <td></td>
  </tr>
  <tr>
    <td style="text-align:center;font-weight:bold;font-size:9.5pt;line-height:1.2">${sName}</td>
    <td style="text-align:right;font-style:italic;font-size:7.5pt">Appendix 43</td>
  </tr>
</table>
<div style="text-align:center;font-weight:bold;font-size:10.5pt;text-decoration:underline;margin-bottom:3px">CASH DISBURSEMENTS REGISTER</div>
<table style="width:100%;border-collapse:collapse;margin-bottom:3px">
  <tr>
    <td style="width:50%;vertical-align:top;padding-right:8px">
      <div style="font-size:7pt;padding:1px 0"><strong>Entity Name:</strong> ${sName}</div>
      <div style="font-size:7pt;padding:1px 0"><strong>Sub-Office/District/Division:</strong> DULAG WEST DISTRICT</div>
      <div style="font-size:7pt;padding:1px 0"><strong>Municipality/City/Province:</strong> DULAG, LEYTE</div>
      <div style="font-size:7pt;padding:1px 0"><strong>Fund Cluster:</strong> 01-REGULAR</div>
    </td>
    <td style="width:50%;vertical-align:top">
      <div style="font-size:7pt;padding:1px 0"><strong>Name of Accountable Officer:</strong> ${school.school_head||''}</div>
      <div style="font-size:7pt;padding:1px 0"><strong>Official Designation:</strong> ${school.designation||''}</div>
      <div style="font-size:7pt;padding:1px 0"><strong>Station:</strong> ${school.short_name||school.name||''}</div>
      <div style="font-size:7pt;padding:1px 0"><strong>Register No.:</strong> ___________________________</div>
      <div style="font-size:7pt;padding:1px 0"><strong>Sheet No.:</strong> ___________________________</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;table-layout:fixed">
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
      <th colspan="3" style="${th()}"></th>
      <th colspan="3" style="${th()}">Advances for Operating Expenses</th>
      <th colspan="6" style="${th()}">BREAKDOWN OF PAYMENTS</th>
    </tr>
    <tr>
      <th colspan="3" style="${th()}"></th>
      <th colspan="3" style="${th()}">-19901010</th>
      <th colspan="6" style="${th()}"></th>
    </tr>
    <tr>
      <th colspan="3" style="${th()}"></th>
      <th colspan="3" style="${th()}">Amount</th>
      <th style="${th()}">Office Supplies Expenses</th>
      <th style="${th()}">Other General Services</th>
      <th style="${th()}">Janitorial Services</th>
      <th colspan="3" style="${th()}">O T H E R S</th>
    </tr>
    <tr>
      <th style="${th()}">Date</th>
      <th style="${th()}">DV/Payroll/ Check No.</th>
      <th style="${th()}">Particulars</th>
      <th style="${th()}">Cash Advance</th>
      <th style="${th()}">Payments</th>
      <th style="${th()}">Balance</th>
      <th style="${th()}">5020301000</th>
      <th style="${th()}">5021299000</th>
      <th style="${th()}">5021202000</th>
      <th style="${th()}">Account Description</th>
      <th style="${th()}">UACS Object Code</th>
      <th style="${th()}">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
    <tr style="font-weight:bold">
      <td colspan="3" style="${td('text-align:center')}">Totals</td>
      <td style="${td('text-align:right')}">${fp(totalAdv)}</td>
      <td style="${td('text-align:right')}">${fp(totalPay)}</td>
      <td style="${td('text-align:right')}">${fp(finalBal)}</td>
      <td style="${td('text-align:right')}">${tOff>0?fp(tOff):''}</td>
      <td style="${td('text-align:right')}">${tGen>0?fp(tGen):''}</td>
      <td style="${td('text-align:right')}">${tJan>0?fp(tJan):''}</td>
      <td style="${td()}"></td>
      <td style="${td()}"></td>
      <td style="${td('text-align:right')}">${fp(totalPay)}</td>
    </tr>
  </tbody>
</table>
<div style="font-size:5pt;font-style:italic;margin:2px 0 4px">The total of the &#39;Advances for Operating Expenses &#x2013; Payments&#39; column must always be equal to the sum of the totals of the &#39;Breakdown of Payments&#39; columns.</div>
<table style="width:40%;border-collapse:collapse;margin-left:auto">
  <tr><td colspan="3" style="font-weight:bold;font-size:6.5pt;padding:1px 0">Recapitulation:</td></tr>
  <tr>
    <th style="${th()}">Account Description</th>
    <th style="${th()}">CS Object Code</th>
    <th style="${th()}">Amount</th>
  </tr>
  ${recapRows}
  <tr style="font-weight:bold">
    <td colspan="2" style="${td('text-align:right')}">Total</td>
    <td style="${td('text-align:right')}">${fp(totalPay)}</td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;margin-top:10px">
  <tr>
    <td style="width:45%;font-size:7pt">CERTIFIED CORRECT:</td>
    <td style="width:10%"></td>
    <td style="width:45%;font-size:7pt">RECEIVED BY:</td>
  </tr>
  <tr style="height:22px">
    <td style="vertical-align:bottom;text-align:center;border-bottom:1px solid #000;font-weight:bold;font-size:8pt">${school.school_head||''}</td>
    <td></td>
    <td style="vertical-align:bottom;text-align:center;border-bottom:1px solid #000;font-weight:bold;font-size:8pt">${bk}</td>
  </tr>
  <tr>
    <td style="text-align:center;font-size:6.5pt">${school.designation||'Principal/Head Teacher'}</td>
    <td></td>
    <td style="text-align:center;font-size:6.5pt">${bkT}</td>
  </tr>
  <tr>
    <td style="font-size:6.5pt;padding-top:5px">Date: ______________________</td>
    <td></td>
    <td style="font-size:6.5pt;padding-top:5px">Date: ______________________</td>
  </tr>
</table>
</div>`;
  },

  async download(id) {
    if (typeof html2pdf === 'undefined') {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    const data = await this._getData(id);
    if (!data) return;

    App.toast('Preparing PDF…');
    const { header, school } = data;
    const filename = `CDR_${(school.name||'School').replace(/\s+/g,'_')}_${header.year}_${header.quarter}.pdf`;

    // Element must be in DOM at a real position (not off-screen) for html2canvas to render it
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;top:0;left:0;z-index:-1;background:white;';
    wrap.innerHTML = this._buildHTML(data);
    document.body.appendChild(wrap);

    const opt = {
      margin:       [0.5, 0.4, 0.5, 0.4],
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
      jsPDF:        { unit: 'in', format: [8.5, 13], orientation: 'portrait' },
      pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] },
    };

    try {
      await html2pdf().set(opt).from(wrap.firstElementChild).save();
      App.toast('PDF downloaded!');
    } finally {
      document.body.removeChild(wrap);
    }
  },

  async print(id) {
    const data = await this._getData(id);
    if (!data) return;

    const wrap = document.createElement('div');
    wrap.id = '_cdr-print-wrap';
    wrap.innerHTML = this._buildHTML(data);
    document.body.appendChild(wrap);

    const cleanup = () => {
      const el = document.getElementById('_cdr-print-wrap');
      if (el) document.body.removeChild(el);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  },
};
