(function () {
  'use strict';

  const Core = window.DSAnalytics;
  const byId = id => document.getElementById(id);
  const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const decimal = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
  const monthFormat = new Intl.DateTimeFormat('de-DE', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const showDate = day => day ? day.split('-').reverse().join('.') : '–';
  const showMonth = month => monthFormat.format(new Date(month + '-01T12:00:00Z'));
  const showMoney = value => value === null ? '–' : currency.format(value / 100);
  const showPercent = value => decimal.format(Core.percent(value)) + ' %';
  const num = (count, single, many) => `${count} ${count === 1 ? single : many}`;

  let handlers;
  let current;
  let receiptMonth = '';
  let wired = false;
  let pending = 0;

  function el(tag, value, css) {
    const item = document.createElement(tag);
    if (value != null) item.textContent = value;
    if (css) item.className = css;
    return item;
  }

  function link(label, action) {
    const control = el('button', label, 'analytics-link');
    control.type = 'button';
    control.addEventListener('click', action);
    return control;
  }

  function row(...fields) {
    const result = el('tr');
    for (const [value, numeric] of fields) {
      const cell = el('td', null, numeric ? 'ana-number' : '');
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value;
      result.append(cell);
    }
    return result;
  }

  function table(id, rows, empty, columnCount) {
    const body = byId(id);
    body.replaceChildren();
    if (rows.length) {
      const fragment = document.createDocumentFragment();
      rows.forEach(item => fragment.append(item));
      body.append(fragment);
    } else {
      const cell = el('td', empty, 'muted');
      cell.colSpan = columnCount;
      const tr = el('tr');
      tr.append(cell);
      body.append(tr);
    }
  }

  function scrollToHeading(id) {
    const target = byId(id);
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
  }

  function selectReceipts(kind = '', month = '', query = '') {
    if (!current) return;
    byId('anaReceiptKind').value = kind;
    byId('anaReceiptSearch').value = query;
    receiptMonth = current.months.length > 1 ? month : '';
    renderReceipts();
    scrollToHeading('anaReceiptsHeading');
  }

  function selection() {
    return {
      kind: byId('anaReceiptKind').value, month: receiptMonth, query: byId('anaReceiptSearch').value
    };
  }

  function renderReceipts() {
    if (!current) return;
    const selected = selection();
    const list = Core.selectEntries(current, selected);
    const clear = byId('anaClearMonth');
    clear.hidden = !receiptMonth;
    clear.textContent = receiptMonth ? showMonth(receiptMonth) + ' · Alle Monate anzeigen' : '';
    byId('anaReceiptCount').textContent = selected.kind === 'undated'
      ? num(list.length, 'Vorgang ohne zuordenbares Datum', 'Vorgänge ohne zuordenbares Datum')
      : num(list.length, 'Vorgang im Zeitraum', 'Vorgänge im Zeitraum');
    table('anaReceiptRows', list.map(entry => {
      const reference = entry.number || 'Rechnung öffnen';
      const invoice = el('div');
      invoice.append(entry.id ? link(reference, () => handlers.openInvoice(entry.id)) : el('span', entry.number || '–'));
      if (entry.invoiceDate) invoice.append(el('small', 'Rechnung vom ' + showDate(entry.invoiceDate)));
      const party = el('div', entry.customer || '–');
      if (entry.customerNumber || entry.dog) party.append(el('small', [entry.customerNumber, entry.dog].filter(Boolean).join(' · ')));
      const activity = el('div', Core.labels[entry.kind]);
      activity.append(el('small', entry.day ? showDate(entry.day) : 'Datum fehlt'));
      if (entry.kind === 'paid' && entry.status === 'cancelled') activity.append(el('small', 'Beleg später storniert'));
      if (entry.kind === 'cancelled' && entry.reason) activity.append(el('small', entry.reason));
      return row([invoice], [party], [activity], [showMoney(entry.gross), true],
        [showMoney(entry.vat), true], [showMoney(entry.net), true]);
    }), 'Keine passenden Belege.', 6);
  }

  function renderMetrics(result) {
    const { paid, open, cancelled } = result.totals;
    const money = (bucket, key) => showMoney(Core.totalValue(bucket, key));
    const set = (id, value) => { byId(id).textContent = value; };
    set('anaPaidGross', money(paid, 'gross'));
    set('anaPaidCount', num(paid.count, 'Zahlung', 'Zahlungen') + ' · Brutto');
    set('anaPaidTax', `${money(paid, 'net')} netto · ${money(paid, 'vat')} MwSt.`);
    set('anaOpenGross', money(open, 'gross'));
    set('anaOpenCount', num(open.count, 'offener Beleg', 'offene Belege') + ' · Brutto');
    set('anaCancelled', money(cancelled, 'gross'));
    set('anaCancelledCount', num(cancelled.count, 'Storno', 'Stornos') + ' · Belegwert');
    set('anaOccupancyPct', showPercent(result.occupancy));
    set('anaOccupancyDays', `${result.occupancy.occupied} / ${result.occupancy.capacity} Hundetage`);
    set('anaOverCount', num(result.occupancy.over, 'Tag über Kapazität', 'Tage über Kapazität'));
    const amountNotice = byId('anaAmountNotice');
    const incomplete = result.entries.filter(entry => entry.gross === null || (entry.kind === 'paid' && entry.vat === null)).length;
    amountNotice.hidden = incomplete === 0;
    amountNotice.textContent = incomplete
      ? `Bei ${num(incomplete, 'Vorgang', 'Vorgängen')} fehlen Beträge oder Steuerangaben. Betroffene Summen sind mit einem Strich markiert.` : '';
    const missingDates = byId('anaUndatedBtn');
    missingDates.hidden = !result.undated.length;
    missingDates.textContent = num(result.undated.length, 'Vorgang ohne Datum', 'Vorgänge ohne Datum') + ' anzeigen';
    byId('anaNotice').hidden = !incomplete && !result.undated.length;

    let maxPayment = 0;
    for (const month of result.months) maxPayment = Math.max(maxPayment, Core.totalValue(month.finance.paid, 'gross') || 0);
    function monthlyMoney(month, kind) {
      const totals = month.finance[kind];
      if (!totals.count) return money(totals, 'gross');
      const label = el('span', money(totals, 'gross'));
      label.append(el('small', num(totals.count, kind === 'paid' ? 'Zahlung' : 'Beleg', kind === 'paid' ? 'Zahlungen' : 'Belege')));
      const value = Core.totalValue(totals, 'gross');
      if (kind === 'paid' && value > 0 && maxPayment > 0 && result.months.length > 1) {
        const track = el('span', null, 'analytics-bar');
        const fill = el('span');
        track.setAttribute('aria-hidden', 'true');
        fill.style.width = (value / maxPayment * 100) + '%';
        track.append(fill);
        label.append(track);
      }
      const button = link(null, () => selectReceipts(kind, month.key));
      button.append(label);
      return button;
    }
    table('anaTbody', result.months.map(month => row(
      [showMonth(month.key)],
      [monthlyMoney(month, 'paid'), true],
      [money(month.finance.paid, 'vat'), true],
      [money(month.finance.paid, 'net'), true],
      [monthlyMoney(month, 'open'), true],
      [monthlyMoney(month, 'cancelled'), true]
    )), '', 6);
  }

  function renderDetails(result) {
    table('anaServiceRows', result.services.map(service => row([service.label], [showMoney(service.gross), true])),
      'Keine bezahlten Positionen im Zeitraum.', 2);
    const use = result.occupancy;
    byId('anaOccupancyExplanation').textContent =
      `${use.occupied} von ${use.capacity} möglichen Hundetagen. An- und Abreisetage zählen.`;
    table('anaOccupancyRows', result.months.map(({ key, occupancy }) => row([showMonth(key)], [occupancy.boarding, true],
      [occupancy.daycare, true], [`${occupancy.occupied} / ${occupancy.capacity}`, true], [showPercent(occupancy), true])),
      '', 5);
    const overDays = byId('anaOverDays');
    overDays.hidden = !use.overDays.length;
    overDays.replaceChildren();
    if (use.overDays.length) {
      const details = el('details');
      details.append(el('summary', num(use.overDays.length, 'Tag über Kapazität', 'Tage über Kapazität')));
      const list = el('div', null, 'analytics-day-links');
      for (const info of use.overDays) {
        const button = link(showDate(info.day), () => handlers.openDay(info.day));
        button.title = `Gesamt ${info.total}/${info.totalCapacity} · Urlaub ${info.boarding}/${info.boardingCapacity} · Tagesbetreuung ${info.daycare}/${info.daycareCapacity}`;
        list.append(button);
      }
      details.append(list);
      overDays.append(details);
    }
    table('anaCustomers', result.customers.map(info => {
      const name = info.number ? link(info.label, () => selectReceipts('paid', '', info.number)) : el('span', info.label);
      if (info.number) name.append(el('small', info.number));
      return row([name], [showMoney(info.gross), true], [info.count, true]);
    }), 'Keine bezahlten Belege mit Kundenzuordnung.', 3);
    table('anaDogs', result.dogs.map(info => {
      const name = el('div', info.label);
      if (info.customer) name.append(el('small', info.customer));
      return row([name], [showMoney(info.gross), true], [info.count, true]);
    }), 'Keine bezahlten Belege mit Hundezuteilung.', 3);
    table('anaReasons', result.reasons.map(info => row([info.label], [info.count, true])),
      'Keine Stornos im Zeitraum.', 2);
  }

  function render() {
    if (!handlers || !byId('analytics').classList.contains('is-active')) return null;
    const from = byId('anaFrom').value;
    const to = byId('anaTo').value;
    current = handlers.allowed() ? Core.report(handlers.workspace(), { from, to }, handlers.legacyLines) : null;
    byId('anaExportBtn').disabled = !current;
    byId('anaReport').hidden = !current;
    for (const btn of document.querySelectorAll('[data-ana-preset]')) {
      const expected = Core.datesFor(btn.dataset.anaPreset);
      btn.setAttribute('aria-pressed', String(from === expected.from && to === expected.to));
    }
    const feedback = byId('anaRangeHint');
    if (!current) {
      feedback.textContent = handlers.allowed() ? 'Bitte einen Zeitraum mit passendem Start- und Enddatum wählen.' : 'Die Auswertungen sind für das Workspace-Team verfügbar.';
      return null;
    }
    if (!current.months.some(month => month.key === receiptMonth)) receiptMonth = '';
    feedback.textContent = `${showDate(current.from)} bis ${showDate(current.to)} · Zahlungen nach Zahlungsdatum`;
    renderMetrics(current);
    renderReceipts();
    renderDetails(current);
    return current;
  }

  function setRange(range) {
    byId('anaFrom').value = range.from;
    byId('anaTo').value = range.to;
    receiptMonth = '';
    render();
  }

  function schedule() {
    if (!handlers || pending || !byId('analytics')?.classList.contains('is-active')) return;
    pending = requestAnimationFrame(() => { pending = 0; render(); });
  }

  function exportCsv() {
    const report = render();
    if (!report) return;
    const mode = byId('anaExportMode').value;
    const suffix = { all: '', months: '_Monate', invoices: '_Belege', services: '_Leistungen',
      occupancy: '_Belegung', customers: '_Kunden', dogs: '_Hunde' }[mode] || '';
    const download = el('a');
    download.download = `DoggyStyle_Auswertungen_${report.from}_bis_${report.to}${suffix}.csv`;
    const url = URL.createObjectURL(new Blob([Core.csv(report, mode, selection())], { type: 'text/csv;charset=utf-8' }));
    download.href = url;
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function wire() {
    if (wired) return;
    wired = true;
    for (const button of document.querySelectorAll('[data-ana-preset]')) {
      button.addEventListener('click', () => setRange(Core.datesFor(button.dataset.anaPreset)));
    }
    for (const id of ['anaFrom', 'anaTo']) {
      const change = () => { receiptMonth = ''; schedule(); };
      byId(id).addEventListener('input', change);
      byId(id).addEventListener('change', change);
    }
    for (const button of document.querySelectorAll('[data-ana-kind]')) {
      button.addEventListener('click', () => selectReceipts(button.dataset.anaKind));
    }
    byId('anaGoOccupancy').addEventListener('click', () => scrollToHeading('anaOccupancyHeading'));
    byId('anaReceiptKind').addEventListener('change', () => {
      if (byId('anaReceiptKind').value === 'undated') receiptMonth = '';
      renderReceipts();
    });
    byId('anaReceiptSearch').addEventListener('input', renderReceipts);
    byId('anaClearMonth').addEventListener('click', () => { receiptMonth = ''; renderReceipts(); });
    byId('anaExportBtn').addEventListener('click', exportCsv);
  }

  function show(options) {
    const opening = !handlers;
    handlers = options;
    wire();
    if (opening) setRange(Core.datesFor('current'));
    else render();
  }

  function reset() {
    if (!handlers) return;
    handlers = null;
    current = null;
    receiptMonth = '';
    byId('anaReceiptKind').value = '';
    byId('anaReceiptSearch').value = '';
    byId('anaReport').hidden = true;
    byId('anaExportBtn').disabled = true;
    byId('anaRangeHint').textContent = '';
  }

  window.DSAnalyticsView = { show, schedule, reset };
})();
