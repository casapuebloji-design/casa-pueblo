/* Back office for Casa Pueblo staff. */

// validate(vals) may return an error message: it is shown in the form, and the form stays open.
function formModal({ title, intro = '', fields, submit = 'שמירה', onSave, validate }) {
  const fieldHtml = (f) => {
    const v = f.value == null ? '' : f.value;
    if (f.type === 'select') return `<label class="field"><span>${esc(f.label)}</span><select class="input" name="${f.id}">${f.options.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select></label>`;
    if (f.type === 'textarea') return `<label class="field"><span>${esc(f.label)}</span><textarea class="input" name="${f.id}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea></label>`;
    if (f.type === 'checkbox') return `<label class="check"><input type="checkbox" name="${f.id}" ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
    if (f.type === 'range') return `<label class="field"><span>${esc(f.label)}: <b id="rv-${f.id}">${v}%</b></span><input type="range" name="${f.id}" min="0" max="100" value="${v}" style="width:100%;accent-color:var(--navy)" oninput="document.getElementById('rv-${f.id}').textContent=this.value+'%'"></label>`;
    if (f.type === 'checks') return `<fieldset class="field checks"><span>${esc(f.label)}</span><div class="chips-input">${f.options.map((o) => `<label><input type="checkbox" name="${f.id}" value="${esc(o)}" ${(f.value || []).includes(o) ? 'checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div></fieldset>`;
    // Amounts are typed as in a contract, with or without commas (10,000), so they are text fields read with moneyNum.
    if (f.type === 'number') return `<label class="field"><span>${esc(f.label)}</span><input class="input num" type="text" inputmode="decimal" data-money name="${f.id}" value="${esc(moneyFmt(v))}" placeholder="${esc(f.placeholder || '')}"></label>`;
    if (f.type === 'file') return `<label class="field"><span>${esc(f.label)}</span><input class="input" type="file" name="${f.id}" ${f.multiple ? 'multiple' : ''} accept="${f.accept || ''}"></label>`;
    return `<label class="field"><span>${esc(f.label)}</span><input class="input" type="${f.type || 'text'}" name="${f.id}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}"></label>`;
  };
  openModal({
    title,
    body: `${intro ? `<p class="ink-2" style="margin-top:0">${intro}</p>` : ''}<form id="fm" class="form-grid">${fields.map(fieldHtml).join('')}</form><p class="form-hint" id="fm-err" style="color:var(--st-red)"></p>`,
    foot: `<button class="btn btn-primary" id="fm-save">${icon('check')}${esc(submit)}</button><button class="btn btn-ghost" data-close>ביטול</button>`,
    onOpen(el) {
      const saveBtn = el.querySelector('#fm-save');
      saveBtn.onclick = async () => {
        // One save at a time: a second tap while uploading used to publish the same update twice.
        if (saveBtn.disabled) return;
        const vals = {};
        fields.forEach((f) => {
          if (f.type === 'checks') { vals[f.id] = [...el.querySelectorAll(`[name="${f.id}"]:checked`)].map((x) => x.value); return; }
          const inp = el.querySelector(`[name="${f.id}"]`);
          vals[f.id] = f.type === 'checkbox' ? inp.checked : f.type === 'file' ? inp.files : f.type === 'number' ? moneyNum(inp.value) : f.type === 'range' ? Number(inp.value) : inp.value.trim();
        });
        const missing = fields.find((f) => f.required && !vals[f.id]);
        if (missing) { el.querySelector('#fm-err').textContent = `צריך למלא: ${missing.label}`; return; }
        const invalid = validate && validate(vals);
        if (invalid) { el.querySelector('#fm-err').textContent = invalid; return; }
        const label = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.textContent = 'שומר…';
        let msg;
        try { msg = await onSave(vals); } finally { saveBtn.disabled = false; saveBtn.innerHTML = label; }
        closeModal();
        if (msg) toast(msg);
        App.render();
      };
    },
  });
}

// Shrinks a phone photo before upload (long side up to maxW, JPEG). Non-images pass through.
function shrinkImage(file, maxW = 2000) {
  if (!file || !/^image\/(jpeg|png|webp|heic)/.test(file.type)) return Promise.resolve(file);
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / Math.max(img.width, img.height));
      if (scale === 1 && file.size < 1.5e6) return resolve(file);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => resolve(b ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// Runs a save that may upload files, and turns a failure into a message instead of a stuck modal.
async function withUpload(fn) {
  try { return await fn(); } catch (e) { return 'הפעולה לא הושלמה: ' + e.message; }
}

// Downscale an uploaded photo so the demo can keep it in browser storage.
function readImage(file, maxW = 900) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => resolve(null);
      img.src = fr.result;
    };
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(file);
  });
}

const SCHEDULE = { ok: ['green', 'בזמן'], delay: ['red', 'עיכוב'], risk: ['yellow', 'בסיכון'], done: ['gray', 'נמסר'] };

/* ---------- Dashboard החברה ---------- */
Pages['bo-home'] = (q) => {
  const d = Store.data;
  // keep the live demo project in sync with its portfolio row
  const live = d.portfolio.find((p) => p.id === d.project.id);
  if (live) Object.assign(live, {
    stage: d.project.stage, progress: d.project.progress,
    openTasks: d.tasks.filter((t) => !t.done).length,
    pendingApprovals: d.tasks.filter((t) => !t.done && t.type === 'approval').length,
    schedule: d.timeline.some((s) => s.status === 'delay') ? 'delay' : 'ok',
  });
  const pms = [...new Set(d.portfolio.map((p) => p.pm))];
  const stages = [...new Set(d.portfolio.map((p) => p.stage))];
  const f = { pm: q.pm || '', stage: q.stage || '', st: q.st || '', c: q.c || '' };
  const list = d.portfolio.filter((p) => (!f.pm || p.pm === f.pm) && (!f.stage || p.stage === f.stage) && (!f.st || p.schedule === f.st) && (!f.c || (p.client + p.name).includes(f.c)));
  const active = d.portfolio.filter((p) => p.schedule !== 'done');
  return {
    title: 'דשבורד החברה',
    html: `
      <div class="page-head"><div><h1>כל הפרויקטים</h1><p>תמונת מצב של כל הפרויקטים הפעילים</p></div>
        ${isJorge() ? `<a class="btn btn-accent" href="#/bo-new">${icon('plus')}פרויקט חדש</a>` : ''}</div>
      <div class="kpis four">
        <div class="card stat"><div class="k">פרויקטים פעילים</div><div class="v">${active.length}</div></div>
        <div class="card stat"><div class="k">אישורים שממתינים ללקוחות</div><div class="v">${active.reduce((s, p) => s + p.pendingApprovals, 0)}</div></div>
        <div class="card stat alert"><div class="k">בעיכוב / בסיכון</div><div class="v">${active.filter((p) => p.schedule === 'delay' || p.schedule === 'risk').length}</div></div>
        <div class="card stat"><div class="k">משימות פתוחות ללקוחות</div><div class="v">${active.reduce((s, p) => s + p.openTasks, 0)}</div></div>
      </div>
      <div class="toolbar" style="margin-top:16px">
        <input class="input search-input" type="search" id="bo-c" placeholder="חיפוש לקוח או פרויקט" value="${esc(f.c)}">
        <select class="input" style="width:auto" id="bo-pm" aria-label="מנהל פרויקט"><option value="">כל מנהלי הפרויקט</option>${pms.map((x) => `<option ${x === f.pm ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <select class="input" style="width:auto" id="bo-stage" aria-label="שלב"><option value="">כל השלבים</option>${stages.map((x) => `<option ${x === f.stage ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <select class="input" style="width:auto" id="bo-st" aria-label="סטטוס"><option value="">כל הסטטוסים</option>${Object.entries(SCHEDULE).map(([k, v]) => `<option value="${k}" ${k === f.st ? 'selected' : ''}>${v[1]}</option>`).join('')}</select>
      </div>
      <div class="project-cards">
        ${list.map((p) => `
          <article class="card pcard" data-p="${p.id}" tabindex="0">
            <div class="img" style="background-image:url('${esc(media(p.img))}')">${pill(SCHEDULE[p.schedule][0], SCHEDULE[p.schedule][1])}</div>
            <div class="body">
              <div class="split"><h3>${esc(p.name)}</h3><span class="small muted">${esc(p.city)}</span></div>
              <div class="small ink-2">${esc(p.client)} · מנהל: ${esc(p.pm)}</div>
              <div class="split small" style="margin-top:10px"><span>${esc(p.stage)}</span><b class="num">${p.progress}%</b></div>
              <div class="progress dark" style="margin-top:4px"><i style="width:${p.progress}%"></i></div>
              <div class="meta">
                <div><b>${p.openTasks}</b><span>משימות פתוחות</span></div>
                <div><b class="${p.pendingApprovals ? 'alert' : ''}">${p.pendingApprovals}</b><span>ממתינים ללקוח</span></div>
                <div><b class="${p.alerts ? 'alert' : ''}">${p.alerts}</b><span>התראות</span></div>
              </div>
            </div>
          </article>`).join('') || '<div class="empty">אין פרויקטים שמתאימים לסינון</div>'}
      </div>`,
    mount(root) {
      const go = () => App.go('bo-home', { pm: root.querySelector('#bo-pm').value, stage: root.querySelector('#bo-stage').value, st: root.querySelector('#bo-st').value, c: root.querySelector('#bo-c').value }, true);
      ['#bo-pm', '#bo-stage', '#bo-st'].forEach((s) => (root.querySelector(s).onchange = go));
      let t;
      const c = root.querySelector('#bo-c');
      c.oninput = () => { clearTimeout(t); t = setTimeout(go, 300); };
      if (f.c) { c.focus(); c.setSelectionRange(f.c.length, f.c.length); }
      root.querySelectorAll('[data-p]').forEach((el) => {
        const open = () => {
          if (Store.live) { Live.flush().then(() => Live.open(el.dataset.p)).then(() => App.go('bo-project')); return; }
          if (el.dataset.p === Store.data.project.id) App.go('bo-project');
          else toast('בהדגמה, רק "בית אברהמי" מלא בנתונים');
        };
        el.onclick = open;
        el.onkeydown = (e) => { if (e.key === 'Enter') open(); };
      });
    },
  };
};

/* ---------- ניהול פרויקט ---------- */
const MAX_PHOTOS = 30; // per photo update
const MAX_VIDEO_MB = 200; // the storage bucket's per-file limit (Pro plan; the project's global limit must be at least this)
const PROJECT_ACTIONS = [
  ['weekly', 'send', 'הסיכום השבועי'],
  ['timeline', 'timeline', 'שלבי עבודה'],
  ['details', 'edit', 'עריכת פרטי פרויקט'],
  ['plan', 'plans', 'העלאת תכנית'],
  ['version', 'layers', 'העלאת גרסה חדשה'],
  ['approval', 'check', 'בקשת אישור מהלקוח'],
  ['task', 'tasks', 'משימה ללקוח'],
  ['material', 'materials', 'הוספת חומר ו/או מוצר'],
  ['photos', 'camera', 'העלאת תמונות'],
  ['doc', 'documents', 'העלאת מסמך'],
  ['payment', 'finance', 'תשלומים לפי ההסכם'],
  ['change', 'plus', 'שינוי / תוספת'],
  ['pro', 'pros', 'הוספת בעל מקצוע'],
  ['member', 'users', 'הזמנת משתמש לפרויקט'],
];

// Back Office actions only Jorge sees (permissions questionnaire).
const JORGE_ACTIONS = ['details', 'payment', 'change', 'member'];

/* ---------- Payments to Casa Pueblo: the payment plan from the signed contract ---------- */
// Each payment: { name, when (the contract's wording, e.g. "בסיום שלד"), due (optional date), amount, paid (date|null), invoice }.
// Payments are ticked as paid on the finance page; this editor sets up the plan itself.
function milestones() { return Store.data.casaMilestones || (Store.data.casaMilestones = []); }

function paymentPlanEditor({ fromContract = false } = {}) {
  const p = Store.data.project;
  let rows = milestones().map((m) => ({ ...m }));
  if (!rows.length) rows = [{}, {}, {}];
  // Amounts may be typed with commas or a shekel sign (480,000 / ₪480000): keep only the number.
  const toNum = (v) => Number(String(v == null ? '' : v).replace(/[^\d.]/g, '')) || '';
  const fmtNum = (v) => (v ? Number(v).toLocaleString('en-US') : '');
  let contract = Number(p.contract) || rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) || '';
  const pctOf = (amt) => (contract && amt ? Math.round(amt / contract * 1000) / 10 : '');

  const rowHtml = (r, i) => `
    <div class="pp-row" data-i="${i}">
      <div class="pp-no">תשלום ${i + 1}</div>
      <label class="pp-f name"><span>תיאור התשלום</span><input class="input" data-k="name" value="${esc(r.name || '')}" placeholder="למשל: מקדמה"></label>
      <label class="pp-f when"><span>מתי (לפי ההסכם)</span><input class="input" data-k="when" value="${esc(r.when || '')}" placeholder="למשל: בסיום השלד"></label>
      <label class="pp-f due"><span>תאריך (לא חובה)</span><input class="input" type="date" data-k="due" value="${esc(r.due || '')}"></label>
      <label class="pp-f pct"><span>%</span><input class="input num" type="text" inputmode="decimal" data-k="pct" value="${pctOf(r.amount)}"></label>
      <label class="pp-f amt"><span>סכום (₪)</span><input class="input num" type="text" inputmode="decimal" data-k="amount" value="${fmtNum(r.amount)}"></label>
      <button class="icon-btn pp-del" data-del="${i}" aria-label="מחיקת תשלום ${i + 1}" title="מחיקה">${icon('close')}</button>
      ${r.paid ? `<span class="pp-paid">${icon('check', 'xs')}שולם ${fmtDate(r.paid)}</span>` : ''}
    </div>`;

  openModal({
    title: 'התשלומים לפי הסכם ההתקשרות',
    wide: true,
    body: `
      ${fromContract ? '<p class="small" style="margin-top:0"><b>ההסכם נשמר במסמכים.</b> עכשיו רושמים כאן את התשלומים שמופיעים בו. כל תשלום יופיע ללקוח בנפרד בעמוד הכספים, עם ריבוע לסימון כשהוא משולם.</p>'
        : '<p class="small ink-2" style="margin-top:0">כל תשלום מופיע ללקוח בנפרד בעמוד הכספים. אפשר לרשום אחוז מסכום ההסכם, והסכום יחושב לבד.</p>'}
      <label class="field" style="max-width:280px"><span>סכום ההסכם (₪, כולל מע"מ)</span><input class="input num" type="text" inputmode="decimal" id="pp-contract" value="${fmtNum(contract)}"></label>
      <div id="pp-rows"></div>
      <button class="link-btn" id="pp-add" style="margin-top:6px">${icon('plus')}הוספת תשלום</button>
      <div class="pp-total" id="pp-total"></div>`,
    // The message sits next to the save button, so it is seen even when the list is long.
    foot: `<button class="btn btn-primary" id="pp-save">${icon('check')}שמירה</button><button class="btn btn-ghost" data-close>ביטול</button><span class="pp-err" id="pp-err" role="alert"></span>`,
    onOpen(el) {
      const box = el.querySelector('#pp-rows');
      const collect = () => box.querySelectorAll('.pp-row').forEach((row) => {
        const r = rows[row.dataset.i];
        row.querySelectorAll('[data-k]').forEach((inp) => { if (inp.dataset.k !== 'pct') r[inp.dataset.k] = inp.dataset.k === 'amount' ? toNum(inp.value) : inp.value.trim(); });
      });
      const total = () => {
        const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
        const diff = contract ? contract - sum : 0;
        el.querySelector('#pp-total').innerHTML = `סה״כ התשלומים: <b class="num">${ils(sum)}</b>${contract && Math.abs(diff) >= 1
          ? ` · <span style="color:var(--st-red)">${diff > 0 ? `חסרים ${ils(diff)}` : `עודף של ${ils(-diff)}`} מול סכום ההסכם</span>`
          : contract ? ' · <span style="color:var(--st-green, #2e7d4f)">תואם לסכום ההסכם</span>' : ''}`;
      };
      const draw = () => {
        box.innerHTML = rows.map(rowHtml).join('');
        box.querySelectorAll('.pp-row').forEach((row) => {
          const r = rows[row.dataset.i];
          const pctIn = row.querySelector('[data-k="pct"]');
          const amtIn = row.querySelector('[data-k="amount"]');
          pctIn.oninput = () => { if (contract && toNum(pctIn.value) !== '') { r.amount = Math.round(contract * toNum(pctIn.value) / 100); amtIn.value = fmtNum(r.amount); } total(); };
          amtIn.oninput = () => { r.amount = toNum(amtIn.value); pctIn.value = pctOf(r.amount); total(); };
          amtIn.onblur = () => { amtIn.value = fmtNum(toNum(amtIn.value)); }; // 450000 → 450,000, as in the contract
        });
        box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
          collect();
          const r = rows[b.dataset.del];
          if (r.paid && b.dataset.sure !== '1') { b.dataset.sure = '1'; toast('התשלום הזה כבר סומן כשולם. ללחוץ שוב כדי למחוק'); return; }
          rows.splice(Number(b.dataset.del), 1);
          draw();
        }));
        total();
      };
      el.querySelector('#pp-contract').oninput = (e) => {
        collect();
        contract = toNum(e.target.value);
        box.querySelectorAll('.pp-row').forEach((row) => { row.querySelector('[data-k="pct"]').value = pctOf(rows[row.dataset.i].amount); });
        total();
      };
      el.querySelector('#pp-contract').onblur = (e) => { e.target.value = fmtNum(toNum(e.target.value)); };
      el.querySelector('#pp-add').onclick = () => { collect(); rows.push({}); draw(); box.querySelector('.pp-row:last-child [data-k="name"]').focus(); };
      el.querySelector('#pp-save').onclick = () => { try {
        collect();
        box.querySelectorAll('.bad').forEach((x) => x.classList.remove('bad'));
        const list = rows.filter((r) => r.name || r.amount || r.when || r.due);
        // Only the amount is required. A payment with no description takes the "when" text, or its number.
        const bad = list.findIndex((r) => !(r.amount > 0));
        if (bad >= 0) {
          // Show what is missing where it can be seen: a message by the save button, and the field marked and scrolled to.
          const i = rows.indexOf(list[bad]);
          const msg = `בתשלום ${i + 1} חסר סכום.`;
          el.querySelector('#pp-err').textContent = msg;
          const f = box.querySelector(`.pp-row[data-i="${i}"] [data-k="amount"]`);
          if (f) { f.classList.add('bad'); f.scrollIntoView({ block: 'center', behavior: 'smooth' }); f.focus({ preventScroll: true }); }
          return;
        }
        Store.data.casaMilestones = list.map((r) => ({ name: r.name || r.when || `תשלום ${rows.indexOf(r) + 1}`, when: r.name ? r.when || '' : '', due: r.due || '', amount: Number(r.amount), paid: r.paid || null, invoice: r.invoice || '', ...(r.invoiceDoc ? { invoiceDoc: r.invoiceDoc } : {}) }));
        const proj = Store.data.project; // the project may have been reloaded while the window was open
        proj.contract = Number(contract) || list.reduce((s, r) => s + Number(r.amount), 0);
        Store.log(`עדכן את התשלומים לפי ההסכם: ${list.length} תשלומים, ${ils(proj.contract)}`, TEAM.pm.name);
        Store.save();
        closeModal();
        toast(list.length ? `נשמרו ${list.length} תשלומים` : 'התשלומים נמחקו');
        App.render();
        setTimeout(paymentsBoard, 0); // back to the payments screen, where they are ticked as paid
      } catch (e) { toast('השמירה לא הצליחה: ' + e.message); } };
      draw();
    },
  });
}

// Back Office: the contract payments and additions, where Jorge ticks what was paid.
// The family sees the same lists, read-only, on their finance page.
function paymentsBoard() {
  const cm = casaModel(Store.data);
  const reopen = () => { closeModal(); App.render(); paymentsBoard(); };
  openModal({
    title: 'תשלומים לפי ההסכם',
    wide: true,
    body: cm.ms.length || cm.adds.length || cm.pending.length ? `
      <dl class="pay-sum">
        <div><dt>סה״כ ההסכם</dt><dd class="num">${ils(cm.contract)}</dd></div>
        <div><dt>שולם עד עכשיו</dt><dd class="num">${ils(cm.paid)} <span>${shareOf(cm.paid, cm.contract)}</span></dd></div>
        <div><dt>יתרה לתשלום</dt><dd class="num">${ils(cm.left)} <span>${shareOf(cm.left, cm.contract)}</span></dd></div>
      </dl>
      ${contractPaymentsHtml(cm, true) || '<div class="empty">עוד לא הוזנו התשלומים מההסכם.</div>'}
      <p class="form-hint">לוחצים על הריבוע כשתשלום מתקבל. הלקוח רואה אותו מסומן כשולם בעמוד הכספים.</p>
      <h3 style="margin:22px 0 10px">תוספות ושינויים</h3>
      ${additionsHtml(cm, true)}
      <h3 style="margin:22px 0 10px">חשבוניות ללקוח</h3>
      ${invoicesHtml(true)}`
      : '<div class="empty">עוד לא הוזנו התשלומים מההסכם. לוחצים "עריכת התשלומים", או מעלים את ההסכם ב"העלאת מסמך" בקטגוריה "הסכם התקשרות".</div>',
    foot: `<button class="btn btn-primary" id="pb-edit">${icon('edit')}${cm.ms.length ? 'עריכת התשלומים' : 'הזנת התשלומים מההסכם'}</button><button class="btn btn-ghost" id="pb-inv">${icon('receipt')}העלאת חשבונית</button><button class="btn btn-ghost" data-close>סגירה</button>`,
    onOpen(el) {
      el.querySelectorAll('[data-paycheck]').forEach((b) => (b.onclick = () => togglePaid(b.dataset.paycheck, reopen)));
      el.querySelector('#pb-edit').onclick = () => { closeModal(); paymentPlanEditor(); };
      // the invoice form replaces this window; when it is saved, this window opens again with the change
      bindInvoices(el, reopen);
      el.querySelectorAll('[data-invadd]').forEach((b) => (b.onclick = () => { closeModal(); invoiceForm({ keys: [b.dataset.invadd], after: reopen }); }));
      el.querySelector('#pb-inv').onclick = () => { closeModal(); invoiceForm({ after: reopen }); };
    },
  });
}

/* ---------- Work stages: what is being done in the house, in real time ---------- */
// Each stage: not started / started (date) / in progress / done (end date). Several can run at once.
function stagesBoard(rows = Store.data.timeline.map((s) => ({ ...s, status: stageStatus(s) }))) {
  const STATES = [['future', 'טרם התחיל'], ['start', 'התחלה'], ['active', 'בביצוע'], ['done', 'הסתיים']];
  const rowHtml = (r, i) => `<div class="sb-row ${r.status}" data-i="${i}">
      <div class="sb-name">${esc(r.name)}</div>
      <div class="sb-seg" role="group" aria-label="${esc(r.name)}">${STATES.map(([k, l]) => `<button type="button" class="${k}" data-st="${i}:${k}" aria-pressed="${r.status === k}">${l}</button>`).join('')}</div>
      ${r.status === 'future' ? `<label class="sb-next"><input type="checkbox" data-nx="${i}" ${r.next ? 'checked' : ''}><span>הבא בתור</span></label>` : `<div class="sb-more">
        <label><span>התחלה</span><input class="input" type="date" data-d="${i}:as" value="${esc(r.as || '')}"></label>
        ${r.status === 'done' ? `<label><span>סיום</span><input class="input" type="date" data-d="${i}:ae" value="${esc(r.ae || '')}"></label>` : ''}
        ${r.status === 'start' || r.status === 'active' || r.note ? `<label class="sb-note"><span>הערה ללקוח (לא חובה)</span><input class="input" data-n="${i}" value="${esc(r.note || '')}"></label>` : ''}
      </div>`}
    </div>`;
  openModal({
    title: 'שלבי עבודה',
    wide: true,
    body: `<p class="small ink-2" style="margin-top:0">לוחצים על המצב של כל שלב. כמה שלבים יכולים להיות בביצוע באותו זמן. התאריך נרשם לבד (היום), ואפשר לשנות אותו. המשפחה רואה את השינוי מיד.</p>
      <div id="sb-rows" class="sb-rows"></div>`,
    foot: `<button class="btn btn-primary" id="sb-save">${icon('check')}שמירה</button><button class="btn btn-ghost" id="sb-pick">${icon('edit')}בחירת שלבים</button><button class="btn btn-ghost" data-close>ביטול</button>`,
    onOpen(el) {
      const box = el.querySelector('#sb-rows');
      const collect = () => {
        box.querySelectorAll('[data-nx]').forEach((c) => { rows[c.dataset.nx].next = c.checked; });
        box.querySelectorAll('[data-d]').forEach((inp) => { const [i, k] = inp.dataset.d.split(':'); rows[i][k] = inp.value || null; });
        box.querySelectorAll('[data-n]').forEach((inp) => { rows[inp.dataset.n].note = inp.value.trim(); });
      };
      const draw = () => {
        box.innerHTML = rows.length ? rows.map(rowHtml).join('') : '<div class="empty">אין שלבים בפרויקט. לוחצים "בחירת שלבים".</div>';
        box.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => {
          collect();
          const [i, k] = b.dataset.st.split(':');
          const r = rows[i];
          r.status = k;
          if (k === 'future') { r.as = null; r.ae = null; } else r.next = false;
          if (k === 'start' || k === 'active') { r.as = r.as || TODAY; r.ae = null; }
          if (k === 'done') { r.as = r.as || TODAY; r.ae = r.ae || TODAY; }
          draw();
        }));
      };
      draw();
      el.querySelector('#sb-pick').onclick = () => { collect(); closeModal(); stagePicker(rows); };
      el.querySelector('#sb-save').onclick = () => {
        collect();
        const d = Store.data; // the project may have been reloaded while the window was open
        const was = (name) => (d.timeline.find((x) => x.name === name) || {}).status;
        const started = rows.filter((r) => ['start', 'active'].includes(r.status) && !['start', 'active', 'delay'].includes(was(r.name))).map((r) => r.name);
        const finished = rows.filter((r) => r.status === 'done' && was(r.name) !== 'done').map((r) => r.name);
        d.timeline = rows.map(stageRecord);
        stageSync(d);
        Store.log(`עדכן את שלבי העבודה${started.length ? `. התחיל: ${started.join(', ')}` : ''}${finished.length ? `. הסתיים: ${finished.join(', ')}` : ''}`, TEAM.pm.name);
        if (started.length) Store.notify(`התחיל: ${started.join(', ')}`, 'timeline');
        if (finished.length) Store.notify(`הסתיים: ${finished.join(', ')}`, 'timeline');
        Store.save();
        closeModal();
        toast('שלבי העבודה עודכנו');
        App.render();
      };
    },
  });
}
// What is saved for a stage. ps/pe (planned dates) are no longer used; they are kept equal to the actual dates.
function stageRecord(r) {
  return { name: r.name, status: r.status, as: r.as || null, ae: r.ae || null, note: r.note || '', photos: r.photos || [], ...(r.next && r.status === 'future' ? { next: true } : {}), ps: r.as || r.ps || TODAY, pe: r.ae || r.pe || TODAY };
}

// Which stages this project has: Casa Pueblo's list plus any added by hand. Unticking removes a stage.
function stagePicker(rows = Store.data.timeline.map((s) => ({ ...s }))) {
  const have = new Set(rows.map((r) => r.name));
  const all = [...WORK_STAGES, ...rows.map((r) => r.name).filter((n) => !WORK_STAGES.includes(n))];
  const item = (n, on) => `<label class="check-row"><input type="checkbox" value="${esc(n)}" ${on ? 'checked' : ''}><span>${esc(n)}</span></label>`;
  openModal({
    title: 'בחירת שלבי העבודה לפרויקט',
    wide: true,
    body: `<p class="small ink-2" style="margin-top:0">מסמנים את השלבים שיש בפרויקט הזה. שלב שמורידים ממנו את הסימון יורד מהפרויקט.</p>
      <div class="sp-grid" id="sp-list">${all.map((n) => item(n, have.has(n))).join('')}</div>
      <div class="sp-add"><input class="input" id="sp-new" placeholder="שלב נוסף, למשל: התקנת פרגולה"><button type="button" class="btn btn-ghost" id="sp-add">${icon('plus')}הוספה</button></div>`,
    foot: `<button class="btn btn-primary" id="sp-save">${icon('check')}שמירה</button><button class="btn btn-ghost" data-close>ביטול</button><span class="pp-err" id="sp-err" role="alert"></span>`,
    onOpen(el) {
      const list = el.querySelector('#sp-list');
      const addOne = () => {
        const inp = el.querySelector('#sp-new');
        const n = inp.value.trim();
        if (!n) return;
        if (![...list.querySelectorAll('input')].some((c) => c.value === n)) list.insertAdjacentHTML('beforeend', item(n, true));
        inp.value = '';
        inp.focus();
      };
      el.querySelector('#sp-add').onclick = addOne;
      el.querySelector('#sp-new').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addOne(); } };
      let sure = false;
      el.querySelector('#sp-save').onclick = () => {
        const names = [...list.querySelectorAll('input:checked')].map((c) => c.value);
        const dropped = rows.filter((r) => !names.includes(r.name) && r.status !== 'future');
        if (dropped.length && !sure) {
          sure = true;
          el.querySelector('#sp-err').textContent = `${dropped.map((r) => r.name).join(', ')} כבר ${dropped.length > 1 ? 'התחילו' : 'התחיל'}. ללחוץ שוב כדי להוריד בכל זאת.`;
          return;
        }
        const d = Store.data;
        d.timeline = names.map((n) => stageRecord(rows.find((r) => r.name === n) || newStage(n)));
        stageSync(d);
        Store.log(`עדכן את רשימת שלבי העבודה (${names.length} שלבים)`, TEAM.pm.name);
        Store.save();
        closeModal();
        App.render();
        stagesBoard();
      };
    },
  });
}

// Photo upload form. target = null starts a new update; an existing update gets the new photos added to it
// (e.g. one "demolition, week of ..." entry that grows during the week). Each addition can carry its own text,
// kept with its date and photos in u.log, so the weekly summary knows what was done and shown that week.
function photoForm(target) {
  const fields = target
    ? [
        { id: 'stages', label: 'שלבי בנייה (אפשר להוסיף)', type: 'checks', options: PHOTO_STAGES, value: stagesOf(target) },
        { id: 'note', label: 'מה נעשה היום (יופיע עם התמונות האלה, עם התאריך)', type: 'textarea', placeholder: 'למשל: סיימנו את צנרת המים בחדר הרחצה הראשי' },
        { id: 'files', label: 'תמונות וסרטונים להוספה (מהנייד או מהמחשב)', type: 'file', multiple: true, accept: 'image/*,video/*' },
      ]
    : [
        { id: 'title', label: 'כותרת', required: true },
        { id: 'stages', label: 'שלבי בנייה (אפשר כמה)', type: 'checks', options: PHOTO_STAGES, value: [] },
        { id: 'desc', label: 'תיאור קצר', type: 'textarea' },
        { id: 'files', label: 'תמונות וסרטונים (מהנייד או מהמחשב)', type: 'file', multiple: true, accept: 'image/*,video/*' },
      ];
  formModal({
    title: target ? 'הוספת תמונות לעדכון' : 'עדכון תמונות ליומן',
    intro: target ? `<b>${esc(target.title)}</b> · ${fmtDate(target.date)} · יש בו כבר ${target.photos.length} תמונות` : '',
    fields,
    submit: target ? 'הוספה' : 'פרסום',
    validate(v) {
      if (!v.stages.length) return 'צריך לסמן לפחות שלב בנייה אחד, כדי שהתמונות יופיעו בקטגוריה הנכונה.';
      if (!Store.live) return '';
      const files = [...v.files];
      if (!files.length && !(target && v.note)) return target ? 'צריך לבחור תמונות או לכתוב מה נעשה' : 'צריך לבחור לפחות תמונה אחת';
      if (files.length > MAX_PHOTOS) return `אפשר עד ${MAX_PHOTOS} תמונות בכל העלאה, ונבחרו ${files.length}. מעלים בשתי פעמים.`;
      const heic = files.filter((f) => /^image\/hei[cf]$/i.test(f.type) || /\.hei[cf]$/i.test(f.name));
      if (heic.length) return `${heic.length} מהתמונות בפורמט HEIC (מאייפון), והדפדפן לא יציג אותן. מעלים אותן ישר מהנייד, שממיר ל־JPG לבד, או ממירים ל־JPG לפני ההעלאה.`;
      const big = files.filter((f) => /^video\//.test(f.type) && f.size > MAX_VIDEO_MB * 1024 * 1024);
      if (big.length) return `${big.length === 1 ? 'סרטון אחד גדול' : `${big.length} סרטונים גדולים`} מ־${MAX_VIDEO_MB}MB (${big.map((f) => Math.round(f.size / 1048576) + 'MB').join(', ')}). אפשר לקצר אותו בטלפון (עריכה ← חיתוך) ולהעלות שוב. סרטון של עד כ־3 דקות בדרך כלל עובר.`;
      return '';
    },
    async onSave(v) { return withUpload(async () => {
      let photos = [];
      if (Store.live) {
        if (!v.files.length && !(target && v.note)) return 'צריך לבחור לפחות תמונה אחת';
        for (const f of [...v.files].slice(0, MAX_PHOTOS)) photos.push(await storeFile(await shrinkImage(f)));
      } else {
        for (const f of [...v.files].slice(0, 6)) { const src = await readImage(f); if (src) photos.push(src); }
        if (!photos.length && !(target && v.note)) photos = ['assets/img/j-28.jpg', 'assets/img/j-31.jpg'];
      }
      // Look the update up again: the project may have been reloaded while the photos uploaded.
      const u = target && Store.data.updates.find((x) => x.id === target.id);
      if (target && !u) return 'העדכון לא נמצא (אולי נמחק בינתיים). התמונות לא נוספו.';
      if (u) {
        u.photos.push(...photos);
        u.stages = v.stages;
        u.stage = v.stages[0];
        u.edited = TODAY;
        (u.log || (u.log = [])).push({ date: TODAY, text: v.note || '', photos });
        Store.log(photos.length ? `הוסיף ${photos.length} תמונות לעדכון: ${u.title}` : `הוסיף טקסט לעדכון: ${u.title}`, TEAM.pm.name);
        Store.notify(photos.length ? `נוספו ${photos.length} תמונות לעדכון "${u.title}"` : `נוסף עדכון ל"${u.title}"`, 'photos');
      } else {
        Store.data.updates.unshift({ id: 'u' + Date.now(), date: TODAY, title: v.title, stage: v.stages[0], stages: v.stages, desc: v.desc, photos });
        Store.log(`העלה ${photos.length} תמונות: ${v.title}`, TEAM.pm.name);
        Store.notify(`נוספו ${photos.length} תמונות חדשות מהפרויקט`, 'photos');
      }
      Store.save();
      return u ? (photos.length ? `${photos.length} התמונות נוספו לעדכון "${u.title}"` : `הטקסט נוסף לעדכון "${u.title}"`) : 'התמונות פורסמו ביומן הפרויקט';
    }); },
  });
}

// Edit the texts of a photo update: title, description and the text of each addition.
function updateTextForm(id) {
  const u = Store.data.updates.find((x) => x.id === id);
  if (!u) return;
  const log = u.log || [];
  formModal({
    title: 'עריכת הטקסטים של העדכון',
    intro: `${fmtDate(u.date)} · ${u.photos.length} תמונות`,
    fields: [
      { id: 'title', label: 'כותרת', value: u.title, required: true },
      { id: 'desc', label: `תיאור (מ־${fmtDate(u.date)})`, type: 'textarea', value: u.desc || '' },
      ...log.map((e, i) => ({ id: 'log' + i, label: `מה נעשה ב־${fmtDate(e.date)}${e.photos && e.photos.length ? ` (${e.photos.length} תמונות)` : ''}`, type: 'textarea', value: e.text || '' })),
    ],
    onSave(v) {
      const cur = Store.data.updates.find((x) => x.id === id); // the project may have been reloaded meanwhile
      if (!cur) return 'העדכון לא נמצא';
      cur.title = v.title;
      cur.desc = v.desc;
      (cur.log || []).forEach((e, i) => { if ('log' + i in v) e.text = v['log' + i]; });
      cur.log = (cur.log || []).filter((e) => e.text || (e.photos && e.photos.length)); // an empty text-only entry goes away
      cur.edited = TODAY;
      Store.log(`ערך את הטקסטים של העדכון: ${cur.title}`, TEAM.pm.name);
      Store.save();
      return 'הטקסטים נשמרו';
    },
  });
}

const ACTIONS = {
  weekly() { App.go('bo-weekly'); },
  weeklyText() {
    const p = Store.data.project;
    formModal({
      title: 'עדכון שבועי ללקוח', intro: 'הטקסט יופיע בראש הדשבורד של המשפחה תחת "כרגע בפרויקט".',
      fields: [{ id: 'text', label: 'מה קורה בפרויקט השבוע', type: 'textarea', value: p.weekly.text, required: true }],
      submit: 'פרסום ללקוח',
      onSave(v) {
        p.weekly = { updated: TODAY, text: v.text };
        Store.log('עדכן את הסיכום השבועי', TEAM.pm.name);
        Store.notify('עדכון שבועי חדש מהפרויקט', 'home');
        Store.save();
        return 'העדכון פורסם ונשלחה התראה למשפחה';
      },
    });
  },
  timeline() { stagesBoard(); },
  // Everything the "new project" form asks, editable later. Saving here never sends an invite.
  details() {
    const d = Store.data;
    const p = d.project;
    const team = d.team || (d.team = JSON.parse(JSON.stringify(TEAM)));
    const mem = d.members || (d.members = []);
    const m1 = mem.find((m) => m.role === 'בעל הבית') || mem[0] || {};
    const m2 = mem.find((m) => m !== m1 && /זוג/.test(m.role || '')) || mem.find((m) => m !== m1) || {};
    const types = PROJECT_TYPES.includes(p.type) || !p.type ? PROJECT_TYPES : [p.type, ...PROJECT_TYPES];
    formModal({
      title: 'פרטי פרויקט',
      intro: 'שמירה כאן לא שולחת הזמנה ללקוחות. הזמנה שולחים בנפרד, מ"הזמנת משתמש לפרויקט".',
      fields: [
        { id: 'name', label: 'שם הפרויקט', value: p.name, required: true },
        { id: 'family', label: 'שם המשפחה', value: p.family, required: true },
        { id: 'address', label: 'כתובת', value: p.address },
        { id: 'area', label: 'היקף (למשל: דירת 5 חדרים, 140 מ"ר)', value: p.area },
        { id: 'scope', label: 'תיאור העבודה (מוצג ללקוח ב"הפרויקט שלי")', type: 'textarea', value: p.scope },
        { id: 'c1', label: 'לקוח ראשי – שם', value: m1.name },
        { id: 'c1e', label: 'לקוח ראשי – אימייל', type: 'email', value: m1.email },
        { id: 'c1p', label: 'לקוח ראשי – טלפון', type: 'tel', value: m1.phone },
        { id: 'c2', label: 'לקוח נוסף – שם', value: m2.name },
        { id: 'c2e', label: 'לקוח נוסף – אימייל', type: 'email', value: m2.email },
        { id: 'c2p', label: 'לקוח נוסף – טלפון', type: 'tel', value: m2.phone },
        ...[['pm', 'מנהל פרויקט'], ['architect', 'אדריכלית / מעצבת']].flatMap(([k, label]) => [
          { id: `${k}_name`, label: `${label} – שם`, value: team[k] && team[k].name },
          { id: `${k}_phone`, label: `${label} – טלפון`, type: 'tel', value: team[k] && team[k].phone },
          { id: `${k}_email`, label: `${label} – אימייל`, type: 'email', value: team[k] && team[k].email },
        ]),
        { id: 'type', label: 'סוג הפרויקט', type: 'select', options: types, value: p.type },
        { id: 'contract', label: 'סכום השיפוץ (₪) כולל מע"מ', type: 'number', value: p.contract || '' },
        { id: 'budget', label: 'תקציב כולל של המשפחה (לא חובה)', type: 'number', value: p.budget || '' },
        { id: 'start', label: 'תאריך התחלה', type: 'date', value: p.start },
        { id: 'handover', label: 'תאריך מסירה משוער', type: 'date', value: p.handover },
        ...(Store.live ? [{ id: 'imgfile', label: 'תמונה ראשית חדשה (לא חובה)', type: 'file', accept: 'image/*' }] : []),
        { id: 'image', label: 'תמונה ראשית', type: 'select', options: [...(String(p.image).startsWith('f:') ? [[p.image, 'התמונה שהועלתה']] : []), ['assets/img/hero-home.jpg', 'בית עם חצר'], ['assets/img/hero-4.jpg', 'סלון'], ['assets/img/hero-1.jpg', 'כניסה'], ['assets/img/hero-5.jpg', 'פינת אוכל'], ['assets/img/j-33.jpg', 'סלון 2']], value: p.image },
      ],
      validate(v) {
        const bad = [v.c1e, v.c2e, v.pm_email, v.architect_email].find((e) => e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
        return bad ? `כתובת המייל "${bad}" לא תקינה` : '';
      },
      onSave(v) {
        return withUpload(async () => {
          const f = v.imgfile && v.imgfile[0];
          if (f) v.image = await storeFile(await shrinkImage(f, 2400));
          Object.assign(p, {
            name: v.name, family: v.family, client: `משפחת ${v.family}`, address: v.address, area: v.area, scope: v.scope, type: v.type,
            contract: v.contract || 0, budget: v.budget || 0, start: v.start || p.start, handover: v.handover, image: v.image,
          });
          // The two main clients: update their entries in place (status and any invite stay as they were).
          [[m1, 'בעל הבית', v.c1, v.c1e, v.c1p], [m2, 'בן/בת זוג', v.c2, v.c2e, v.c2p]].forEach(([m, role, name, email, phone]) => {
            if (!name && !email && !phone) return;
            const row = mem.includes(m) ? m : (mem.push({ role, status: 'טרם הוזמן' }), mem[mem.length - 1]);
            Object.assign(row, { name, email: (email || '').toLowerCase(), phone });
          });
          // The team card the family sees (name, phone, email). TEAM is the in-memory copy the pages read.
          ['pm', 'architect'].forEach((k) => {
            const t = { ...(team[k] || TEAM[k] || {}), name: v[`${k}_name`], phone: v[`${k}_phone`], email: v[`${k}_email`].toLowerCase() };
            team[k] = t;
            if (TEAM[k]) Object.assign(TEAM[k], t);
          });
          Store.log('עדכן את פרטי הפרויקט', TEAM.pm.name);
          Store.save();
          return 'פרטי הפרויקט נשמרו';
        });
      },
    });
  },
  plan() {
    const plans = Store.data.plans;
    formModal({
      title: 'העלאת תכנית',
      fields: [
        { id: 'cat', label: 'קטגוריה', type: 'select', options: planCategories(Store.data) },
        { id: 'title', label: 'שם התכנית', required: true },
        // A newer plan takes the old one's place in "הכי מעודכן"; the old file stays, as an earlier version.
        ...(plans.length ? [{ id: 'replaces', label: 'האם היא מחליפה תכנית קיימת?', type: 'select', value: '',
          options: [['', 'לא, זו תכנית חדשה'], ...plans.map((p) => [p.id, `מחליפה את: ${p.cat} · ${p.title} (V${p.versions[0].v})`])] }] : []),
        { id: 'file', label: 'קובץ', type: 'file', accept: '.pdf,.dwg,.dwf,.xls,.xlsx,image/*' },
        { id: 'approve', label: 'לבקש אישור מהלקוח', type: 'checkbox', value: true },
      ],
      submit: 'העלאה',
      onSave(v) { return withUpload(async () => {
        const f = v.file[0];
        const path = await storeFile(f);
        const old = v.replaces && Store.data.plans.find((x) => x.id === v.replaces);
        if (old) {
          const nv = old.versions[0].v + 1;
          old.versions.forEach((x) => { if (!x.title) x.title = old.title; }); // the replaced files keep their own name
          old.versions.unshift({ v: nv, date: TODAY, by: uploaderName(), title: v.title, note: old.title !== v.title ? `מחליפה את "${old.title}"` : 'גרסה מעודכנת', path,
            file: f ? f.name.split('.').pop().toUpperCase().slice(0, 4) : old.versions[0].file, size: f ? (f.size / 1048576).toFixed(1) + 'MB' : '—' });
          old.title = v.title;
          old.cat = v.cat;
          old.status = v.approve ? 'pending' : 'new';
          old.exec = 'draft'; // a new version waits for Jorge's approval for execution
          Store.data.tasks.forEach((t) => { if (t.ref && t.ref.id === old.id && t.type === 'approval') t.done = true; });
          if (v.approve) Store.data.tasks.unshift({ id: 'k' + Date.now(), type: 'approval', title: `אישור ${v.title} V${nv}`, sub: `גרסה מעודכנת · ${fmtDateShort(TODAY)}`, ref: { page: 'plans', id: old.id }, level: 'red', done: false });
          Store.log(`העלה תכנית מעודכנת: ${v.title} (V${nv})${v.approve ? ' וביקש אישור' : ''}`, TEAM.architect.name);
          Store.notify(`עודכנה תכנית: ${v.title}${v.approve ? ' – נדרש אישורך' : ''}`, 'plans');
          Store.save();
          return 'התכנית המעודכנת הועלתה. הקודמת עברה ל"הכל", כגרסה קודמת.';
        }
        const id = 'pl' + Date.now();
        Store.data.plans.unshift({ id, cat: v.cat, title: v.title, status: v.approve ? 'pending' : 'new', exec: 'draft', versions: [{ v: 1, date: TODAY, by: uploaderName(), note: 'גרסה ראשונה', path, file: f ? f.name.split('.').pop().toUpperCase().slice(0, 4) : 'PDF', size: f ? (f.size / 1048576).toFixed(1) + 'MB' : '—' }] });
        if (v.approve) Store.data.tasks.unshift({ id: 'k' + Date.now(), type: 'approval', title: `אישור ${v.title} V1`, sub: `ביקשה ${TEAM.architect.name} · ${fmtDateShort(TODAY)}`, ref: { page: 'plans', id }, level: 'red', done: false });
        Store.log(`העלה תכנית ${v.cat}: ${v.title} V1${v.approve ? ' וביקש אישור' : ''}`, TEAM.architect.name);
        Store.notify(`נוספה תכנית חדשה: ${v.title}`, 'plans');
        Store.save();
        return 'התכנית הועלתה והלקוח קיבל התראה';
      }); },
    });
  },
  version() {
    const plans = Store.data.plans;
    formModal({
      title: 'גרסה חדשה לתכנית', intro: 'הגרסה החדשה תופיע ב"הכי מעודכן", והקודמת עוברת ל"הכל" ולא נמחקת.',
      fields: [
        { id: 'id', label: 'תכנית', type: 'select', options: plans.map((p) => [p.id, `${p.cat} · ${p.title} (V${p.versions[0].v})`]) },
        { id: 'note', label: 'מה השתנה', type: 'textarea', required: true },
        { id: 'file', label: 'קובץ', type: 'file' },
        { id: 'approve', label: 'לבקש אישור מהלקוח', type: 'checkbox', value: true },
      ],
      submit: 'העלאת גרסה',
      onSave(v) { return withUpload(async () => {
        const p = plans.find((x) => x.id === v.id);
        const nv = p.versions[0].v + 1;
        const f = v.file[0];
        const path = await storeFile(f);
        p.versions.forEach((x) => { if (!x.title) x.title = p.title; });
        p.versions.unshift({ v: nv, title: p.title, date: TODAY, by: uploaderName(), note: v.note, path,
          file: f ? f.name.split('.').pop().toUpperCase().slice(0, 4) : p.versions[0].file, size: f ? (f.size / 1048576).toFixed(1) + 'MB' : p.versions[0].size });
        p.status = v.approve ? 'pending' : 'new';
        p.exec = 'draft'; // a new version waits for Jorge's approval for execution
        if (v.approve) {
          Store.data.tasks.forEach((t) => { if (t.ref && t.ref.id === p.id) t.done = true; });
          Store.data.tasks.unshift({ id: 'k' + Date.now(), type: 'approval', title: `אישור ${p.title} V${nv}`, sub: `${v.note} · ${fmtDateShort(TODAY)}`, ref: { page: 'plans', id: p.id }, level: 'red', done: false });
        }
        Store.log(`העלה ${p.title} V${nv}`, TEAM.architect.name);
        Store.notify(`עודכנה תכנית: ${p.title} V${nv}${v.approve ? ' – נדרש אישורך' : ''}`, 'plans');
        Store.save();
        return `גרסה V${nv} הועלתה`;
      }); },
    });
  },
  approval() {
    const plans = Store.data.plans.filter((p) => p.status !== 'pending');
    formModal({
      title: 'בקשת אישור מהלקוח',
      fields: [
        { id: 'id', label: 'מה צריך לאשר', type: 'select', options: plans.map((p) => [p.id, `${p.title} V${p.versions[0].v}`]) },
        { id: 'sub', label: 'הסבר קצר ללקוח', placeholder: 'למשל: נדרש לפני הזמנת גופי התאורה' },
      ],
      submit: 'שליחת בקשה',
      onSave(v) {
        const p = Store.data.plans.find((x) => x.id === v.id);
        p.status = 'pending';
        Store.data.tasks.unshift({ id: 'k' + Date.now(), type: 'approval', title: `אישור ${p.title} V${p.versions[0].v}`, sub: v.sub || `נשלח ${fmtDateShort(TODAY)}`, ref: { page: 'plans', id: p.id }, level: 'red', done: false });
        Store.log(`ביקש אישור ל-${p.title} V${p.versions[0].v}`, TEAM.pm.name);
        Store.notify(`נדרש אישורך: ${p.title}`, 'tasks');
        Store.save();
        return 'הבקשה נשלחה ללקוח';
      },
    });
  },
  task() {
    formModal({
      title: 'משימה חדשה ללקוח',
      fields: [
        { id: 'title', label: 'משימה', required: true, placeholder: 'למשל: לבחור ידיות לארונות המטבח' },
        { id: 'sub', label: 'פרטים / תאריך יעד' },
        { id: 'level', label: 'דחיפות', type: 'select', options: [['red', 'דורש פעולה'], ['yellow', 'ממתין'], ['blue', 'לידיעה']] },
      ],
      onSave(v) {
        Store.data.tasks.unshift({ id: 'k' + Date.now(), type: 'info', title: v.title, sub: v.sub, ref: { page: 'tasks' }, level: v.level, done: false });
        Store.log(`פתח משימה ללקוח: ${v.title}`, TEAM.pm.name);
        Store.notify(`משימה חדשה: ${v.title}`, 'tasks');
        Store.save();
        return 'המשימה נוספה';
      },
    });
  },
  material() { materialForm(); },
  // With an update id: add photos to that update. Without: ask whether to start a new update or add to an existing one.
  photos(targetId) {
    const ups = Store.data.updates || [];
    const target = targetId && ups.find((u) => u.id === targetId);
    if (target || !ups.length) return photoForm(target || null);
    openModal({
      title: 'העלאת תמונות',
      body: `<button class="btn btn-primary" id="ph-new" style="width:100%;justify-content:center">${icon('plus')}עדכון חדש (כותרת חדשה)</button>
        <p class="small ink-2" style="margin:18px 0 8px"><b>או הוספה לעדכון שכבר פורסם:</b></p>
        <div style="display:grid;gap:8px">${ups.slice(0, 12).map((u) => `<button class="btn btn-ghost" data-up="${esc(u.id)}" style="width:100%;justify-content:space-between;text-align:right;white-space:normal;height:auto;padding:10px 14px">
          <span><b>${esc(u.title)}</b><br><span class="small muted">${fmtDate(u.date)} · ${esc(stagesOf(u).join(', '))}</span></span><span class="small muted">${u.photos.length} תמונות</span></button>`).join('')}</div>`,
      onOpen(el) {
        el.querySelector('#ph-new').onclick = () => { closeModal(); photoForm(null); };
        el.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => { closeModal(); photoForm(ups.find((u) => u.id === b.dataset.up)); }));
      },
    });
  },
  doc() { uploadDocFlow(); },
  payment() { paymentsBoard(); },
  change() {
    formModal({
      title: 'שינוי / תוספת לחוזה',
      fields: [
        { id: 'title', label: 'תיאור השינוי', required: true },
        { id: 'amount', label: 'עלות (₪) כולל מע"מ', type: 'number', required: true },
      ],
      submit: 'שליחה לאישור הלקוח',
      onSave(v) {
        const no = Math.max(0, ...Store.data.changes.map((c) => c.no)) + 1;
        const id = 'c' + Date.now();
        Store.data.changes.push({ id, no, title: v.title, amount: v.amount, status: 'pending', date: TODAY });
        Store.data.tasks.unshift({ id: 'k' + Date.now(), type: 'approval', title: `אישור שינוי #${no}: ${v.title}`, sub: `תוספת ${ils(v.amount)} כולל מע"מ`, ref: { page: 'change', id }, level: 'yellow', done: false });
        Store.log(`הוסיף שינוי #${no} – ${v.title}`, TEAM.pm.name);
        Store.notify(`שינוי #${no} ממתין לאישורך`, 'tasks');
        Store.save();
        return `שינוי #${no} נשלח לאישור`;
      },
    });
  },
  pro() {
    formModal({
      title: 'בעל מקצוע / ספק',
      fields: [
        { id: 'cat', label: 'תחום', type: 'select', options: PRO_CATEGORIES },
        { id: 'name', label: 'שם', required: true }, { id: 'company', label: 'חברה' },
        { id: 'phone', label: 'טלפון', type: 'tel', required: true },
        { id: 'note', label: 'הערה' },
      ],
      onSave(v) {
        Store.data.pros.push({ id: 'pr' + Date.now(), ...v });
        Store.log(`הוסיף בעל מקצוע: ${v.name} (${v.cat})`, TEAM.pm.name);
        Store.save();
        return 'בעל המקצוע נוסף';
      },
    });
  },
  member() {
    formModal({
      title: 'הזמנת משתמש לפרויקט', intro: Store.live ? 'המשתמש יקבל למייל קישור כניסה, ויראה רק את הפרויקט הזה.' : 'המשתמש יקבל קישור במייל או ב-SMS לבחירת סיסמה, ויראה רק את הפרויקט הזה.',
      fields: [
        { id: 'name', label: 'שם', required: true },
        { id: 'role', label: 'תפקיד', type: 'select', options: ['בעל הבית', 'בת/בן זוג', 'מעצב/ת מטעם המשפחה (הרשאות צוות בפרויקט הזה)', 'בן משפחה נוסף', 'בעל מקצוע'] },
        { id: 'email', label: 'אימייל', type: 'email' }, { id: 'phone', label: 'טלפון', type: 'tel' },
      ],
      submit: 'שליחת הזמנה',
      onSave(v) { return withUpload(async () => {
        if (Store.live) {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return 'בלי מייל תקין אי אפשר לשלוח הזמנה';
          await Live.invite(Store.data.project.id, v.email.toLowerCase(), v.role);
        }
        // Someone already listed (e.g. entered in the project details) gets updated, not added twice.
        const known = Store.data.members.find((m) => (v.email && (m.email || '').toLowerCase() === v.email.toLowerCase()) || (!m.email && m.name === v.name));
        if (known) Object.assign(known, { ...v, email: (v.email || '').toLowerCase(), phone: v.phone || known.phone, status: 'הוזמן' });
        else Store.data.members.push({ ...v, status: 'הוזמן' });
        Store.log(`הזמין את ${v.name} (${v.role}) לפרויקט`, TEAM.pm.name);
        Store.save();
        return `ההזמנה נשלחה ל${v.name}`;
      }); },
    });
  },
};

Pages['bo-project'] = () => {
  const d = Store.data;
  if (d.empty) return { title: 'אין עדיין פרויקטים', html: `<div class="page-head"><div><h1>אין עדיין פרויקטים</h1><p>יוצרים את הפרויקט הראשון, ואחר כך מזמינים אליו את המשפחה.</p></div><a class="btn btn-accent" href="#/bo-new">${icon('plus')}פרויקט חדש</a></div>`, mount() {} };
  const p = d.project;
  const open = d.tasks.filter((t) => !t.done);
  return {
    title: p.name,
    html: `
      <div class="page-head">
        <div><a class="link-btn small" href="#/bo-home">← כל הפרויקטים</a><h1 style="margin-top:4px">${esc(p.name)}</h1><p>${esc(p.address)} · ${esc(TEAM[p.pm].name)}</p></div>
        <button class="btn btn-ghost" id="as-client">${icon('eye')}צפייה כלקוח</button>
      </div>
      <div class="kpis four">
        <div class="card stat"><div class="k">שלב</div><div class="v" style="font-size:20px">${esc(p.stage)}</div><div class="s">${p.progress}% התקדמות</div></div>
        <div class="card stat ${open.some((t) => t.level === 'red') ? 'alert' : ''}"><div class="k">ממתין ללקוח</div><div class="v">${open.length}</div><div class="s">${open.filter((t) => t.type === 'approval').length} אישורים</div></div>
        <div class="card stat"><div class="k">עדכון שבועי אחרון</div><div class="v" style="font-size:20px">${fmtDate(p.weekly.updated)}</div><div class="s">לפני ${daysBetween(p.weekly.updated, TODAY)} ימים</div></div>
        ${(() => { const cm = casaModel(d); return `<div class="card stat"><div class="k">שולם מההסכם</div><div class="v">${shareOf(cm.paid, cm.contract)}</div><div class="s">${ils(cm.paid)} מתוך ${ils(cm.contract)}</div></div>`; })()}
      </div>
      <div class="section-title"><h2>פעולות</h2></div>
      <div class="actions-grid">
        ${PROJECT_ACTIONS.filter(([k]) => !JORGE_ACTIONS.includes(k) || isJorge()).map(([k, ic, label]) => `<button class="action-tile" data-act="${k}">${icon(ic)}${esc(label)}</button>`).join('')}
      </div>
      <div class="grid md-2" style="margin-top:18px">
        <article class="card card-pad">
          <div class="card-head"><h3>ממתין ללקוח</h3></div>
          ${open.length ? `<ul class="action-list">${open.map((t) => `<li><span class="ico ${t.level}">${icon('clock')}</span><div class="txt"><b>${esc(t.title)}</b><span>${esc(t.sub)}</span></div></li>`).join('')}</ul>` : '<div class="empty">הלקוח סגר את כל המשימות</div>'}
        </article>
        ${Store.live ? `<article class="card card-pad" style="grid-column:1/-1">
          <div class="card-head"><h3>משתמשים בפרויקט</h3>${isJorge() ? `<button class="btn btn-sm btn-ghost" id="pm-add">${icon('plus')}הזמנה</button>` : ''}</div>
          <div id="pm-list"><p class="small muted">טוען…</p></div>
        </article>` : ''}
        <article class="card card-pad">
          <div class="card-head"><h3>יומן פעילות (Audit Log)</h3><a class="link-btn small" href="#/bo-audit">הכול</a></div>
          <ul class="audit">${d.audit.slice(0, 7).map((a) => `<li><span class="when">${fmtWhen(a.when)}</span><span class="what"><b>${esc(a.who)}</b> ${esc(a.what)}</span></li>`).join('')}</ul>
        </article>
      </div>`,
    mount(root) {
      root.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => ACTIONS[b.dataset.act]()));
      root.querySelector('#as-client').onclick = () => { Store.session.view = 'client'; Store.save(); App.go('home'); };
      if (Store.live) {
        const pa = root.querySelector('#pm-add');
        if (pa) pa.onclick = () => ACTIONS.member();
        fillProjectUsers(root.querySelector('#pm-list'));
      }
    },
  };
};

// Who can enter this project: invitations and whether they already signed in.
async function fillProjectUsers(box) {
  const pid = Store.data.project.id;
  const list = await Live.invites(pid);
  if (!list.length) { box.innerHTML = '<div class="empty">עוד לא הוזמנו משתמשים. לוחצים "הזמנה" ומזינים את המייל של בן המשפחה.</div>'; return; }
  box.innerHTML = `<ul class="rows">${list.map((m) => `<li class="row">
    <div class="main-col"><div class="title" dir="ltr" style="text-align:right">${esc(m.email)}</div><div class="sub">${esc(m.role)} · הוזמן ${fmtDate(m.invited_at)}</div></div>
    <div class="end">${m.accepted_at ? pill('green', 'נכנס למערכת') : pill('yellow', 'עוד לא נכנס')}
      ${isJorge() ? `<button class="btn btn-sm btn-quiet" data-resend="${esc(m.email)}">שליחת קישור</button>
      <button class="btn btn-sm btn-quiet" data-remove="${esc(m.email)}">הסרה</button>` : ''}</div>
  </li>`).join('')}</ul>`;
  box.querySelectorAll('[data-resend]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await Live.sendLink(b.dataset.resend); toast('קישור כניסה נשלח ל־' + b.dataset.resend); } catch (e) { toast('השליחה נכשלה: ' + e.message); }
    b.disabled = false;
  }));
  box.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = async () => {
    if (!confirm(`להסיר את ${b.dataset.remove} מהפרויקט? הגישה שלו תיחסם מיד.`)) return;
    try {
      await Live.removeMember(pid, b.dataset.remove);
      Store.data.members = Store.data.members.filter((m) => (m.email || '').toLowerCase() !== b.dataset.remove);
      Store.log(`הסיר את ${b.dataset.remove} מהפרויקט`);
      Store.save();
      fillProjectUsers(box);
    } catch (e) { toast('ההסרה נכשלה: ' + e.message); }
  }));
}

Pages['bo-audit'] = () => ({
  title: 'יומן פעילות',
  html: `
    <div class="page-head"><div><h1>יומן פעילות</h1><p>מי עשה מה ומתי בפרויקט בית אברהמי. הפעולות נשמרות ולא נמחקות.</p></div></div>
    <article class="card card-pad"><ul class="audit">${Store.data.audit.map((a) => `<li><span class="when">${fmtWhen(a.when)}</span><span class="what"><b>${esc(a.who)}</b> ${esc(a.what)}</span></li>`).join('')}</ul></article>`,
  mount() {},
});

/* ---------- פרויקט חדש ---------- */
// Real team names for the project-manager and designer fields (free text, so anyone can be typed).
const STAFF_PICK = ['חורחה עברין', 'יניב', 'עינב', 'אלכס', 'אולג'];
function leadFor(q) { const id = q && q.lead; return id ? (Leads.list() || []).find((l) => String(l.id) === id) : null; }

Pages['bo-new'] = (q) => { const L = leadFor(q) || {}; return (!isJorge() ? { title: 'פרויקט חדש', html: '<div class="page-head"><div><h1>פרויקט חדש</h1><p>רק חורחה פותח פרויקטים חדשים.</p></div></div>', mount() {} } : {
  title: 'פרויקט חדש',
  html: `
    <div class="page-head"><div><a class="link-btn small" href="#/bo-home">← כל הפרויקטים</a><h1 style="margin-top:4px">פרויקט חדש</h1><p>${L.id ? `מתוך "על הפרק": ${esc(L.client)}. הפרטים מולאו מהרשימה, ואפשר לשנות.` : 'אחרי השמירה אפשר לשלוח ללקוחות הזמנה לפתיחת משתמש'}</p></div></div>
    <form class="card card-pad" id="np" style="max-width:760px">
      <div class="form-grid two">
        <label class="field"><span>שם הפרויקט</span><input class="input" name="name" required placeholder="למשל: בית כהן" value="${esc(L.client ? 'בית ' + L.client.replace(/^משפחת\s+/, '') : '')}"></label>
        <label class="field"><span>שם המשפחה</span><input class="input" name="family" required value="${esc((L.client || '').replace(/^משפחת\s+/, ''))}"></label>
        <label class="field" style="grid-column:1/-1"><span>כתובת</span><input class="input" name="address" value="${esc(L.city || '')}"></label>
        <label class="field"><span>לקוח ראשי – שם</span><input class="input" name="c1"></label>
        <label class="field"><span>לקוח ראשי – אימייל / טלפון</span><input class="input" name="c1c" value="${esc(L.phone || '')}"></label>
        <label class="field"><span>לקוח נוסף – שם</span><input class="input" name="c2"></label>
        <label class="field"><span>לקוח נוסף – אימייל / טלפון</span><input class="input" name="c2c"></label>
        <label class="field"><span>מנהל פרויקט</span><input class="input" name="pm" list="team-names" value="חורחה עברין"></label>
        <label class="field"><span>אדריכלית / מעצבת</span><input class="input" name="arch" list="team-names" value="${esc(L.designer || '')}"></label>
        <datalist id="team-names">${STAFF_PICK.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
        <label class="field"><span>סוג הפרויקט</span><select class="input" name="ptype">${PROJECT_TYPES.map((t) => `<option ${t === L.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label class="field"><span>סכום השיפוץ (₪) כולל מע"מ</span><input class="input num" type="text" name="amount" inputmode="decimal" data-money value="${esc(moneyFmt(L.amount))}"></label>
        <label class="field"><span>תאריך התחלה</span><input class="input" type="date" name="start" value="${L.start_month ? L.start_month + '-01' : TODAY}"></label>
        <label class="field"><span>תאריך יעד</span><input class="input" type="date" name="end" value="${L.start_month && L.duration_months ? (() => { const [y, m] = L.start_month.split('-').map(Number); const d = new Date(y, m - 1 + Number(L.duration_months), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; })() : ''}"></label>
        <label class="field"><span>תקציב כולל של המשפחה (לא חובה)</span><input class="input num" type="text" name="budget" inputmode="decimal" data-money></label>
        <label class="field"><span>תמונה ראשית</span><input class="input" type="file" name="img" accept="image/*"></label>
      </div>
      <label class="check"><input type="checkbox" name="invite" checked><span>לשלוח ללקוחות הזמנה לפתיחת משתמש</span></label>
      <label class="check"><input type="checkbox" name="tpl" checked><span>ליצור את שלבי העבודה ותיקיות לפי התבנית הקבועה</span></label>
      <div class="row-actions"><button class="btn btn-primary" type="submit">${icon('check')}יצירת הפרויקט</button><a class="btn btn-ghost" href="#/bo-home">ביטול</a></div>
    </form>`,
  mount(root) {
    root.querySelector('#np').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      if (!f.get('name') || !f.get('family')) return;
      if (Store.live) {
        const btn = e.target.querySelector('[type=submit]');
        btn.disabled = true;
        try {
          const pid = await createLiveProject(f);
          if (L.id) await Leads.save({ ...L, status: 'won', project_id: pid }).catch(() => {});
          App.go('bo-project');
        } catch (ex) { btn.disabled = false; toast('יצירת הפרויקט נכשלה: ' + ex.message); }
        return;
      }
      Store.data.portfolio.push({ id: 'p' + Date.now(), name: f.get('name'), client: `משפחת ${f.get('family')}`, city: (f.get('address') || '').split(',').pop().trim() || '—', pm: f.get('pm'), stage: 'אפיון ופרוגרמה', progress: 0, openTasks: 0, pendingApprovals: 0, schedule: 'ok', alerts: 0, img: 'assets/img/t-102.jpg' });
      Store.log(`יצר פרויקט חדש: ${f.get('name')}`, TEAM.pm.name);
      if (L.id) Leads.save({ ...L, status: 'won', project_id: 'demo' });
      Store.save();
      toast(f.get('invite') ? 'הפרויקט נוצר וההזמנות נשלחו ללקוחות' : 'הפרויקט נוצר');
      App.go('bo-home');
    };
  },
}); };

// Creates the project row, uploads its cover photo and invites the family by email.
async function createLiveProject(f) {
  await Live.flush();
  const team = {
    pm: { name: f.get('pm') || '', role: 'מנהל פרויקט', phone: '', email: '' },
    architect: { name: f.get('arch') || '', role: 'אדריכלית ומעצבת', phone: '', email: '' },
  };
  const members = [['c1', 'בעל הבית'], ['c2', 'בן/בת זוג']]
    .filter(([k]) => f.get(k) || f.get(k + 'c'))
    .map(([k, role]) => ({ name: f.get(k) || '', role, email: /@/.test(f.get(k + 'c')) ? f.get(k + 'c').trim().toLowerCase() : '', phone: /@/.test(f.get(k + 'c')) ? '' : f.get(k + 'c'), status: 'הוזמן' }));
  const data = emptyProjectData({
    name: f.get('name'), family: f.get('family'), address: f.get('address') || '', start: f.get('start') || TODAY,
    handover: f.get('end') || '', budget: moneyNum(f.get('budget')), team, members, template: !!f.get('tpl'),
  });
  data.project.type = f.get('ptype') || '';
  data.project.contract = moneyNum(f.get('amount'));
  const pid = await Live.createProject(data);
  await Live.open(pid);
  const img = f.get('img');
  if (img && img.size) Store.data.project.image = await storeFile(await shrinkImage(img, 2400));
  let sent = 0;
  if (f.get('invite')) for (const m of members) if (m.email) { await Live.invite(pid, m.email, m.role); sent++; }
  Store.log(`יצר את הפרויקט ${f.get('name')}`);
  Store.save();
  await Live.flush();
  toast(sent ? `הפרויקט נוצר ונשלחו ${sent} הזמנות במייל` : 'הפרויקט נוצר');
  return pid;
}

/* ---------- הרשאות ---------- */
async function fillStaff(box) {
  const list = await Live.staffList();
  const me = Live.user.email.toLowerCase();
  box.innerHTML = `<ul class="rows">${list.map((m) => `<li class="row">
    <div class="main-col"><div class="title">${esc(m.name || m.email)}</div><div class="sub" dir="ltr" style="text-align:right">${esc(m.email)}</div></div>
    <div class="end">${m.email === me ? pill('blue', 'זה את/ה') : `<button class="btn btn-sm btn-quiet" data-unstaff="${esc(m.email)}">הסרה</button>`}</div>
  </li>`).join('')}</ul>`;
  box.querySelectorAll('[data-unstaff]').forEach((b) => (b.onclick = async () => {
    if (!confirm(`להסיר את ${b.dataset.unstaff} מהצוות? הגישה ל־Back Office תיחסם מיד.`)) return;
    try { await Live.removeStaff(b.dataset.unstaff); fillStaff(box); } catch (e) { toast('ההסרה נכשלה: ' + e.message); }
  }));
}

Pages['bo-perms'] = () => {
  return {
    title: 'הרשאות',
    html: `
      <div class="page-head"><div><h1>הרשאות</h1><p>מי רשאי לעשות מה, לפי ההחלטות מ־29.10.2026. ההרשאות נאכפות במסד עצמו, לא רק במסך.</p></div></div>
      ${Store.live && isJorge() ? `<article class="card card-pad" style="margin-bottom:14px">
        <div class="card-head"><h3>צוות קאסה פואבלו</h3></div>
        <p class="small ink-2" style="margin-top:0">מי שברשימה נכנס ל־Back Office ורואה את כל הפרויקטים. הכניסה עם המייל שכאן.</p>
        <div id="st-list"><p class="small muted">טוען…</p></div>
        <form id="st-add" class="form-grid two" style="margin-top:12px;align-items:end">
          <label class="field"><span>שם</span><input class="input" name="name" required></label>
          <label class="field"><span>אימייל</span><input class="input" name="email" type="email" dir="ltr" required></label>
          <div><button class="btn btn-primary" type="submit">${icon('plus')}הוספה לצוות</button></div>
        </form>
      </article>` : ''}
      <div class="legend-status" style="margin-bottom:12px">${Object.values(PERM_LABELS).map(([c, t]) => pill(c, t)).join('')}</div>
      <div class="grid md-2">${PERMS.map(([g, rows]) => `<article class="card"><div class="card-pad" style="padding-bottom:4px"><h3>${esc(g)}</h3></div>
        <ul class="rows">${rows.map(([t, lv]) => `<li class="row compact"><div class="main-col"><div class="title" style="font-weight:500">${esc(t)}</div></div><div class="end">${pill(...PERM_LABELS[lv])}</div></li>`).join('')}</ul></article>`).join('')}</div>
      <p class="small muted" style="margin-top:12px">מעצבת מטעם המשפחה מקבלת הרשאות צוות רק בפרויקט שלה: מזמינים אותה בתפקיד "מעצב/ת מטעם המשפחה".</p>
      <div class="grid md-2" style="margin-top:14px">
        <article class="card card-pad"><h3 style="margin-bottom:8px">${icon('shield', 'xs')} אבטחה</h3>
          <ul class="ink-2" style="margin:0;padding-inline-start:18px">
            <li>הפרדה בין פרויקטים ברמת מסד הנתונים (Row Level Security), לא רק במסך</li>
            <li>קבצים בתיקייה פרטית, נפתחים רק דרך קישור זמני חתום</li>
            <li>תקשורת מוצפנת (HTTPS), סיסמאות מוצפנות, איפוס סיסמה במייל</li>
            <li>גיבוי יומי, יומן פעילות, חסימת משתמש בלחיצה</li>
          </ul></article>
        <article class="card card-pad"><h3 style="margin-bottom:8px">מה הלקוח לא רואה</h3>
          <ul class="ink-2" style="margin:0;padding-inline-start:18px">
            <li>עלויות פנימיות ומחירי קבלני משנה</li>
            <li>הערות פנימיות של הצוות</li>
            <li>פרויקטים של לקוחות אחרים</li>
            <li>טיוטות שעוד לא פורסמו</li>
          </ul></article>
      </div>`,
    mount(root) {
      if (!Store.live || !isJorge()) return;
      fillStaff(root.querySelector('#st-list'));
      root.querySelector('#st-add').onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        const email = String(f.get('email')).trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast('צריך מייל תקין');
        try {
          await Live.addStaff(email, String(f.get('name')).trim());
          await Live.sendLink(email);
          toast(`${f.get('name')} נוסף לצוות וקיבל קישור כניסה`);
          e.target.reset();
          fillStaff(root.querySelector('#st-list'));
        } catch (ex) { toast('ההוספה נכשלה: ' + ex.message); }
      };
    },
  };
};
