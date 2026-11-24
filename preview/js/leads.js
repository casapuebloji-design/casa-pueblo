/* "על הפרק": לידים ופרויקטים שעוד לא נסגרו. צוות בלבד.
   במערכת האמיתית: טבלה leads במסד. בהדגמה: Store.data.leads בדפדפן. */

const LEAD_STATUS = {
  lead: ['blue', 'ליד'],
  hot: ['yellow', 'על הפרק'],
  won: ['green', 'נסגר'],
  lost: ['red', 'לא יצא לפועל'],
};
const PROJECT_TYPES = ['שיפוץ דירה', 'שיפוץ בית פרטי', 'בנייה חדשה', 'תוספת בנייה', 'מטבח', 'חדרי רחצה', 'עיצוב פנים', 'משרד / מסחרי', 'אחר'];

function seedLeads() {
  return [
    { id: 'l1', client: 'משפחת רוזן', phone: '052-1234567', type: 'שיפוץ בית פרטי', city: 'הוד השרון', amount: 1200000, designer: 'שירן גל', start_month: '2027-01', duration_months: 9, status: 'hot', notes: 'פגישה שנייה בשבוע הבא, מחכים להצעת מחיר', created_at: '2026-10-02' },
    { id: 'l2', client: 'משפחת אלמוג', phone: '054-9876543', type: 'שיפוץ דירה', city: 'תל אביב', amount: 450000, designer: '', start_month: '2026-12', duration_months: 4, status: 'lead', notes: 'הגיעו מהאתר', created_at: '2026-10-10' },
    { id: 'l3', client: 'משפחת ברק', phone: '050-5554433', type: 'בנייה חדשה', city: 'כפר סבא', amount: 2800000, designer: 'אדריכל משה לוי', start_month: '2027-03', duration_months: 14, status: 'hot', notes: 'ממתינים להיתר', created_at: '2026-09-21' },
    { id: 'l4', client: 'משפחת נחום', phone: '053-1112299', type: 'מטבח', city: 'רעננה', amount: 180000, designer: '', start_month: '2026-11', duration_months: 2, status: 'lost', notes: 'בחרו קבלן אחר', created_at: '2026-09-01' },
  ];
}

const Leads = {
  rows: null,
  loading: false,
  at: 0,

  list() {
    if (!Store.live) {
      if (!Store.data.leads) { Store.data.leads = seedLeads(); Store.save(); }
      return Store.data.leads;
    }
    return this.rows;
  },

  async load() {
    if (!Store.live || this.loading) return;
    this.loading = true;
    try {
      const { data, error } = await Live.sb.from('leads').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      this.rows = data || [];
      this.at = Date.now();
    } catch (e) {
      this.rows = this.rows || [];
      this.at = Date.now();
      toast('לא הצלחנו לטעון את הרשימה: ' + e.message);
    }
    this.loading = false;
  },

  async save(lead) {
    if (!Store.live) {
      const list = this.list();
      if (lead.id) Object.assign(list.find((l) => l.id === lead.id) || {}, lead);
      else list.unshift({ ...lead, id: 'l' + Date.now(), created_at: TODAY });
      Store.save();
      return;
    }
    const { id, created_at, updated_at, created_by, ...row } = lead;
    const q = id ? Live.sb.from('leads').update(row).eq('id', id) : Live.sb.from('leads').insert({ ...row, created_by: Live.user.email });
    const { error } = await q;
    if (error) throw error;
    await this.load();
  },

  async remove(id) {
    if (!Store.live) {
      Store.data.leads = this.list().filter((l) => l.id !== id);
      Store.save();
      return;
    }
    const { error } = await Live.sb.from('leads').delete().eq('id', id);
    if (error) throw error;
    await this.load();
  },
};

function leadWhen(l) {
  const parts = [];
  if (l.start_month) { const [y, m] = l.start_month.split('-').map(Number); parts.push(`${HEB_MONTHS[m - 1]} ${y}`); }
  if (l.duration_months) parts.push(`${l.duration_months} חודשים`);
  return parts.join(' · ') || '—';
}

function openLeadForm(lead = {}) {
  const editing = !!lead.id;
  formModal({
    title: editing ? lead.client : 'פרויקט חדש על הפרק',
    fields: [
      { id: 'client', label: 'שם הלקוח', value: lead.client, required: true, placeholder: 'למשל: משפחת כהן' },
      { id: 'phone', label: 'טלפון (לא חובה)', type: 'tel', value: lead.phone },
      { id: 'type', label: 'סוג הפרויקט', type: 'select', options: PROJECT_TYPES, value: lead.type || PROJECT_TYPES[0] },
      { id: 'city', label: 'עיר', value: lead.city },
      { id: 'amount', label: 'סכום השיפוץ (₪)', type: 'number', value: lead.amount || '' },
      { id: 'designer', label: 'מעצבת / אדריכל', value: lead.designer, placeholder: 'אם יש מטעם הלקוח' },
      { id: 'start_month', label: 'התחלה משוערת', type: 'month', value: lead.start_month },
      { id: 'duration_months', label: 'משך משוער (חודשים)', type: 'number', value: lead.duration_months || '' },
      { id: 'status', label: 'סטטוס', type: 'select', options: Object.entries(LEAD_STATUS).map(([k, v]) => [k, v[1]]), value: lead.status || 'lead' },
      { id: 'notes', label: 'הערות', type: 'textarea', value: lead.notes },
    ],
    submit: editing ? 'שמירה' : 'הוספה',
    async onSave(v) {
      try {
        await Leads.save({ ...lead, ...v, amount: v.amount || null, duration_months: v.duration_months || null, start_month: v.start_month || null });
        return editing ? 'נשמר' : 'נוסף לרשימה';
      } catch (e) { return 'השמירה נכשלה: ' + e.message; }
    },
  });
  if (!editing) return;
  const foot = document.querySelector('#fm-save').parentElement;
  const del = document.createElement('button');
  del.className = 'btn btn-quiet';
  del.style.marginInlineStart = 'auto';
  del.textContent = 'מחיקה';
  del.onclick = async () => {
    if (!confirm(`למחוק את ${lead.client} מהרשימה?`)) return;
    try { await Leads.remove(lead.id); closeModal(); toast('נמחק'); App.render(); } catch (e) { toast('המחיקה נכשלה: ' + e.message); }
  };
  foot.appendChild(del);
}

Pages['bo-leads'] = (q) => {
  const all = Leads.list();
  if (!all) return { title: 'על הפרק', html: '<div class="page-head"><div><h1>על הפרק</h1><p>טוען…</p></div></div>', mount() { Leads.load().then(() => App.route.page === 'bo-leads' && App.render()); } };
  const st = q.st || 'open';
  const term = q.c || '';
  const open = all.filter((l) => l.status === 'lead' || l.status === 'hot');
  const sum = (xs) => xs.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const won = all.filter((l) => l.status === 'won');
  const list = all
    .filter((l) => (st === 'all' ? true : st === 'open' ? l.status === 'lead' || l.status === 'hot' : l.status === st))
    .filter((l) => !term || [l.client, l.city, l.designer, l.type].join(' ').includes(term));
  const tabs = [['open', 'פתוחים'], ['hot', 'על הפרק'], ['lead', 'לידים'], ['won', 'נסגרו'], ['lost', 'לא יצאו לפועל'], ['all', 'הכל']];
  return {
    title: 'על הפרק',
    html: `
      <div class="page-head"><div><h1>על הפרק</h1><p>לידים ופרויקטים שעוד לא נסגרו. כשפרויקט נסגר, פותחים אותו מכאן כפרויקט במערכת.</p></div>
        <button class="btn btn-accent" id="ld-add">${icon('plus')}הוספה</button></div>
      <div class="kpis four">
        <div class="card stat"><div class="k">על הפרק</div><div class="v">${all.filter((l) => l.status === 'hot').length}</div></div>
        <div class="card stat"><div class="k">לידים</div><div class="v">${all.filter((l) => l.status === 'lead').length}</div></div>
        <div class="card stat"><div class="k">סכום פתוח</div><div class="v num">${ilsShort(sum(open))}</div></div>
        <div class="card stat"><div class="k">נסגרו</div><div class="v">${won.length}${won.length ? ` <span class="small muted num">${ilsShort(sum(won))}</span>` : ''}</div></div>
      </div>
      <div class="tabs" role="tablist" style="margin-top:16px">${tabs.map(([k, l]) => `<button role="tab" data-st="${k}" aria-selected="${k === st}">${l}</button>`).join('')}</div>
      <div class="toolbar"><input class="input search-input" type="search" id="ld-c" placeholder="חיפוש לקוח, עיר או מעצבת" value="${esc(term)}"></div>
      ${list.length ? `<article class="card"><div class="table-wrap"><table class="t">
        <thead><tr><th>לקוח</th><th>סוג</th><th>עיר</th><th class="n">סכום</th><th>מעצבת / אדריכל</th><th>זמן</th><th>סטטוס</th><th></th></tr></thead>
        <tbody>${list.map((l) => `<tr class="clickable" data-l="${esc(l.id)}">
          <td style="white-space:nowrap"><b>${esc(l.client)}</b>${l.phone ? `<div class="small muted" dir="ltr" style="text-align:end">${esc(l.phone)}</div>` : ''}</td>
          <td>${esc(l.type || '—')}</td><td>${esc(l.city || '—')}</td>
          <td class="n">${l.amount ? ils(Number(l.amount)) : '—'}</td>
          <td>${esc(l.designer || '—')}</td><td class="small">${esc(leadWhen(l))}</td>
          <td>${pill(...(LEAD_STATUS[l.status] || LEAD_STATUS.lead))}</td>
          <td>${l.status !== 'lost' && !l.project_id && isJorge() ? `<button class="btn btn-sm btn-ghost" data-open="${esc(l.id)}">פתיחת פרויקט</button>` : l.project_id ? '<span class="small muted">נפתח פרויקט</span>' : ''}</td>
        </tr>`).join('')}</tbody>
        ${list.length > 1 ? `<tfoot><tr class="total"><td colspan="3">סה"כ ${list.length}</td><td class="n">${ils(sum(list))}</td><td colspan="4"></td></tr></tfoot>` : ''}
      </table></div></article>` : `<div class="empty">${all.length ? 'אין כאן פרויקטים בסינון הזה' : 'עוד אין פרויקטים ברשימה. לוחצים על "הוספה" ומתחילים.'}</div>`}`,
    mount(root) {
      root.querySelector('#ld-add').onclick = () => openLeadForm();
      root.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => App.go('bo-leads', { st: b.dataset.st, c: term }, true)));
      root.querySelector('#ld-c').oninput = (e) => App.go('bo-leads', { st, c: e.target.value }, true);
      root.querySelectorAll('[data-open]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); App.go('bo-new', { lead: b.dataset.open }); }));
      root.querySelectorAll('tr[data-l]').forEach((tr) => (tr.onclick = () => {
        const l = all.find((x) => String(x.id) === tr.dataset.l);
        if (l) openLeadForm(l);
      }));
      if (Store.live && !Leads.loading && Date.now() - Leads.at > 30000) Leads.load().then(() => { if (App.route.page === 'bo-leads' && !modalStack.length) App.render(); });
    },
  };
};
