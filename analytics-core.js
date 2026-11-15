(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./workflow-core'));
  else root.DSAnalytics = factory(root.DSWorkflowCore);
})(globalThis, function (Workflow) {
  'use strict';

  const DAY = 86400000;
  const dateInBerlin = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const kinds = ['paid', 'open', 'cancelled'];
  const labels = {
    paid: 'Zahlungseingang', open: 'Offene Rechnung', cancelled: 'Storno'
  };
  const statusLabels = { paid: 'Bezahlt', open: 'Offen', cancelled: 'Storniert' };
  const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const statuses = new Map([
    ['paid', 'paid'], ['bezahlt', 'paid'], ['open', 'open'], ['offen', 'open'],
    ['cancelled', 'cancelled'], ['canceled', 'cancelled'], ['storniert', 'cancelled'], ['storno', 'cancelled'],
    ['draft', 'draft'], ['entwurf', 'draft']
  ]);
  const status = value => statuses.get(text(value).toLowerCase()) || '';

  function date(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
      const raw = value.trim();
      const plain = Workflow.dateISO(raw);
      if (plain) return plain;
      const german = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(raw);
      if (german) {
        const [, day, month, year] = german;
        return Workflow.dateISO([year.length === 2 ? '20' + year : year, month.padStart(2, '0'), day.padStart(2, '0')].join('-'));
      }
      const isoTime = /^(\d{4}-\d{2}-\d{2})[T ](?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(raw);
      if (!isoTime || !Workflow.dateISO(isoTime[1])) return '';
      if (!isoTime[2]) return isoTime[1];
      value = Date.parse(raw.replace(' ', 'T'));
    } else if (value instanceof Date) {
      value = value.getTime();
    } else if (typeof value === 'object') {
      const seconds = value.seconds ?? value._seconds;
      value = typeof value.toMillis === 'function' ? value.toMillis() : (typeof seconds === 'number' ? seconds * 1000 : NaN);
    }
    if (typeof value !== 'number' || !Number.isFinite(new Date(value).getTime()) || value === 0) return '';
    const parts = Object.fromEntries(dateInBerlin.formatToParts(value).map(part => [part.type, part.value]));
    return Workflow.dateISO(`${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`);
  }

  const dayTime = day => Date.parse(day + 'T00:00:00Z');
  const dayString = time => new Date(time).toISOString().slice(0, 10);
  function monthStart(day, offset = 0) {
    const first = new Date(dayTime(day.slice(0, 7) + '-01'));
    first.setUTCMonth(first.getUTCMonth() + offset);
    return dayString(first);
  }

  function datesFor(preset, now = new Date()) {
    const today = date(now);
    if (preset === 'year') return { from: today.slice(0, 4) + '-01-01', to: today.slice(0, 4) + '-12-31' };
    const offset = preset === 'previous' ? -1 : 0;
    return { from: monthStart(today, offset), to: dayString(dayTime(monthStart(today, offset + 1)) - DAY) };
  }

  function firstDate(...values) {
    for (const value of values) {
      const day = date(value);
      if (day) return day;
    }
    return '';
  }

  function changes(invoice, kind) {
    const trail = Array.isArray(invoice.auditTrail) ? invoice.auditTrail : [];
    const olderTrail = Array.isArray(invoice.audit) ? invoice.audit : [];
    const days = [
      ...trail.filter(change => change?.field === 'status' && status(change.to) === kind),
      ...olderTrail.filter(change => kind === 'cancelled' && change?.action === 'cancel')
    ].map(change => firstDate(change.at, change.date)).filter(Boolean);
    return days.sort().at(-1) || '';
  }

  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !/^-?\d+(?:[.,]\d+)?$/.test(value.trim())) return null;
    const result = Number(value.replace(',', '.'));
    return Number.isFinite(result) ? result : null;
  }

  function cents(value) {
    const amount = number(value);
    if (amount === null) return null;
    const scaled = amount * 100;
    const rounded = Math.round(scaled + Math.abs(scaled) * Number.EPSILON);
    return Number.isSafeInteger(rounded) ? rounded : null;
  }

  function firstCents(...values) {
    for (const value of values) {
      const amount = cents(value);
      if (amount !== null) return amount;
    }
    return null;
  }

  function parseLines(lines) {
    if (!Array.isArray(lines)) return [];
    return lines.flatMap(line => {
      if (!line || typeof line !== 'object') return [];
      const quantity = number(line.qty ?? line.quantity);
      const unit = number(line.unit ?? line.unitPrice);
      const gross = firstCents(
        line.total, line.totalGross, line.gross, line.value, line.valueGross, line.amount, line.amountGross,
        quantity !== null && unit !== null ? quantity * unit : null
      );
      return gross === null ? [] : [{ label: text(line.label || line.name || line.title || line.description) || 'Rechnungsposition', gross }];
    });
  }

  function amounts(invoice, pricing, lines) {
    let gross = firstCents(pricing.totalGross, pricing.grandTotalGross, pricing.total, invoice.totalGross, invoice.total, invoice.amount);
    const net = firstCents(pricing.net, pricing.totalNet, invoice.net, invoice.totalNet);
    const vat = firstCents(pricing.vatAmount, pricing.taxAmount, invoice.vatAmount);
    const rate = number(invoice.vatRate ?? pricing.vatRate);
    if (gross === null) {
      if (net !== null && vat !== null) gross = net + vat;
      else if (lines.length) gross = lines.reduce((sum, line) => sum + line.gross, 0);
    }
    if (gross === null) return { gross, net: null, vat: null };
    if (rate === 0) return { gross, net: gross, vat: 0 };
    if (vat !== null && (vat === 0 || Math.sign(vat) === Math.sign(gross)) && Math.abs(vat) <= Math.abs(gross)) {
      return { gross, net: gross - vat, vat };
    }
    if (net !== null && (net === 0 || Math.sign(net) === Math.sign(gross)) && Math.abs(net) <= Math.abs(gross)) {
      return { gross, net, vat: gross - net };
    }
    if (gross === 0) return { gross, net: 0, vat: 0 };
    if (rate !== null && rate > 0) {
      const calculated = cents((gross / 100) / (1 + rate / 100));
      return { gross, net: calculated, vat: gross - calculated };
    }
    return { gross, net: null, vat: null };
  }

  function invoiceDates(invoice, currentStatus) {
    const invoiceDate = firstDate(invoice.invoiceDate, invoice.dateISO, invoice.date, invoice.createdAt);
    const paidDate = firstDate(invoice.paymentDate, invoice.paidAt, invoice.paidDate) || changes(invoice, 'paid');
    const cancelledDate = currentStatus === 'cancelled'
      ? (firstDate(invoice.cancelledAt, invoice.canceledAt) || changes(invoice, 'cancelled')) : '';
    return { invoiceDate, paidDate, cancelledDate };
  }

  function reasonFor(invoice, currentStatus) {
    if (currentStatus !== 'cancelled') return '';
    const reason = text(invoice.cancelReason || invoice.stornoReason || invoice.reason);
    if (reason) return reason;
    const trail = Array.isArray(invoice.auditTrail) ? invoice.auditTrail : [];
    const legacy = Array.isArray(invoice.audit) ? invoice.audit : [];
    const change = trail.slice().reverse().find(event => event?.field === 'status' && status(event.to) === 'cancelled');
    const older = legacy.slice().reverse().find(event => event?.action === 'cancel');
    return text(change?.meta?.reason || older?.reason);
  }

  function relatedNames(invoice, workspace, directory) {
    const manual = invoice.manualRecipient;
    const snapshot = invoice.recipientSnapshot;
    const dog = directory.dogs.get(invoice.dogId);
    const petId = invoice.petId || workspace._legacy?.dogIdToPetId?.[invoice.dogId] || '';
    const pet = directory.pets.get(petId);
    const ownerId = workspace._legacy?.dogIdToCustomerId?.[invoice.dogId] || dog?.customerId;
    const customerId = manual ? '' : (invoice.customerId || pet?.customerId || ownerId || '');
    const customer = directory.customers.get(customerId);
    const relatedDog = customerId && ownerId && ownerId !== customerId ? null : dog;
    return {
      customerId,
      petId: manual ? '' : (petId || relatedDog?.id || ''),
      customerNumber: manual ? '' : text(snapshot?.customerNumber || customer?.customerNumber || invoice.customerNumber),
      customer: text(snapshot?.name || manual?.name || customer?.name || customer?.fullName || relatedDog?.owner ||
        invoice.customerName || invoice.customer?.name || invoice.customer),
      dog: manual ? '' : text(pet?.name || relatedDog?.name || invoice.dogName || invoice.hundName || invoice.dog?.name || invoice.dog)
    };
  }

  function total() {
    return { count: 0, gross: 0, net: 0, vat: 0, missingGross: 0, missingTax: 0 };
  }

  const finance = () => ({ paid: total(), open: total(), cancelled: total() });
  const emptyOccupancy = () => ({ days: 0, capacity: 0, occupied: 0, boarding: 0, daycare: 0, over: 0 });

  function addMoney(bucket, { gross, net, vat }) {
    bucket.count++;
    if (gross === null) bucket.missingGross++;
    else bucket.gross += gross;
    if (net === null || vat === null) bucket.missingTax++;
    else {
      bucket.net += net;
      bucket.vat += vat;
    }
  }

  function totalValue(bucket, field) {
    return bucket[field === 'gross' ? 'missingGross' : 'missingTax'] ? null : bucket[field];
  }

  function collectOccupancy(workspace, months, range) {
    const result = emptyOccupancy();
    const overDays = [];
    const stays = Workflow.confirmedStays(workspace)
      .filter(stay => stay.from <= range.to && stay.to >= range.from)
      .sort((a, b) => a.from.localeCompare(b.from));
    const active = new Set();
    let next = 0;
    for (let time = dayTime(range.from), end = dayTime(range.to); time <= end; time += DAY) {
      const day = dayString(time);
      while (next < stays.length && stays[next].from <= day) active.add(stays[next++]);
      for (const stay of active) if (stay.to < day) active.delete(stay);
      const use = Workflow.occupancyFromStays(workspace, day, Workflow.staysOnDay(active, day));
      const over = Workflow.exceedsCapacity(use);
      if (over) overDays.push(use);
      const monthly = months.get(day.slice(0, 7)).occupancy;
      for (const bucket of [result, monthly]) {
        bucket.days++;
        bucket.capacity += use.totalCapacity;
        bucket.occupied += use.total;
        bucket.boarding += use.boarding;
        bucket.daycare += use.daycare;
        if (over) bucket.over++;
      }
    }
    return { ...result, overDays };
  }

  function percent(occupancy) {
    return occupancy.capacity ? Math.round(occupancy.occupied * 1000 / occupancy.capacity) / 10 : 0;
  }

  function increment(map, key, info, gross) {
    if (!map.has(key)) map.set(key, { ...info, gross: 0, count: 0 });
    const row = map.get(key);
    row.count++;
    row.gross += gross;
  }

  function sorted(map, by = 'gross') {
    return [...map.values()].sort((a, b) => b[by] - a[by] || a.label.localeCompare(b.label, 'de'));
  }

  function report(workspace, range, legacyLines = () => []) {
    const from = Workflow.dateISO(range.from);
    const to = Workflow.dateISO(range.to);
    if (!from || !to || from > to) return null;
    const months = new Map();
    for (let day = monthStart(from); ; day = monthStart(day, 1)) {
      const key = day.slice(0, 7);
      months.set(key, { key, finance: finance(), occupancy: emptyOccupancy() });
      if (key === to.slice(0, 7)) break;
    }
    const totals = finance();
    const entries = [];
    const undated = [];
    const service = new Map(), customers = new Map(), dogs = new Map(), reasons = new Map();
    const directory = Object.fromEntries(['customers', 'pets', 'dogs'].map(key =>
      [key, new Map(Object.values(workspace[key] || {}).filter(item => item?.id).map(item => [item.id, item]))]
    ));
    const ids = new Set();

    for (const invoice of Object.values(workspace.invoices || {})) {
      const currentStatus = status(invoice?.status || invoice?.paymentStatus);
      if (!kinds.includes(currentStatus) || (invoice.id && ids.has(invoice.id))) continue;
      if (invoice.id) ids.add(invoice.id);
      const dates = invoiceDates(invoice, currentStatus);
      const { invoiceDate, paidDate, cancelledDate } = dates;
      const events = [[currentStatus, { paid: paidDate, open: invoiceDate, cancelled: cancelledDate }[currentStatus]]];
      const wasPaid = currentStatus === 'cancelled' && (paidDate ||
        (Array.isArray(invoice.auditTrail) && invoice.auditTrail.some(change => change?.field === 'status' && status(change.from) === 'paid')));
      if (wasPaid) events.push(['paid', paidDate]);
      const visible = events.filter(([, day]) => !day || (day >= from && day <= to));
      if (!visible.length) continue;

      const frozen = currentStatus !== 'open';
      const pricing = (frozen && invoice.pricingSnapshot) || invoice.pricing || {};
      let savedLines = [];
      for (const candidate of [frozen ? invoice.lineItemsSnapshot : null, invoice.lineItems, invoice.items]) {
        savedLines = parseLines(candidate);
        if (savedLines.length) break;
      }
      const rows = savedLines.length ? savedLines : parseLines(legacyLines(invoice, pricing));
      const money = amounts(invoice, pricing, rows);
      const party = relatedNames(invoice, workspace, directory);
      const record = {
        ...dates, ...party, ...money,
        id: text(invoice.id), number: text(invoice.invoiceNumber || invoice.number),
        from: firstDate(invoice.period?.from, invoice.stayFrom, invoice.from),
        to: firstDate(invoice.period?.to, invoice.stayTo, invoice.to),
        reason: reasonFor(invoice, currentStatus),
        status: currentStatus
      };
      for (const [kind, day] of visible) {
        const entry = { ...record, kind, day };
        if (!day) { undated.push(entry); continue; }
        entries.push(entry);
        addMoney(totals[kind], money);
        addMoney(months.get(day.slice(0, 7)).finance[kind], money);
        if (kind === 'cancelled') {
          const label = record.reason || 'Ohne Angabe';
          increment(reasons, label, { label }, money.gross || 0);
        }
        if (kind !== 'paid' || money.gross === null) continue;
        let difference = money.gross;
        for (const row of rows) {
          if (row.gross) increment(service, row.label.toLocaleLowerCase('de'), { label: row.label }, row.gross);
          difference -= row.gross;
        }
        if (difference) {
          const label = rows.length || invoice.sourceDocId
            ? 'Nicht zugeordneter Betrag' : text(invoice.note) || 'Freie Rechnung';
          increment(service, label.toLocaleLowerCase('de'), { label }, difference);
        }
        if (party.customerId && party.customer) increment(customers, party.customerId, { label: party.customer, number: party.customerNumber }, money.gross);
        if (party.petId && party.dog) increment(dogs, party.petId, { label: party.dog, customer: party.customer }, money.gross);
      }
    }
    const occupancy = collectOccupancy(workspace, months, { from, to });
    entries.sort((a, b) => b.day.localeCompare(a.day) || b.number.localeCompare(a.number, 'de'));
    return {
      from, to, totals, months: [...months.values()], entries, undated, occupancy,
      services: sorted(service), customers: sorted(customers).slice(0, 10), dogs: sorted(dogs).slice(0, 10),
      reasons: sorted(reasons, 'count')
    };
  }

  function searchText(value) {
    return value.toLocaleLowerCase('de').normalize('NFD').replace(/\p{M}/gu, '').replaceAll('ß', 'ss');
  }

  function selectEntries(result, { kind = '', month = '', query = '' } = {}) {
    const terms = searchText(query).trim().split(/\s+/).filter(Boolean);
    const source = kind === 'undated' ? result.undated : result.entries;
    return source.filter(entry => {
      if (kind && kind !== 'undated' && entry.kind !== kind) return false;
      if (month && !entry.day.startsWith(month)) return false;
      const haystack = searchText([entry.number, entry.customerNumber, entry.customer, entry.dog].join(' '));
      return terms.every(term => haystack.includes(term));
    });
  }

  function csvCell(value) {
    if (value == null) return '';
    if (typeof value === 'number') return String(value).replace('.', ',');
    let field = String(value);
    if (/^\s*[=+\-@\t\r\n]/.test(field)) field = "'" + field;
    return /[;"\n\r]/.test(field) ? '"' + field.replaceAll('"', '""') + '"' : field;
  }

  function csv(result, mode = 'all', selection = {}) {
    const lines = [['Doggy Style Workspace · Auswertungen'], ['Von', result.from, 'Bis', result.to]];
    if ((mode === 'all' || mode === 'invoices') && (selection.kind || selection.month || selection.query)) {
      const kind = selection.kind === 'undated' ? 'Ohne Datum' : (labels[selection.kind] || 'Alle im Zeitraum');
      lines.push(['Belegauswahl', kind, 'Monat', selection.month, 'Suche', selection.query]);
    }
    function add(title, header, rows) {
      lines.push([], [title], header);
      for (const row of rows) lines.push(row);
    }
    const euros = value => value === null ? null : value / 100;
    const money = (bucket, field) => euros(totalValue(bucket, field));
    if (mode === 'all' || mode === 'months') {
      const columns = ['Zeitraum', 'Zahlungen', 'Zahlungen brutto (EUR)', 'Enthaltene MwSt. (EUR)', 'Zahlungen netto (EUR)',
        'Offene Belege', 'Offen brutto (EUR)', 'Stornos', 'Stornierter Belegwert (EUR)', 'Zahlungen ohne Steuerdaten'];
      const values = (key, { paid, open, cancelled }) => [
        key, paid.count, money(paid, 'gross'), money(paid, 'vat'), money(paid, 'net'),
        open.count, money(open, 'gross'), cancelled.count, money(cancelled, 'gross'), paid.missingTax
      ];
      add('Monatsübersicht', columns, [...result.months.map(month => values(month.key, month.finance)), values('Gesamt', result.totals)]);
    }
    if (mode === 'all' || mode === 'invoices') {
      const listed = selectEntries(result, selection);
      const header = ['Rechnungsnr.', 'Kundennr.', 'Kunde / Empfänger', 'Hund', 'Vorgang', 'Datum für Auswertung', 'Belegstatus',
        'Rechnungsdatum', 'Zahlungsdatum', 'Stornodatum', 'Leistung von', 'Leistung bis',
        'Brutto (EUR)', 'MwSt. (EUR)', 'Netto (EUR)', 'Stornogrund'];
      const row = entry => [
        entry.number, entry.customerNumber, entry.customer, entry.dog, labels[entry.kind], entry.day, statusLabels[entry.status],
        entry.invoiceDate, entry.paidDate, entry.cancelledDate, entry.from, entry.to,
        euros(entry.gross), euros(entry.vat), euros(entry.net), entry.reason
      ];
      add(selection.kind === 'undated' ? 'Belege ohne zuordenbares Datum' : 'Belegliste', header, listed.map(row));
      if (mode === 'all' && selection.kind !== 'undated' && result.undated.length) {
        add('Belege ohne zuordenbares Datum', header, result.undated.map(row));
      }
    }
    if (mode === 'all' || mode === 'services') {
      add('Bezahlte Leistungen', ['Leistung', 'Brutto (EUR)'], result.services.map(row => [row.label, euros(row.gross)]));
    }
    if (mode === 'all' || mode === 'occupancy') {
      const row = (key, use) => [key, use.days, use.boarding, use.daycare, use.occupied, use.capacity, percent(use), use.over];
      add('Bestätigte Belegung', ['Monat', 'Kalendertage', 'Urlaub Hundetage', 'Tagesbetreuung Hundetage',
        'Belegte Hundetage', 'Mögliche Hundetage', 'Auslastung (%)', 'Tage über Kapazität'],
      [...result.months.map(month => row(month.key, month.occupancy)), row('Gesamt', result.occupancy)]);
      if (result.occupancy.overDays.length) {
        add('Tage über Kapazität', ['Datum', 'Hunde', 'Gesamtkapazität', 'Urlaub', 'Urlaub Kapazität', 'Tagesbetreuung', 'Tagesbetreuung Kapazität'],
          result.occupancy.overDays.map(day => [
            day.day, day.total, day.totalCapacity, day.boarding, day.boardingCapacity, day.daycare, day.daycareCapacity
          ]));
      }
    }
    if (mode === 'all' || mode === 'customers') {
      add('Top-Kunden nach Zahlungseingängen', ['Kundennr.', 'Kunde', 'Brutto (EUR)', 'Belege'],
        result.customers.map(row => [row.number, row.label, euros(row.gross), row.count]));
    }
    if (mode === 'all' || mode === 'dogs') {
      add('Top-Hunde nach Zahlungseingängen', ['Hund', 'Kunde', 'Brutto (EUR)', 'Belege'],
        result.dogs.map(row => [row.label, row.customer, euros(row.gross), row.count]));
    }
    if (mode === 'all') add('Stornogründe', ['Grund', 'Anzahl'], result.reasons.map(row => [row.label, row.count]));
    return '\uFEFF' + lines.map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
  }

  return { date, datesFor, report, selectEntries, csv, totalValue, percent, labels, statusLabels };
});
