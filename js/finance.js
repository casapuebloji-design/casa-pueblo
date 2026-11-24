/* כספים ותשלומים: A) settlement with Casa Pueblo, B) whole-house budget. */

Pages.finance = (q) => {
  const hasBudget = Number(Store.data.project.budget) > 0;
  const tabs = [['casa', 'תשלומים לקאסה פואבלו'], ['forecast', 'עלות הפרויקט כולו'], ...(hasBudget ? [['budget', 'תקציב הבית']] : [])];
  const asked = q.tab === 'expenses' ? 'forecast' : q.tab; // old links
  const tab = tabs.some(([k]) => k === asked) ? asked : 'casa';
  const body = tab === 'casa' ? financeCasa() : tab === 'budget' ? financeBudget(q) : financeForecast(q);
  return {
    title: 'כספים ותשלומים',
    html: `
      <div class="page-head"><div><h1>כספים</h1><p>התשלומים לקאסה פואבלו ועלות הפרויקט כולו, במקום אחד</p></div>
        <button class="btn btn-accent" id="fx-add">${icon('plus')}הוספת הוצאה</button></div>
      <div class="tabs" role="tablist">
        ${tabs.map(([k, label]) => `<button role="tab" aria-selected="${tab === k}" data-tab="${k}">${label}</button>`).join('')}
      </div>
      ${body}`,
    mount(root) {
      root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => App.go('finance', { tab: b.dataset.tab })));
      root.querySelectorAll('#fx-add, #fx-add2').forEach((b) => (b.onclick = () => expenseForm()));
      root.querySelectorAll('[data-exp]').forEach((r) => (r.onclick = () => expenseDetail(r.dataset.exp)));
      root.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => App.go('finance', { ...q, tab, view: b.dataset.view })));
      root.querySelectorAll('[data-fcat]').forEach((b) => (b.onclick = () => App.go('finance', { tab: 'forecast', cat: b.dataset.fcat })));
      const doc = root.querySelector('#pp-doc');
      if (doc) doc.onclick = () => { if (!openFile(doc.dataset.path)) App.go('documents'); };
      bindInvoices(root);
      bindTips(root);
    },
  };
};

// The V box next to each payment. Editable only in the Back Office (Jorge); the family sees it read-only.
function payCheck(key, paid, editable) {
  const label = paid ? `שולם ${fmtDate(paid)}` : 'טרם שולם';
  return editable
    ? `<button class="pay-check ${paid ? 'on' : ''}" data-paycheck="${key}" aria-pressed="${!!paid}" aria-label="${label}${paid ? '. לחיצה לביטול הסימון' : '. לחיצה לסימון כשולם'}">${paid ? icon('check') : ''}</button>`
    : `<span class="pay-check ${paid ? 'on' : ''}" role="img" aria-label="${label}">${paid ? icon('check') : ''}</span>`;
}

// Ticks or unticks a payment. `after` redraws whatever screen the box was on.
function togglePaid(key, after = () => App.render()) {
  const [kind, id] = key.split(':');
  const ms = Store.data.casaMilestones || [];
  const item = kind === 'm' ? ms[Number(id)] : Store.data.changes.find((c) => c.id === id);
  if (!item) return;
  const name = kind === 'm' ? `תשלום ${Number(id) + 1} – ${item.name}` : `תוספת #${item.no} – ${item.title}`;
  const commit = (paid) => {
    item.paid = paid;
    if (!paid && kind === 'm') item.invoice = '';
    Store.log(`${paid ? 'סימן כשולם' : 'ביטל סימון תשלום'}: ${name} ${ils(item.amount)}`, TEAM.pm.name);
    Store.save();
    toast(paid ? `${name} סומן כשולם` : 'הסימון בוטל');
    after();
  };
  if (!item.paid) return commit(TODAY);
  openModal({
    title: 'ביטול הסימון "שולם"',
    body: `<p style="margin-top:0"><b>${esc(name)}</b> · ${ils(item.amount)}</p><p class="ink-2">סומן כשולם ב־${fmtDate(item.paid)}. לבטל את הסימון?</p>`,
    foot: `<button class="btn btn-primary" id="tp-yes">ביטול הסימון</button><button class="btn btn-ghost" data-close>השארה כשולם</button>`,
    onOpen(el) { el.querySelector('#tp-yes').onclick = () => { closeModal(); commit(null); }; },
  });
}

// Payment title with its number from the contract: "תשלום 2 · סיום שלד".
function payTitle(m, i) {
  const no = `תשלום ${i + 1}`;
  return `<span class="pay-no">${no}</span>${m.name && m.name !== no ? ` ${esc(m.name)}` : ''}`;
}

// The contract payments list. Shared by the family's finance page (read-only) and the Back Office (editable).
function contractPaymentsHtml(cm, editable) {
  if (!cm.ms.length) return '';
  const paidPct = cm.contract ? cm.paid / cm.contract * 100 : 0;
  return `
    <div class="split small ink-2" style="margin-bottom:6px"><span>${cm.ms.filter((m) => m.paid).length} מתוך ${cm.ms.length} תשלומים שולמו</span><b class="num">${pct(paidPct, 0)}</b></div>
    <div class="progress dark terra" style="margin-bottom:10px"><i style="width:${Math.min(paidPct, 100).toFixed(1)}%"></i></div>
    <ul class="pay-list">
      ${cm.ms.map((m, i) => `<li class="${m.paid ? 'paid' : m === cm.next ? 'next' : ''}">
        ${payCheck(`m:${i}`, m.paid, editable)}
        <div class="pl-main"><b>${payTitle(m, i)}</b><span class="sub">${m.paid ? `שולם ${fmtDate(m.paid)}${m.invoice && !m.invoiceDoc ? ` · ${esc(m.invoice)}` : ''}` : esc(payWhen(m))}</span>${invLink(m, editable, `m:${i}`)}</div>
        <div class="pl-amt"><b class="num">${ils(m.amount)}</b><span class="sub">${shareOf(m.amount, cm.contract)}</span></div>
      </li>`).join('')}
      <li class="total"><span></span><div class="pl-main"><b>סה״כ ההסכם</b></div><div class="pl-amt"><b class="num">${ils(cm.contract)}</b></div></li>
    </ul>`;
}

// Additions and changes: their own totals and V boxes (only approved ones can be paid).
function additionsHtml(cm, editable) {
  if (!cm.adds.length && !cm.pending.length) return '<div class="empty">אין תוספות או שינויים</div>';
  return `
    ${cm.adds.length ? `<dl class="pay-sum">
      <div><dt>סה״כ תוספות</dt><dd class="num">${ils(cm.addTotal)}</dd></div>
      <div><dt>שולם</dt><dd class="num">${ils(cm.addPaid)} <span>${shareOf(cm.addPaid, cm.addTotal)}</span></dd></div>
      <div><dt>יתרה</dt><dd class="num">${ils(cm.addLeft)} <span>${shareOf(cm.addLeft, cm.addTotal)}</span></dd></div>
    </dl>` : ''}
    <ul class="pay-list">
      ${cm.adds.map((c) => `<li class="${c.paid ? 'paid' : ''}">
        ${payCheck(`c:${c.id}`, c.paid, editable)}
        <div class="pl-main"><b><span class="pay-no">תוספת ${c.no}</span> ${esc(c.title)}</b><span class="sub">${c.paid ? `שולם ${fmtDate(c.paid)}` : `אושר · ${fmtDate(c.date)}`}</span>${invLink(c, editable, `c:${c.id}`)}</div>
        <div class="pl-amt"><b class="num">${ils(c.amount)}</b><span class="sub">כולל מע"מ</span></div>
      </li>`).join('')}
      ${cm.pending.map((c) => `<li class="pending">
        <span class="pay-check muted" aria-hidden="true"></span>
        <div class="pl-main"><b><span class="pay-no">תוספת ${c.no}</span> ${esc(c.title)}</b><span class="sub">ממתין לאישור הלקוח · ${fmtDate(c.date)}</span></div>
        <div class="pl-amt"><b class="num">${ils(c.amount)}</b>${pill('yellow', 'ממתין')}</div>
      </li>`).join('')}
    </ul>
    <p class="form-hint">תוספת נכנסת לסה״כ הפרויקט רק אחרי שהלקוח מאשר אותה.</p>`;
}

/* ---------- Casa Pueblo's invoices to the family ---------- */
// An invoice is a document in its own category. Each payment or addition it covers points to it (invoiceDoc),
// so one invoice can cover several payments, and a payment can have none.
const INV_CAT = 'חשבוניות קאסה פואבלו';
function casaInvoices(d = Store.data) {
  return (d.documents || []).filter((x) => x.cat === INV_CAT).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
function invoiceOf(item) { return item.invoiceDoc ? (Store.data.documents || []).find((x) => x.id === item.invoiceDoc) : null; }
// "תשלום 2, תוספת 1": what an invoice covers.
function invoicePays(doc, d = Store.data) {
  const out = [];
  (d.casaMilestones || []).forEach((m, i) => { if (m.invoiceDoc === doc.id) out.push(`תשלום ${i + 1}`); });
  (d.changes || []).forEach((c) => { if (c.invoiceDoc === doc.id) out.push(`תוספת ${c.no}`); });
  return out;
}
function invTitle(doc) { return doc.inv && doc.inv.no ? `חשבונית ${doc.inv.no}` : doc.title || 'חשבונית'; }
// Under a payment: its invoice, or (Back Office) a button to attach one.
function invLink(item, editable, key) {
  const doc = invoiceOf(item);
  if (doc) return `<button class="inv-link" data-invopen="${doc.id}">${icon('receipt', 'xs')}${esc(invTitle(doc))}</button>`;
  return editable ? `<button class="inv-link add" data-invadd="${key}">${icon('plus', 'xs')}צירוף חשבונית</button>` : '';
}
function invoicesHtml(editable) {
  const list = casaInvoices();
  if (!list.length) return `<div class="empty">${editable ? 'עוד לא הועלו חשבוניות. אפשר לצרף חשבונית ליד כל תשלום, או בכפתור "העלאת חשבונית".' : 'כאן יופיעו החשבוניות שקאסה פואבלו מוציאה לכם.'}</div>`;
  return `<ul class="pay-list inv-list">${list.map((x) => {
    const pays = invoicePays(x);
    return `<li>
      <span class="inv-ico">${icon('receipt')}</span>
      <div class="pl-main"><b>${esc(invTitle(x))}</b><span class="sub">${fmtDate(x.date)}${pays.length ? ` · ${pays.join(', ')}` : ''}</span></div>
      <div class="pl-amt">${x.inv && x.inv.amount ? `<b class="num">${ils(x.inv.amount)}</b>` : ''}<button class="link-btn small" data-invopen="${x.id}">${icon('eye', 'xs')}צפייה</button></div>
    </li>`;
  }).join('')}</ul>`;
}
function bindInvoices(root, after) {
  root.querySelectorAll('[data-invopen]').forEach((b) => (b.onclick = () => {
    const doc = (Store.data.documents || []).find((x) => x.id === b.dataset.invopen);
    if (!openFile(doc && doc.path)) toast(Store.live ? 'לחשבונית הזאת לא צורף קובץ' : 'בגרסה המלאה החשבונית נפתחת כאן');
  }));
  root.querySelectorAll('[data-invadd]').forEach((b) => (b.onclick = () => invoiceForm({ keys: [b.dataset.invadd], after })));
}

// Jorge uploads an invoice: the file, its number, date and amount, and the payments it covers.
// A tax invoice/receipt is issued when the money arrives, so the payments it covers take the invoice date as
// their paid date (and unpaid ones are ticked as paid), unless Jorge unticks that option.
function invoiceForm({ keys = [], after = () => App.render() } = {}) {
  const d = Store.data;
  const items = [
    ...(d.casaMilestones || []).map((m, i) => ({ key: `m:${i}`, item: m, label: `תשלום ${i + 1}${m.name && m.name !== `תשלום ${i + 1}` ? ` · ${m.name}` : ''}` })),
    ...(d.changes || []).filter((c) => c.status === 'approved').map((c) => ({ key: `c:${c.id}`, item: c, label: `תוספת ${c.no} · ${c.title}` })),
  ];
  const sumOf = (ks) => items.filter((x) => ks.includes(x.key)).reduce((s, x) => s + (Number(x.item.amount) || 0), 0);
  openModal({
    title: 'העלאת חשבונית ללקוח',
    body: `
      <label class="field"><span>קובץ החשבונית</span><input class="input" type="file" id="inv-file" accept="application/pdf,image/*"></label>
      <div class="form-grid inv-grid">
        <label class="field"><span>מספר חשבונית</span><input class="input" id="inv-no" inputmode="numeric" placeholder="למשל: 1077"></label>
        <label class="field"><span>תאריך</span><input class="input" type="date" id="inv-date" value="${TODAY}"></label>
        <label class="field"><span>סכום (₪, כולל מע"מ)</span><input class="input num" type="text" inputmode="decimal" data-money id="inv-amt" value="${moneyFmt(sumOf(keys))}"></label>
      </div>
      ${items.length ? `<fieldset class="field inv-pays"><legend>על אילו תשלומים החשבונית?</legend>
        ${items.map((x) => {
          const has = invoiceOf(x.item);
          return `<label class="check-row"><input type="checkbox" value="${x.key}" ${keys.includes(x.key) ? 'checked' : ''}>
            <span>${esc(x.label)} · <b class="num">${ils(x.item.amount)}</b>
            <span class="small muted">${x.item.paid ? `שולם ${fmtDate(x.item.paid)}` : 'טרם שולם'}${has ? ` · יש כבר ${esc(invTitle(has))}` : ''}</span></span></label>`;
        }).join('')}
      </fieldset>
      <label class="check-row" id="inv-mark-row"><input type="checkbox" id="inv-mark" checked><span>תאריך התשלום הוא תאריך החשבונית<span class="small muted">התשלומים שבחרתי יסומנו כשולמו בתאריך הזה</span></span></label>` : ''}
      <p class="form-hint">החשבונית תופיע ללקוח ליד התשלום, ברשימת החשבוניות בעמוד הכספים, ובמסמכים בקטגוריה "${INV_CAT}".</p>`,
    foot: `<button class="btn btn-primary" id="inv-save">${icon('upload')}שמירה</button><button class="btn btn-ghost" data-close>ביטול</button><span class="pp-err" id="inv-err" role="alert"></span>`,
    onOpen(el) {
      const amt = el.querySelector('#inv-amt');
      let amtTouched = false;
      amt.addEventListener('input', () => { amtTouched = true; });
      const chosen = () => [...el.querySelectorAll('.inv-pays input:checked')].map((c) => c.value);
      const markRow = el.querySelector('#inv-mark-row');
      const refresh = () => {
        const ks = chosen();
        if (!amtTouched) amt.value = moneyFmt(sumOf(ks));
        if (markRow) markRow.hidden = !ks.length;
      };
      el.querySelectorAll('.inv-pays input').forEach((c) => (c.onchange = refresh));
      refresh();
      el.querySelector('#inv-save').onclick = async (ev) => {
        const f = el.querySelector('#inv-file').files[0];
        const err = el.querySelector('#inv-err');
        if (Store.live && !f) { err.textContent = 'צריך לבחור את קובץ החשבונית.'; return; }
        ev.target.disabled = true;
        let path = '';
        try { path = await storeFile(f); } catch (e) { ev.target.disabled = false; return; }
        const no = el.querySelector('#inv-no').value.trim();
        const date = el.querySelector('#inv-date').value || TODAY;
        const ks = chosen();
        const doc = {
          id: 'd' + Date.now(), cat: INV_CAT, title: no ? `חשבונית ${no}` : `חשבונית ${fmtDate(date)}`, date,
          type: f ? (f.name.split('.').pop() || 'PDF').toUpperCase().slice(0, 4) : 'PDF', size: f ? (f.size / 1048576).toFixed(1) + 'MB' : '—', path,
          inv: { no, amount: moneyNum(amt.value) },
        };
        const data = Store.data; // the project may have been reloaded while the window was open
        data.documents.unshift(doc);
        const mark = el.querySelector('#inv-mark');
        ks.forEach((k) => {
          const [kind, id] = k.split(':');
          const it = kind === 'm' ? (data.casaMilestones || [])[Number(id)] : (data.changes || []).find((c) => c.id === id);
          if (!it) return;
          it.invoiceDoc = doc.id;
          if (mark && mark.checked) it.paid = date;
        });
        Store.log(`העלה ${doc.title}${ks.length ? ` (${invoicePays(doc, data).join(', ')})` : ''}`, TEAM.pm.name);
        Store.save();
        closeModal();
        toast(`${doc.title} נשמרה`);
        after();
      };
    },
  });
}

function financeCasa() {
  const d = Store.data;
  const cm = casaModel(d);
  const contractDoc = (d.documents || []).find((x) => x.cat === 'הסכם התקשרות');
  const nextNo = cm.next ? `תשלום ${cm.ms.indexOf(cm.next) + 1}` : '';
  return `
    <div class="kpis four">
      <div class="card stat"><div class="k">סה״כ הפרויקט</div><div class="v num">${ils(cm.grand)}</div><div class="s">הסכם ${ils(cm.contract)}${cm.addTotal ? ` + תוספות ${ils(cm.addTotal)}` : ''}</div></div>
      <div class="card stat"><div class="k">שולם עד עכשיו</div><div class="v num">${ils(cm.paid)}</div><div class="s">${shareOf(cm.paid, cm.contract)} מההסכם</div></div>
      <div class="card stat"><div class="k">יתרה לתשלום</div><div class="v num">${ils(cm.left)}</div><div class="s">${shareOf(cm.left, cm.contract)} מההסכם</div></div>
      <div class="card stat accent"><div class="k">התשלום הבא</div><div class="v num">${cm.next ? ils(cm.next.amount) : '—'}</div><div class="s">${cm.next ? esc([nextNo, cm.next.name !== nextNo ? cm.next.name : '', payWhen(cm.next)].filter(Boolean).join(' · ')) : cm.ms.length ? 'כל התשלומים שולמו' : ''}</div></div>
    </div>

    <div class="grid wide-left" style="margin-top:14px">
      <article class="card card-pad">
        <div class="card-head"><h3>התשלומים לפי ההסכם</h3>
          ${contractDoc ? `<button class="link-btn small" id="pp-doc" data-path="${esc(contractDoc.path || '')}">${icon('documents', 'xs')}הסכם ההתקשרות</button>` : ''}</div>
        ${contractPaymentsHtml(cm, false) || '<div class="empty">כאן יופיעו התשלומים לפי הסכם ההתקשרות, ברגע שקאסה פואבלו תזין אותם.</div>'}
      </article>
      <article class="card card-pad">
        <div class="card-head"><h3>תוספות ושינויים</h3></div>
        ${additionsHtml(cm, false)}
      </article>
    </div>

    <article class="card card-pad" style="margin-top:14px">
      <div class="card-head"><h3>החשבוניות של קאסה פואבלו</h3>${casaInvoices().length ? `<span class="small muted">${casaInvoices().length} חשבוניות</span>` : ''}</div>
      ${invoicesHtml(false)}
    </article>`;
}

// The whole project: what Casa Pueblo costs plus everything else the family pays for.
function financeForecast(q) {
  const f = forecastModel(Store.data);
  const cat = q.cat || 'הכול';
  const cats = [...new Set(f.others.map((e) => e.cat))];
  const list = f.others.filter((e) => cat === 'הכול' || e.cat === cat).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const w = (v) => (f.grand ? v / f.grand * 100 : 0).toFixed(2) + '%';
  return `
    <div class="kpis four">
      <div class="card stat accent"><div class="k">תחזית לעלות הפרויקט כולו</div><div class="v num">${ils(f.grand)}</div><div class="s">קאסה פואבלו + הוצאות נוספות</div></div>
      <div class="card stat"><div class="k">קאסה פואבלו</div><div class="v num">${ils(f.cm.grand)}</div><div class="s">הסכם${f.cm.addTotal ? ' ותוספות' : ''}</div></div>
      <div class="card stat"><div class="k">הוצאות נוספות</div><div class="v num">${ils(f.oTotal)}</div><div class="s">${f.others.length ? `${f.others.length} הוצאות` : 'עוד לא נוספו'}</div></div>
      <div class="card stat"><div class="k">שולם עד עכשיו</div><div class="v num">${ils(f.paidAll)}</div><div class="s">${shareOf(f.paidAll, f.grand)} מהתחזית · יתרה ${ils(f.leftAll)}</div></div>
    </div>

    ${f.grand ? `<article class="card card-pad" style="margin-top:14px">
      <div class="card-head"><h3>ממה מורכבת העלות</h3></div>
      <div class="meter" role="img" aria-label="קאסה פואבלו ${ils(f.cm.grand)}, הוצאות נוספות ${ils(f.oTotal)}">
        <i style="width:${w(f.cm.grand)};background:var(--c-commit)" data-tip="${esc(`<b>קאסה פואבלו</b>${ils(f.cm.grand)}`)}"></i>
        <i style="width:${w(f.oTotal)};background:var(--c-paid)" data-tip="${esc(`<b>הוצאות נוספות</b>${ils(f.oTotal)}`)}"></i>
      </div>
      <div class="meter-legend">
        <span><i class="sw" style="background:var(--c-commit)"></i>קאסה פואבלו · <b class="num">${ils(f.cm.grand)}</b> (${shareOf(f.cm.grand, f.grand)})</span>
        <span><i class="sw" style="background:var(--c-paid)"></i>הוצאות נוספות · <b class="num">${ils(f.oTotal)}</b> (${shareOf(f.oTotal, f.grand)})</span>
      </div>
    </article>` : ''}

    <article class="card card-pad" style="margin-top:14px">
      <div class="card-head"><h3>הוצאות נוספות</h3><button class="btn btn-sm btn-primary" id="fx-add2">${icon('plus')}הוספת הוצאה</button></div>
      <p class="form-hint" style="margin-top:0">הוצאות של הבית שאינן חלק מהעבודה של קאסה פואבלו, למשל מטבח, ריהוט, תאורה, מיזוג או אגרות. כל הוצאה שמוסיפים נכנסת לתחזית.</p>
      ${cats.length > 1 ? `<div class="chips" role="group" aria-label="סינון לפי קטגוריה">
        ${['הכול', ...cats].map((c) => `<button class="chip" aria-pressed="${c === cat}" data-fcat="${esc(c)}">${esc(c === 'הכול' ? 'הכל' : c)}</button>`).join('')}
      </div>` : ''}
      ${list.length ? `<ul class="rows">
        ${list.map((e) => `<li class="row clickable compact" data-exp="${e.id}">
          <div class="main-col"><div class="title">${esc(e.item)}${e.supplier ? ` · ${esc(e.supplier)}` : ''}</div><div class="sub">${esc(e.cat)}${e.paid ? ` · שולם ${ils(e.paid)}` : ''}${e.remaining > 0 && e.paid ? ` · יתרה ${ils(e.remaining)}` : ''}</div></div>
          <div class="end"><b class="num small">${ils(e.total)}</b>${e.remaining <= 0 ? pill('green', 'שולם') : ''}</div></li>`).join('')}
      </ul>` : '<div class="empty">עוד לא נוספו הוצאות. לוחצים "הוספת הוצאה" ורושמים מה נקנה או הוזמן וכמה זה עולה.</div>'}
    </article>`;
}

function financeBudget(q) {
  const fm = financeModel(Store.data);
  const view = q.view === 'table' ? 'table' : 'chart';
  const overs = fm.cats.filter((c) => c.over);
  return `
    <div class="kpis six">
      <div class="card stat"><div class="k">תקציב כולל</div><div class="v num">${ils(fm.budget)}</div></div>
      <div class="card stat"><div class="k">התחייבויות</div><div class="v num">${ils(fm.commit)}</div><div class="s">הזמנות וחוזים</div></div>
      <div class="card stat"><div class="k">שולם בפועל</div><div class="v num">${ils(fm.paid)}</div></div>
      <div class="card stat"><div class="k">יתרה לתשלום</div><div class="v num">${ils(fm.toPay)}</div><div class="s">התחייבויות שטרם שולמו</div></div>
      <div class="card stat ${fm.free < 0 ? 'alert' : ''}"><div class="k">תקציב פנוי</div><div class="v num">${ils(fm.free)}</div></div>
      <div class="card stat"><div class="k">ניצול תקציב</div><div class="v num">${pct(fm.util)}</div><div class="s">התחייבויות מתוך התקציב</div></div>
    </div>

    <article class="card card-pad" style="margin-top:14px">
      <div class="card-head"><h3>תקציב מול התחייבויות מול תשלום בפועל</h3></div>
      <p class="chart-sub">ההבדל בין כסף שכבר יצא לבין הזמנות שעוד ישולמו. לדוגמה, מטבח שהוזמן ב-₪120,000 עם מקדמה של ₪30,000 נספר כ-₪30,000 ששולמו ועוד ₪90,000 של התחייבות.</p>
      ${budgetMeter(fm)}
    </article>

    ${overs.length ? `<div class="card card-pad alert-card" style="margin-top:14px">
      <span class="ico">${icon('alert')}</span>
      <div><b>חריגה מהתקציב ב${overs.map((c) => esc(c.name)).join(', ')}</b>
        <div class="small ink-2">${overs.map((c) => `${esc(c.name)}: התחייבות ${ils(c.commit)} מול תקציב ${ils(c.budget)} (חריגה של ${ils(c.commit - c.budget)})`).join(' · ')}</div></div>
    </div>` : ''}

    <article class="card card-pad chart-card" style="margin-top:14px">
      <div class="card-head"><h3>תקציב מול ביצוע לפי קטגוריה</h3>
        <div class="seg" role="group" aria-label="תצוגה"><button aria-pressed="${view === 'chart'}" data-view="chart">גרף</button><button aria-pressed="${view === 'table'}" data-view="table">טבלה</button></div>
      </div>
      ${view === 'chart' ? budgetVsActualChart(fm.cats) : budgetTable(fm)}
    </article>

    <div class="grid md-2" style="margin-top:14px">
      <article class="card card-pad chart-card">
        <div class="card-head"><h3>חלוקת ההוצאות לפי קטגוריה</h3></div>
        <p class="chart-sub">איזה חלק מההתחייבויות הלך לכל תחום</p>
        ${shareChart(fm.cats.filter((c) => c.commit > 0).sort((a, b) => b.commit - a.commit), 'commit', fm.commit, { label: 'התחייבות' })}
      </article>
      <article class="card card-pad chart-card">
        <div class="card-head"><h3>כמה הושקע בכל חלל</h3></div>
        <p class="chart-sub">הוצאה ששויכה לכמה חללים מתחלקת ביניהם שווה בשווה</p>
        ${shareChart(fm.spaces, 'commit', fm.commit, { label: 'התחייבות' })}
      </article>
    </div>

    <article class="card card-pad chart-card" style="margin-top:14px">
      <div class="card-head"><h3>תשלומים לאורך זמן</h3><span class="small muted">החודש עם התשלום הגבוה ביותר מסומן</span></div>
      <p class="chart-sub">כמה כסף יצא בפועל בכל חודש</p>
      ${monthlyChart(fm.months)}
    </article>

    <article class="card" style="margin-top:14px">
      <div class="card-pad" style="padding-bottom:4px"><h3>תשלומים קרובים לספקים</h3></div>
      <ul class="rows">
        ${fm.upcoming.slice(0, 6).map((e) => `<li class="row clickable compact" data-exp="${e.id}">
          <div class="main-col"><div class="title">${esc(e.supplier)} · ${esc(e.item)}</div><div class="sub">${fmtDate(e.next)} · יתרה ${ils(e.remaining)}</div></div>
          <div class="end">${daysBetween(TODAY, e.next) < 0 ? pill('red', 'באיחור') : daysBetween(TODAY, e.next) <= 30 ? pill('yellow', 'החודש') : pill('gray', 'בהמשך')}</div></li>`).join('')}
      </ul>
    </article>`;
}

function budgetTable(fm) {
  const rows = fm.cats.filter((c) => c.budget || c.commit);
  const tot = rows.reduce((a, c) => ({ budget: a.budget + c.budget, commit: a.commit + c.commit, paid: a.paid + c.paid }), { budget: 0, commit: 0, paid: 0 });
  return `<div class="table-wrap"><table class="t">
    <thead><tr><th>קטגוריה</th><th class="n">תקציב</th><th class="n">התחייבות</th><th class="n">שולם</th><th class="n">יתרה</th></tr></thead>
    <tbody>
      ${rows.map((c) => `<tr class="${c.over ? 'over' : ''} clickable" data-fcat="${esc(c.name)}">
        <td>${esc(c.name)} ${c.over ? `<span class="over-flag">${icon('alert')}חריגה</span>` : ''}</td>
        <td class="n">${ils(c.budget)}</td><td class="n">${ils(c.commit)}</td><td class="n">${ils(c.paid)}</td>
        <td class="n ${c.left < 0 ? 'neg' : ''}">${ils(c.left)}</td></tr>`).join('')}
      <tr class="total"><td>סה״כ</td><td class="n">${ils(tot.budget)}</td><td class="n">${ils(tot.commit)}</td><td class="n">${ils(tot.paid)}</td><td class="n">${ils(tot.budget - tot.commit)}</td></tr>
    </tbody></table></div>`;
}

// Money fields accept the amount as written in a contract or invoice: 10,000 / 10000 / ₪10,000.
function moneyNum(v) { return Number(String(v == null ? '' : v).replace(/[^\d.]/g, '')) || 0; }
function moneyFmt(v) { return v ? Number(v).toLocaleString('en-US') : ''; }
// Shows the commas once the field is left (10000 → 10,000).
document.addEventListener('focusout', (e) => { if (e.target.matches && e.target.matches('input[data-money]')) e.target.value = moneyFmt(moneyNum(e.target.value)); });

function expenseDetail(id) {
  const e = Store.data.expenses.find((x) => x.id === id);
  const paid = expensePaid(e);
  const mat = e.material && Store.data.materials.find((m) => m.id === e.material);
  const docs = Store.data.documents.filter((x) => x.expense === e.id);
  const f = [
    ['תאריך', fmtDate(e.date)], ['ספק', e.supplier], ['קטגוריה', e.cat], ['חללים', e.spaces.join(', ')], ['פריט', e.item],
    ['יצרן/מותג', e.maker], ['דגם', e.model], ['מק״ט', e.sku], ['צבע / גוון', e.color],
    ['כמות', e.qty ? `${e.qty} ${e.unit || ''}` : ''], ['מחיר ליחידה', e.unitPrice ? ils(e.unitPrice) : ''],
    ['עלות כוללת', ils(e.total)], ['שולם בפועל', ils(paid)], ['יתרה לתשלום', ils(e.total - paid)],
    ['סטטוס', e.status], ['אמצעי תשלום', e.method], ['מועד תשלום הבא', e.next && paid < e.total ? fmtDate(e.next) : ''], ['מסמך מצורף', e.doc], ['הערות', e.notes],
  ].filter(([, v]) => v);
  openModal({
    title: e.item,
    body: `
      <dl class="kv">${f.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <h3 style="margin:16px 0 6px;font-size:15px;color:var(--navy)">תשלומים</h3>
      <ul class="version-list">${e.payments.map((p) => `<li><span class="d">${fmtDate(p.date)}</span><b class="num">${ils(p.amount)}</b></li>`).join('')}</ul>
      <div class="card card-pad" style="margin-top:14px;background:var(--sand);box-shadow:none">
        <div class="small muted" style="margin-bottom:4px">${icon('link', 'xs')} הרשומה מופיעה גם ב:</div>
        <div class="small">כספים ← ${esc(e.cat)}</div>
        ${mat ? `<div class="small">חומרים ← ${esc(mat.space)} ← ${esc(mat.name)}</div>` : ''}
        <div class="small">ספקים ← ${esc(e.supplier)}</div>
        ${docs.length ? `<div class="small">מסמכים ← ${docs.map((x) => esc(x.cat)).join(', ')}</div>` : ''}
      </div>`,
    foot: `${e.total > paid ? `<button class="btn btn-primary" id="ex-pay">${icon('plus')}רישום תשלום</button>` : ''}
      ${e.casa ? '' : '<button class="btn btn-ghost" id="ex-del" style="margin-inline-start:auto">מחיקת ההוצאה</button>'}`,
    onOpen(el) {
      const b = el.querySelector('#ex-pay');
      if (b) b.onclick = () => { closeModal(); paymentForm(e.id); };
      const del = el.querySelector('#ex-del');
      if (del) del.onclick = () => {
        if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'ללחוץ שוב למחיקה'; return; }
        Store.data.expenses = Store.data.expenses.filter((x) => x.id !== e.id);
        Store.log(`מחק הוצאה: ${e.item} (${ils(e.total)})`);
        Store.save();
        closeModal();
        toast('ההוצאה נמחקה');
        App.render();
      };
    },
  });
}

function paymentForm(id) {
  const e = Store.data.expenses.find((x) => x.id === id);
  const left = e.total - expensePaid(e);
  openModal({
    title: `רישום תשלום · ${e.supplier}`,
    body: `
      <label class="field"><span>סכום (₪)</span><input class="input num" id="pf-amt" type="text" inputmode="decimal" data-money value="${moneyFmt(left)}"></label>
      <label class="field"><span>תאריך</span><input class="input" id="pf-date" type="date" value="${TODAY}"></label>
      <p class="form-hint">יתרה לתשלום: ${ils(left)}</p>`,
    foot: `<button class="btn btn-primary" id="pf-save">${icon('check')}שמירה</button>`,
    onOpen(el) {
      el.querySelector('#pf-save').onclick = () => {
        const amt = Math.min(moneyNum(el.querySelector('#pf-amt').value), left);
        if (amt <= 0) return;
        e.payments.push({ date: el.querySelector('#pf-date').value || TODAY, amount: amt });
        Store.log(`רשם תשלום ${ils(amt)} ל${e.supplier}`);
        Store.save();
        closeModal();
        toast('התשלום נרשם, והתקציב עודכן');
        App.render();
      };
    },
  });
}

function expenseForm() {
  openModal({
    title: 'הוספת הוצאה',
    body: `
      <p class="small ink-2" style="margin-top:0">הוצאה של הבית שאינה חלק מהעבודה של קאסה פואבלו, למשל מטבח, ריהוט או תאורה. היא תיכנס לתחזית של עלות הפרויקט כולו.</p>
      <div class="form-grid two">
        <label class="field"><span>מה נקנה או הוזמן</span><input class="input" id="xf-item" placeholder="למשל: מטבח, וילונות לסלון"></label>
        <label class="field"><span>ספק / בעל מקצוע (לא חובה)</span><input class="input" id="xf-sup" placeholder="למשל: נגב קרמיקה" list="xf-sups"></label>
        <label class="field"><span>עלות כוללת (₪)</span><input class="input num" type="text" inputmode="decimal" data-money id="xf-total"></label>
        <label class="field"><span>שולם עד עכשיו (₪)</span><input class="input num" type="text" inputmode="decimal" data-money id="xf-paid" placeholder="0"></label>
        <label class="field"><span>קטגוריה</span><select class="input" id="xf-cat">${BUDGET_CATEGORIES.filter((c) => c !== 'ביצוע ושיפוץ').map((c) => `<option ${c === 'שונות' ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field"><span>חשבונית / הצעת מחיר (לא חובה)</span><input class="input" type="file" id="xf-file" accept="image/*,application/pdf"></label>
      </div>
      <details class="more-fields">
        <summary>פרטים נוספים (לא חובה)</summary>
        <div class="form-grid two">
          <label class="field"><span>תאריך</span><input class="input" type="date" id="xf-date" value="${TODAY}"></label>
          <label class="field"><span>מועד תשלום הבא</span><input class="input" type="date" id="xf-next"></label>
          <label class="field"><span>יצרן / מותג</span><input class="input" id="xf-maker"></label>
          <label class="field"><span>דגם / מק״ט</span><input class="input" id="xf-model"></label>
          <label class="field"><span>סטטוס</span><select class="input" id="xf-status"><option>הוזמן</option><option>בייצור</option><option>סופק</option><option>הותקן</option><option>הצעת מחיר</option></select></label>
          <label class="field"><span>אמצעי תשלום</span><select class="input" id="xf-method"><option>אשראי</option><option>העברה בנקאית</option><option>צ׳ק</option><option>מזומן</option></select></label>
        </div>
        <div class="field"><span style="display:block;font-size:13px;font-weight:600;color:var(--ink-2);margin-bottom:6px">שיוך לחללים (אפשר לבחור כמה)</span>
          <div class="chips-input">${SPACES.map((s) => `<label><input type="checkbox" value="${esc(s)}"><span>${esc(s)}</span></label>`).join('')}</div></div>
        <label class="field"><span>הערות</span><input class="input" id="xf-notes" placeholder="למשל: כולל הובלה"></label>
        <label class="check"><input type="checkbox" id="xf-mat"><span>להוסיף גם ל"חומרים ובחירות"</span></label>
      </details>
      <datalist id="xf-sups">${[...new Set(Store.data.expenses.map((e) => e.supplier).filter(Boolean))].map((s) => `<option value="${esc(s)}">`).join('')}</datalist>
      <p class="form-hint" id="xf-err" style="color:var(--st-red)"></p>`,
    foot: `<button class="btn btn-primary" id="xf-save">${icon('check')}שמירת ההוצאה</button>`,
    onOpen(el) {
      const $ = (s) => el.querySelector(s);
      $('#xf-save').onclick = async (ev) => {
        const total = moneyNum($('#xf-total').value);
        const paid = moneyNum($('#xf-paid').value);
        const item = $('#xf-item').value.trim();
        const sup = $('#xf-sup').value.trim();
        const spaces = [...el.querySelectorAll('.chips-input input:checked')].map((i) => i.value);
        if (!item || !(total > 0)) { $('#xf-err').textContent = 'צריך למלא מה נקנה ואת העלות הכוללת.'; return; }
        if (paid > total) { $('#xf-err').textContent = 'הסכום ששולם גבוה מהעלות הכוללת.'; return; }
        ev.target.disabled = true;
        let path = '';
        try { path = await storeFile($('#xf-file').files[0]); } catch (e) { ev.target.disabled = false; return; }
        const id = 'e' + Date.now();
        const cat = $('#xf-cat').value;
        const exp = {
          id, date: $('#xf-date').value || TODAY, supplier: sup, cat, spaces: spaces.length ? spaces : ['שטחים כלליים'], item,
          maker: $('#xf-maker').value.trim(), model: $('#xf-model').value.trim(), total, status: $('#xf-status').value,
          method: $('#xf-method').value, doc: $('#xf-file').files[0] ? 'חשבונית / הזמנה' : '', notes: $('#xf-notes').value.trim(),
          payments: paid ? [{ date: $('#xf-date').value || TODAY, amount: paid }] : [], next: $('#xf-next').value || '',
        };
        if ($('#xf-mat').checked) {
          const mid = 'm' + Date.now();
          Store.data.materials.push({ id: mid, name: item, cat, space: exp.spaces[0], maker: exp.maker, model: exp.model, sku: '', color: '', supplier: sup, price: null, unit: '', link: '', warranty: '', notes: exp.notes, status: exp.status === 'הצעת מחיר' ? 'נבחר' : exp.status, swatch: '#d8cfc0' });
          exp.material = mid;
        }
        if ($('#xf-file').files[0]) {
          Store.data.documents.unshift({ id: 'd' + Date.now(), cat: 'חשבוניות', title: sup ? `${sup} – ${item}` : item, date: exp.date, type: ($('#xf-file').files[0].name.split('.').pop() || 'PDF').toUpperCase().slice(0, 4), size: ($('#xf-file').files[0].size / 1048576).toFixed(1) + 'MB', expense: id, path });
        }
        Store.data.expenses.push(exp);
        Store.log(`הוסיף הוצאה: ${sup ? sup + ' – ' : ''}${item} (${ils(total)})`);
        Store.save();
        closeModal();
        toast('ההוצאה נשמרה ונכנסה לתחזית');
        App.go('finance', { tab: 'forecast' });
      };
    },
  });
}
