(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const panel = byId('invoices');
  const workspace = byId('invoiceWorkspace');
  const topbar = document.querySelector('.topbar');
  const list = byId('invoiceList');
  const detail = byId('invoiceDetail');
  const view = byId('invoiceView');
  const back = byId('invoiceClose');
  const search = byId('invoiceSearch');
  const sort = byId('invoiceSort');
  const filters = byId('invoiceFilters');
  const create = byId('invoiceCreate');
  const paymentDialog = byId('invoicePaymentDialog');
  const paymentForm = byId('invoicePaymentForm');
  const paymentInput = paymentForm.elements.paymentDate;
  const paymentError = paymentForm.querySelector('[data-error]');
  const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const numbers = new Intl.Collator('de', { numeric: true });
  const active = () => panel.classList.contains('is-active');
  const uid = () => window.firebase?.auth().currentUser?.uid || '';
  const dateLabel = iso => iso ? iso.split('-').reverse().join('.') : '—';

  const year = byId('invoiceYear'), basis = byId('invoiceDateBasis'), from = byId('invoiceFrom'), to = byId('invoiceTo');
  let yearChoice = '', visibleLimit = 50, onlyUndated = false;
  function todayISO(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  function currentYear(){return todayISO().slice(0,4);}
  function chooseYear(value){
    yearChoice=value;onlyUndated=false;
    from.value=/^\d{4}$/.test(value)?value+'-01-01':'';
    to.value=/^\d{4}$/.test(value)?value+'-12-31':'';
  }
  chooseYear(currentYear());
  function periodFor(entry){
    if(basis.value==='invoice')return [entry.issued,entry.issued];
    const a=DSAnalytics.date(entry.invoice.period?.from),b=DSAnalytics.date(entry.invoice.period?.to);
    return a&&b&&a>b?['','']:[a||b,b||a];
  }
  function validRange(){return !(from.value&&to.value&&from.value>to.value);}
  function matchesDate(entry){
    const [a,b]=periodFor(entry);
    if(onlyUndated)return !a;
    if(!validRange())return false;
    if(!from.value&&!to.value)return true;
    return !!a&&(!from.value||b>=from.value)&&(!to.value||a<=to.value);
  }
  function renderYears(entries){
    const years=new Set([currentYear()]);
    for(const e of entries){const [a,b]=periodFor(e);if(a){for(let y=+a.slice(0,4);y<=+b.slice(0,4)&&y<=+a.slice(0,4)+100;y++)years.add(String(y));}}
    if(/^\d{4}$/.test(yearChoice))years.add(yearChoice);
    year.replaceChildren(new Option('Alle Jahre','all'),...Array.from(years).sort().reverse().map(y=>new Option(y,y)),new Option('Eigener Zeitraum','custom'));
    year.value=yearChoice;
  }
  let statusFilter = 'all';
  let selectedId = null;
  let listPosition = null;
  let pendingPayment = null;

  let shareOwner = '';
  let shareRequest = null;
  let shareError = false;
  const shares = new Map();

  function amountInCents(invoice) {
    const pricing = (DSBilling.frozen(invoice) && invoice.pricingSnapshot) || invoice.pricing || {};
    const raw = pricing.totalGross ?? pricing.grandTotalGross ?? pricing.total ?? invoice.totalGross ?? invoice.total ?? invoice.amount;
    if (raw == null || raw === '') return null;
    const amount = Number(typeof raw === 'string' ? raw.replace(',', '.') : raw);
    return Number.isFinite(amount) ? Math.round(amount * 100) : null;
  }

  function listEntry(invoice) {
    const parties = resolveInvoiceParties(invoice, true);
    const recipient = resolveInvoiceRecipient(invoice, parties);
    const status = invoiceStatusCode(invoice.status);
    return {
      invoice, recipient, status,
      customerNumber: recipient.customerNumber || parties.cust?.customerNumber || '',
      dog: parties.pet?.name || parties.legacyDog?.name || '',
      issued: DSAnalytics.datesForInvoice(invoice).invoiceDate,
      amount: amountInCents(invoice),
      checkShare: status === 'open' && DSBilling.admin() && !!parties.cust?.id && !invoice.manualRecipient
    };
  }

  function renderRow({ invoice, recipient, status, customerNumber, dog, issued, amount, checkShare }) {
    const id = escapeHtml(invoice.id);
    const from = DSAnalytics.date(invoice.period?.from);
    const to = DSAnalytics.date(invoice.period?.to);
    const period = from && to && from !== to ? dateLabel(from) + ' – ' + dateLabel(to) : dateLabel(from || to);
    const extra = [customerNumber, dog].filter(Boolean).join(' · ');
    const reason = status === 'cancelled' ? invoice.cancelReason || invoice.stornoReason || '' : '';
    return `<button type="button" class="invoice-row invoice-grid" data-invoice-id="${id}"${invoice.id === selectedId ? ' aria-current="true"' : ''}>
      <span class="invoice-number">${escapeHtml(invoice.invoiceNumber || '—')}</span>
      <span class="invoice-party"><strong>${escapeHtml(recipient.name || '—')}</strong>${extra ? `<small>${escapeHtml(extra)}</small>` : ''}</span>
      <span class="invoice-date"><span class="invoice-label-compact muted">Rechnungsdatum </span>${dateLabel(issued)}</span>
      <span class="invoice-period"><span class="invoice-label-compact muted">Leistungszeitraum </span>${period}</span>
      <span class="invoice-amount">${amount === null ? '—' : money.format(amount / 100)}</span>
      <span class="invoice-row-status">${invoiceStatusBadge(invoice.status)}${reason ? `<small>${escapeHtml(reason)}</small>` : ''}${checkShare ? `<small data-invoice-share="${id}" hidden></small>` : ''}</span>
    </button>`;
  }

  function render() {
    if (!active()) return;
    const query = search.value;
    const invoices = getInvoices();
    if (selectedId && !invoices.some(invoice => invoice.id === selectedId)) closeDetail(false);
    const allEntries=invoices.map(listEntry);
    renderYears(allEntries);
    const searched=allEntries.filter(({invoice,recipient,customerNumber,dog,issued})=>matchesWorkspaceSearch(query,invoice.invoiceNumber,recipient.name,recipient.customerNumber,customerNumber,dog,dateLabel(issued),invoice.period?.from,invoice.period?.to));
    const missing=searched.filter(e=>!periodFor(e)[0]&&(statusFilter==='all'||e.status===statusFilter)).length;
    const notice=byId('invoiceUndatedNotice');notice.hidden=!missing&&!onlyUndated;
    notice.querySelector('span').textContent=`${missing} Rechnung(en) ohne gültiges ${basis.value==='service'?'Leistungsdatum':'Rechnungsdatum'}.`;
    byId('invoiceUndated').textContent=onlyUndated?'Zurück zum Zeitraum':'Ohne Datum anzeigen';
    byId('invoiceFilterSummary').textContent=onlyUndated?'Nur Rechnungen ohne Datum':!validRange()?'Bitte einen gültigen Zeitraum wählen: Von darf nicht nach Bis liegen.':`${basis.value==='service'?'Leistungszeitraum überschneidet':'Rechnungsdatum'}: ${from.value?dateLabel(from.value):'Anfang offen'} bis ${to.value?dateLabel(to.value):'Ende offen'}${yearChoice==='all'?' · alle Jahre':''}`;
    const matches=searched.filter(matchesDate);
    const counts = { all: matches.length, draft: 0, open: 0, paid: 0, cancelled: 0 };
    for (const entry of matches) {
      if (Object.hasOwn(counts, entry.status) && entry.status !== 'all') counts[entry.status]++;
    }
    for (const button of filters.querySelectorAll('[data-invoice-status]')) {
      const status = button.dataset.invoiceStatus;
      button.setAttribute('aria-pressed', String(status === statusFilter));
      button.querySelector('[data-count]').textContent = counts[status];
    }
    create.hidden = !DSBilling.team();

    const direction = sort.value === 'oldest' ? 1 : -1;
    const entries=(statusFilter==='all'?matches:matches.filter(e=>e.status===statusFilter)).sort((a,b)=>{
      if(sort.value==='customer')return numbers.compare(a.recipient.name||'',b.recipient.name||'')||numbers.compare(a.invoice.invoiceNumber||'',b.invoice.invoiceNumber||'');
      if(sort.value.startsWith('amount'))return Number(a.amount===null)-Number(b.amount===null)||(sort.value==='amountAsc'?1:-1)*((a.amount??0)-(b.amount??0))||numbers.compare(a.invoice.invoiceNumber||'',b.invoice.invoiceNumber||'');
      const ad=periodFor(a)[0],bd=periodFor(b)[0];
      return Number(!ad)-Number(!bd)||direction*(ad.localeCompare(bd)||numbers.compare(a.invoice.invoiceNumber||'',b.invoice.invoiceNumber||''));
    });
    byId('invoiceResultCount').textContent=`${Math.min(visibleLimit,entries.length)} von ${entries.length} Rechnung(en)`;
    const openTotal=byId('invoiceOpenTotal');openTotal.hidden=!entries.length;
    const totals={};for(const e of entries){if(e.amount!==null)totals[e.status]=(totals[e.status]||0)+e.amount;}
    const labels={open:'Offen',paid:'Bezahlt',draft:'Entwürfe',cancelled:'Stornierter Belegwert'};
    openTotal.textContent=Object.entries(totals).map(([k,v])=>`${labels[k]||k}: ${money.format(v/100)}`).join(' · ')+(entries.some(e=>e.amount===null)?' · Beträge teilweise unbekannt':'');
    byId('invoiceMore').hidden=entries.length<=visibleLimit;
    byId('invoiceColumns').hidden = !entries.length;
    const scrolled = list.scrollTop;
    const focusId = document.activeElement?.dataset.invoiceId;
    let group='';
    list.innerHTML=entries.length?entries.slice(0,visibleLimit).map(entry=>{
      let heading='';
      if(['newest','oldest'].includes(sort.value)){
        const [start,end]=periodFor(entry),date=basis.value==='service'&&from.value&&start&&end>=from.value&&start<from.value?from.value:start;
        const key=date?date.slice(0,7):'undated';
        if(key!==group){group=key;const label=date?new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')):'Ohne Datum';heading=`<h3 class="invoice-month">${escapeHtml(label)}</h3>`;}
      }
      return heading+renderRow(entry);
    }).join(''):'<p class="invoice-empty muted">Keine passenden Rechnungen.</p>';
    list.scrollTop = scrolled;
    rowFor(focusId)?.focus({ preventScroll: true });
    refreshShares();
  }

  function rowFor(id) {
    return id ? list.querySelector(`[data-invoice-id="${CSS.escape(id)}"]`) : null;
  }

  function updateSelection() {
    list.querySelector('[aria-current]')?.removeAttribute('aria-current');
    rowFor(selectedId)?.setAttribute('aria-current', 'true');
  }

  function alignDetailBar() {
    workspace.style.setProperty('--invoice-topbar-height', `${topbar.offsetHeight}px`);
  }

  function openDetail(id = null) {
    const changed = detail.hidden || id !== selectedId;
    if (detail.hidden) listPosition = { page: window.scrollY, list: list.scrollTop, opener: document.activeElement };
    selectedId = id;
    detail.hidden = false;
    workspace.classList.add('has-detail');
    updateSelection();
    if (changed && active()) {
      alignDetailBar();
      back.focus({ preventScroll: true });
      const top = detail.getBoundingClientRect().top + window.scrollY - topbar.offsetHeight - 4;
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
      const row = rowFor(id);
      if (row && list.clientHeight && list.clientHeight < list.scrollHeight) {
        const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top;
        if (top < 0 || top + row.offsetHeight > list.clientHeight) list.scrollTop += top;
      }
    }
  }

  function closeDetail(restore = true) {
    const id = selectedId;
    const position = listPosition;
    selectedId = listPosition = null;
    view.replaceChildren();
    detail.hidden = true;
    workspace.classList.remove('has-detail');
    updateSelection();
    if (restore && position && active()) {
      list.scrollTop = position.list;
      window.scrollTo({ top: position.page, behavior: 'instant' });
      const target = position.opener?.isConnected && position.opener.closest('.invoice-index')
        ? position.opener : rowFor(id) || list;
      target.focus({ preventScroll: true });
    }
  }

  function changeFilter() {
    visibleLimit=50;
    list.scrollTop = 0;
    render();
    if (selectedId && !rowFor(selectedId)) closeDetail(false);
  }

  function clearShares() {
    shareOwner = '';
    shareRequest = null;
    shares.clear();
    shareError = false;
  }

  function shareAccount() {
    const owner = DSBilling.admin() ? uid() : '';
    if (owner !== shareOwner) {
      clearShares();
      shareOwner = owner;
    }
    return owner;
  }

  function paintShares() {
    const cells = [...list.querySelectorAll('[data-invoice-share]')];
    for (const cell of cells) {
      const entry = shares.get(cell.dataset.invoiceShare);
      cell.hidden = !entry;
      cell.textContent = entry?.sharedAt ? `Im Chat bereitgestellt am ${dateLabel(DSAnalytics.date(entry.sharedAt))}` : 'Noch nicht im Chat';
    }
    const notice = byId('invoiceShareNotice');
    notice.hidden = !shareError || !cells.length;
    notice.textContent = notice.hidden ? '' : 'Der Chat-Freigabestatus konnte gerade nicht geladen werden.';
    return cells;
  }

  async function refreshShares() {
    const owner = shareAccount();
    const cells = paintShares();
    if (!owner || !active() || shareRequest || shareError || !navigator.onLine) return;
    const stale = Date.now() - 60000;
    const ids = cells.map(cell => cell.dataset.invoiceShare).filter(id => {
      const entry = shares.get(id);
      return !entry?.sharedAt && (!entry || entry.checkedAt < stale);
    }).slice(0, 50);
    if (!ids.length) return;

    const request = Symbol();
    shareRequest = request;
    try {
      const statuses = await DSPortalActions.invoiceShareStatuses(ids);
      if (shareAccount() !== owner || shareRequest !== request) return;
      const returned = new Map(statuses.map(row => [row.id, row.sharedAt]));
      const checkedAt = Date.now();
      for (const id of ids) {
        if (!shares.get(id)?.sharedAt) shares.set(id, { sharedAt: returned.get(id) || null, checkedAt });
      }
    } catch (_) {
      if (shareRequest === request) shareError = true;
    } finally {
      if (shareRequest === request) {
        shareRequest = null;
        refreshShares();
      }
    }
  }

  function enter() {
    shareError = false;
    render();
  }

  function clearPayment() {
    pendingPayment = null;
    if (paymentDialog.open) paymentDialog.close();
  }

  function leave() {
    if (!detail.hidden) closeDetail(false);
    clearPayment();
  }

  function openPayment(id) {
    const invoice = getInvoiceById(id);
    if (!invoice || !DSBilling.editable(invoice)) return;
    pendingPayment = { id, owner: uid(), record: JSON.stringify(invoice) };
    paymentInput.value = toISODateLocal(new Date());
    const recipient = resolveInvoiceRecipient(invoice);
    const total = amountInCents(invoice);
    byId('invoicePaymentReference').textContent = [invoice.invoiceNumber, recipient.name, total === null ? '' : money.format(total / 100)].filter(Boolean).join(' · ');
    paymentError.textContent = '';
    paymentError.hidden = true;
    paymentDialog.showModal();
    paymentInput.focus();
  }

  const detailActions = {
    edit: id => DSBilling.openEdit(id),
    open: id => setInvoiceStatus(id, 'open'),
    draft: id => setInvoiceStatus(id, 'draft'),
    paid: openPayment,
    cancelled: id => setInvoiceStatus(id, 'cancelled'),
    source: id => openInvoiceSourceStay(id),
    recalculate: id => refreshInvoiceFromStay(id),
    history: id => toggleInvoiceAudit(id),
    pdf: id => printInvoice(id)
  };

  function reset() {
    leave();
    clearShares();
    statusFilter = 'all';
    chooseYear(currentYear());basis.value='invoice';visibleLimit=50;
    search.value = '';
    sort.value = 'newest';
    list.replaceChildren();
    for (const button of filters.querySelectorAll('[data-invoice-status]')) {
      button.setAttribute('aria-pressed', String(button.dataset.invoiceStatus === 'all'));
      button.querySelector('[data-count]').textContent = '';
    }
    byId('invoiceResultCount').textContent = '';
    byId('invoiceOpenTotal').hidden = byId('invoiceColumns').hidden = byId('invoiceShareNotice').hidden = true;
  }

  list.addEventListener('click', event => {
    const row = event.target.closest('[data-invoice-id]');
    if (row) openInvoice(row.dataset.invoiceId);
  });
  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-invoice-status]');
    if (!button) return;
    statusFilter = button.dataset.invoiceStatus;
    changeFilter();
  });
  year.addEventListener('change',()=>{chooseYear(year.value);changeFilter();});
  basis.addEventListener('change',()=>{onlyUndated=false;changeFilter();});
  for(const field of [from,to])field.addEventListener('change',()=>{yearChoice='custom';onlyUndated=false;changeFilter();});
  byId('invoiceUndated').onclick=()=>{onlyUndated=!onlyUndated;changeFilter();};
  byId('invoiceMore').onclick=()=>{visibleLimit+=50;render();};
  byId('invoiceReset').onclick=()=>{statusFilter='all';search.value='';sort.value='newest';basis.value='invoice';chooseYear(currentYear());changeFilter();};
  byId('invoiceAllOpen').onclick=()=>{statusFilter='open';search.value='';chooseYear('all');changeFilter();};
  byId('invoicePresets').addEventListener('click',event=>{
    const type=event.target.closest('[data-period]')?.dataset.period;if(!type)return;
    const [y,m]=todayISO().split('-').map(Number);let start,end;
    if(type==='year'||type==='previousYear'){const target=y-(type==='previousYear'?1:0);chooseYear(String(target));}
    else{const month=m-(type==='previousMonth'?1:0);start=new Date(Date.UTC(y,month-1,1));end=new Date(Date.UTC(y,month,0));yearChoice='custom';onlyUndated=false;from.value=start.toISOString().slice(0,10);to.value=end.toISOString().slice(0,10);}
    changeFilter();
  });
  search.addEventListener('input', changeFilter);
  sort.addEventListener('change', changeFilter);
  create.addEventListener('click', () => openFreeInvoiceForm());
  back.addEventListener('click', () => closeDetail());
  view.addEventListener('click', event => {
    const button = event.target.closest('[data-invoice-action]');
    if (button && selectedId) detailActions[button.dataset.invoiceAction]?.(selectedId);
  });

  paymentForm.querySelector('[data-cancel]').addEventListener('click', clearPayment);
  paymentDialog.addEventListener('close', () => { if (!paymentDialog.open) pendingPayment = null; });
  paymentForm.addEventListener('submit', event => {
    event.preventDefault();
    const date = DSWorkflowCore.dateISO(paymentInput.value);
    const payment = pendingPayment;
    if (payment && payment.owner === uid() && DSBilling.admin() && JSON.stringify(getInvoiceById(payment.id)) === payment.record) {
      try {
        if (date && setInvoiceStatus(payment.id, 'paid', { paymentDate: date })) return clearPayment();
        paymentError.textContent = 'Bitte gib ein gültiges Zahlungsdatum ein.';
      } catch (error) {
        paymentError.textContent = error.message || 'Die Zahlung konnte gerade nicht gespeichert werden.';
      }
    } else {
      paymentError.textContent = 'Die Rechnung wurde inzwischen geändert. Bitte erneut öffnen und prüfen.';
    }
    paymentError.hidden = false;
  });

  window.addEventListener('ds-invoice-shared', event => {
    const { id, sharedAt, owner } = event.detail;
    if (owner !== shareAccount() || !sharedAt) return;
    shares.set(id, { sharedAt, checkedAt: Date.now() });
    paintShares();
  });
  function refreshWhenActive() {
    if (!active()) return;
    shareError = false;
    refreshShares();
  }
  window.addEventListener('focus', refreshWhenActive);
  window.addEventListener('online', refreshWhenActive);
  new ResizeObserver(alignDetailBar).observe(topbar);

  window.DSInvoiceWorkspace = { render, enter, leave, openDetail, reset };
})();
