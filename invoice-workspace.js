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
    const matches = invoices.map(listEntry).filter(({ invoice, recipient, customerNumber, dog }) =>
      matchesWorkspaceSearch(query, invoice.invoiceNumber, recipient.name, recipient.customerNumber, customerNumber, dog));
    const counts = { all: matches.length, draft: 0, open: 0, paid: 0, cancelled: 0 };
    for (const entry of matches) {
      if (Object.hasOwn(counts, entry.status) && entry.status !== 'all') counts[entry.status]++;
    }
    for (const button of filters.querySelectorAll('[data-invoice-status]')) {
      const status = button.dataset.invoiceStatus;
      button.setAttribute('aria-pressed', String(status === statusFilter));
      button.querySelector('[data-count]').textContent = counts[status];
    }
    create.hidden = !DSBilling.admin();

    const direction = sort.value === 'oldest' ? 1 : -1;
    const entries = (statusFilter === 'all' ? matches : matches.filter(entry => entry.status === statusFilter))
      .sort((a, b) => Number(!a.issued) - Number(!b.issued) || direction * (
        a.issued.localeCompare(b.issued) || numbers.compare(a.invoice.invoiceNumber || '', b.invoice.invoiceNumber || '')
      ));
    byId('invoiceResultCount').textContent = entries.length === 1 ? '1 Rechnung' : `${entries.length} Rechnungen`;
    const openTotal = byId('invoiceOpenTotal');
    openTotal.hidden = statusFilter !== 'open';
    if (!openTotal.hidden) {
      const total = entries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
      const missing = entries.filter(entry => entry.amount === null).length;
      openTotal.textContent = `Offene Summe ${money.format(total / 100)}${missing ? ` · ${missing} ohne Betrag` : ''}`;
    }
    byId('invoiceColumns').hidden = !entries.length;
    const scrolled = list.scrollTop;
    const focusId = document.activeElement?.dataset.invoiceId;
    list.innerHTML = entries.length ? entries.map(renderRow).join('') : '<p class="invoice-empty muted">Keine passenden Rechnungen.</p>';
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
