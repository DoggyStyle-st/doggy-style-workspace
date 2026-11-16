(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const user = () => window.firebase?.auth().currentUser;
  const labels = { pending: 'Antwort offen', accepted: 'Zugesagt', declined: 'Passt nicht', canceled: 'Abgesagt' };
  const invoiceLabels = { open: 'Offen', paid: 'Bezahlt', cancelled: 'Storniert · Der Betrag ist nicht mehr fällig.', shared: 'Weitergegeben' };
  let appointmentUnsubscribe;
  let appointments = new Map();
  let loadState = '';
  let customerKey = '';
  let epoch = 0;
  let documentOwned = false;
  const pendingActions = new Set();

  function identity() {
    const auth = user();
    const context = window.DSWorkflow?.context();
    return auth && window.CLOUD?.role === 'customer' && context?.verified && context.uid === auth.uid ? context : null;
  }

  function keyFor(customer) {
    return customer ? JSON.stringify([customer.uid, customer.customerId]) : '';
  }

  async function call(name, action, data) {
    const result = await firebase.app().functions('europe-west1').httpsCallable(name, { timeout: 15000 })({ action, ...data });
    return result.data;
  }

  async function invoiceShareStatuses(ids) {
    const { statuses } = await call('portalInvoice', 'statuses', { ids });
    return statuses;
  }

  function feedback(error) {
    const code = error?.code?.split('/').pop();
    if (['not-found', 'internal', 'unavailable', 'deadline-exceeded'].includes(code)) {
      return 'Die Verbindung zu Firebase konnte nicht bestätigt werden. Bitte erneut versuchen.';
    }
    return error?.message || 'Die Aktion konnte nicht abgeschlossen werden.';
  }

  function dateLabel(entry) {
    const date = entry.date.split('-').reverse().join('.');
    return entry.allDay ? `${date} · Ganztägig` : `${date} · ${entry.startTime}–${entry.endTime} Uhr`;
  }

  function renderAppointments() {
    const list = byId('customerAppointments');
    if (!list) return;
    const accepted = [...appointments.values()].filter(entry => entry.status === 'accepted')
      .sort((a, b) => a.startMs - b.startMs || a.title.localeCompare(b.title, 'de'));
    list.replaceChildren();
    if (!accepted.length) {
      list.textContent = loadState || 'Du hast noch keine bestätigten Termine.';
      return;
    }
    for (const entry of accepted) {
      const row = document.createElement('div');
      row.className = 'item';
      const name = document.createElement('strong');
      name.textContent = entry.title;
      const when = document.createElement('div');
      when.className = 'muted';
      when.textContent = dateLabel(entry);
      row.append(name, when);
      list.append(row);
    }
  }

  function renderCustomerActions() {
    renderAppointments();
    if (byId('customerChatMessages')) window.renderCustomerChatMessages?.();
  }

  function reset() {
    epoch++;
    appointmentUnsubscribe?.();
    appointmentUnsubscribe = undefined;
    customerKey = '';
    loadState = 'Deine Termine werden geladen …';
    appointments.clear();
    pendingActions.clear();
    if (documentOwned) window.DSDocumentOutput?.close();
    documentOwned = false;
    renderAppointments();
  }

  function watchAppointments() {
    if (!byId('customerAppointments')) return;
    const customer = identity();
    const key = keyFor(customer);
    if (key === customerKey && appointmentUnsubscribe) return;
    reset();
    if (!customer) return;
    customerKey = key;
    const current = epoch;
    const sameAccount = () => epoch === current && keyFor(identity()) === key;
    appointmentUnsubscribe = firebase.firestore().collection('orgs').doc(window.firebaseOrgId)
      .collection('users').doc(customer.uid).collection('calendarAppointments').where('customerId', '==', customer.customerId)
      .onSnapshot({ includeMetadataChanges: true }, snapshot => {
        if (!sameAccount() || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
        appointments = new Map(snapshot.docs.map(doc => [doc.id, doc.data()]));
        loadState = '';
        renderCustomerActions();
      }, () => {
        if (!sameAccount()) return;
        appointments.clear();
        loadState = 'Deine Termine konnten gerade nicht geladen werden.';
        appointmentUnsubscribe = undefined;
        renderCustomerActions();
      });
  }

  function ownsAction(message) {
    const customer = identity();
    return customer && message.customerUid === customer.uid && message.customerId === customer.customerId;
  }

  function isAction(message) {
    return message?.senderRole === 'staff' && ['appointment', 'invoiceShare'].includes(message.kind);
  }

  function chatCard(message) {
    if (!ownsAction(message)) return '';
    const actions = (buttons) => `<div class="row ds-portal-action-buttons">${buttons}</div><div class="ds-portal-action-feedback" role="status"></div>`;
    const button = (value, label, primary = false) => `<button type="button" class="btn${primary ? ' primary' : ''}" data-portal-action="${value}">${label}</button>`;
    if (message.kind === 'invoiceShare') return `<strong>Rechnung verfügbar</strong>${actions(button('invoice', 'Rechnung öffnen', true))}`;

    const entry = appointments.get(message.appointmentId);
    if (!entry) return `<strong>Terminvorschlag</strong><div>${escapeHtml(loadState || 'Dieser Vorschlag ist nicht mehr verfügbar.')}</div>`;
    if (entry.version !== message.appointmentVersion) return '<strong>Terminvorschlag</strong><div>Dieser Vorschlag wurde aktualisiert.</div>';
    const stateLabel = labels[entry.status];
    const controls = entry.status === 'pending'
      ? actions(button('accepted', 'Passt', true) + button('declined', 'Passt nicht')) : '';
    return `<strong>${escapeHtml(entry.title)}</strong><div>${escapeHtml(dateLabel(entry))}</div><small>${escapeHtml(stateLabel || '')}</small>${controls}`;
  }

  function bindChat(container, messages, onRead) {
    for (const group of container.querySelectorAll('[data-portal-msg-index]')) {
      const message = messages[Number(group.dataset.portalMsgIndex)];
      for (const button of group.querySelectorAll('[data-portal-action]')) {
        button.onclick = () => actInChat(message, group, button.dataset.portalAction, onRead);
      }
    }
  }

  async function actInChat(message, group, action, onRead) {
    if (!ownsAction(message)) return;
    const key = keyFor(identity());
    const current = epoch;
    const sameAccount = () => current === epoch && keyFor(identity()) === key;
    const chatId = dsCustomerChatState().currentChatId;
    const sameChat = () => sameAccount() && byId('view-chat')?.classList.contains('is-active') &&
      dsCustomerChatState().currentChatId === chatId;
    const actionKey = message.id;
    if (pendingActions.has(actionKey)) return;
    pendingActions.add(actionKey);
    const buttons = [...group.querySelectorAll('button')];
    const status = group.querySelector('.ds-portal-action-feedback');
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = action === 'invoice' ? 'Rechnung wird geladen …' : 'Rückmeldung wird gespeichert …';
    try {
      if (action === 'invoice') {
        const invoice = await call('portalInvoice', 'open', { id: message.invoiceId });
        if (!sameChat()) return;
        documentOwned = await openInvoiceDocument(invoice.model, {
          stillCurrent: sameChat,
          warning: invoiceLabels[invoice.status] || invoiceLabels.shared
        });
        if (!documentOwned) return;
      } else {
        const entry = await call('calendarControl', 'appointment-response', {
          id: message.appointmentId, version: message.appointmentVersion, response: action
        });
        if (!sameAccount()) return;
        const currentEntry = appointments.get(entry.id);
        if (!currentEntry || currentEntry.version <= entry.version) appointments.set(entry.id, entry);
        renderCustomerActions();
      }
      if (sameAccount()) await onRead(message);
      status.textContent = '';
    } catch (error) {
      if (sameAccount()) status.textContent = feedback(error);
    } finally {
      if (sameAccount()) pendingActions.delete(actionKey);
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function canRelease(invoice) {
    return ['open', 'offen'].includes(String(invoice?.status || '').toLowerCase().trim());
  }

  function validIban(iban) {
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
    let remainder = 0;
    for (const character of iban.slice(4) + iban.slice(0, 4)) {
      const letter = character >= 'A';
      const digit = letter ? character.charCodeAt(0) - 55 : Number(character);
      remainder = (remainder * (letter ? 100 : 10) + digit) % 97;
    }
    return remainder === 1;
  }

  function renderBankSettings() {
    const form = byId('invoiceBankForm');
    if (!form) return;
    form.hidden = !DSBilling.admin();
    if (form.hidden || form.hasAttribute('data-dirty')) return;
    window.DSSettingsWorkspace?.track(form, 'invoiceBankStatus');
    const { iban, bankName, bic } = form.elements;
    const bank = state.settings?.invoiceBank || {};
    iban.value = bank.iban || '';
    bankName.value = bank.name || '';
    bic.value = bank.bic || '';
    const status = byId('invoiceBankStatus');
    status.textContent = '';
    form.onsubmit = event => {
      event.preventDefault();
      if (!DSBilling.admin()) return;
      const account = iban.value.replace(/\s+/g, '').toUpperCase();
      const bankCode = bic.value.trim().toUpperCase();
      if (!validIban(account)) {
        status.textContent = 'Bitte prüfe die IBAN.';
        iban.focus();
        return;
      }
      if (bankCode && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bankCode)) {
        status.textContent = 'Bitte prüfe den BIC.';
        bic.focus();
        return;
      }
      const formatted = account.match(/.{1,4}/g).join(' ');
      state.settings ||= {};
      state.settings.invoiceBank = { iban: formatted, bic: bankCode, name: bankName.value.trim() };
      saveState();
      iban.value = formatted;
      bic.value = bankCode;
      status.textContent = 'Bankverbindung gespeichert.';
      delete form.dataset.dirty;
    };
  }

  async function confirmedInvoice(host, id, version, uid) {
    const stillSelected = () => user()?.uid === uid && host.isConnected && DSBilling.admin();
    const deadline = Date.now() + 8000;
    while (CLOUD._workflowPublishing && stillSelected() && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (!stillSelected()) return null;
    if (CLOUD._workflowPublishing) throw new Error('Die Cloud-Synchronisierung läuft. Bitte erneut versuchen.');
    if (SYNC.cloudPending && !SYNC.cloudNeedsReview) {
      clearTimeout(CLOUD._pushTimer);
      await cloudPushNow();
    }
    if (!stillSelected()) return null;
    if (SYNC.cloudNeedsReview || SYNC.cloudPending || !state._cloudUpdatedAt) {
      throw new Error('Bitte schließe zuerst die Cloud-Synchronisierung ab.');
    }
    const current = getInvoiceById(id);
    if (!canRelease(current) || (current.updatedAt || '') !== version) {
      throw new Error('Die Rechnung wurde geändert. Bitte öffne und prüfe sie erneut.');
    }
    return current;
  }

  function invoiceControls(host, invoice, customer) {
    if (!host || !customer?.id || invoice.manualRecipient || !DSBilling.admin() ||
        (!canRelease(invoice) && !DSBilling.frozen(invoice))) return;
    const uid = user()?.uid;
    if (!uid) return;
    const version = invoice.updatedAt || '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn primary';
    button.textContent = 'Rechnung an Kunden weitergeben';
    button.hidden = !canRelease(invoice);
    const status = document.createElement('p');
    status.className = 'muted';
    status.setAttribute('role', 'status');
    host.append(button, status);
    const active = () => user()?.uid === uid && host.isConnected;
    const showShared = sharedAt => {
      if (user()?.uid !== uid) return;
      if (host.isConnected) {
        button.hidden = true;
        status.textContent = `Im Kundenchat bereitgestellt am ${new Date(sharedAt).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}.`;
      }
      window.dispatchEvent(new CustomEvent('ds-invoice-shared', { detail: { id: invoice.id, owner: uid, sharedAt } }));
    };
    let busy = false;
    button.onclick = async () => {
      if (busy || !active()) return;
      busy = button.disabled = true;
      status.textContent = 'Rechnung wird geprüft und im Chat bereitgestellt …';
      try {
        const current = await confirmedInvoice(host, invoice.id, version, uid);
        if (!current || !active()) return;
        const result = await call('portalInvoice', 'share', {
          id: invoice.id, customerId: customer.id, workspaceStamp: state._cloudUpdatedAt,
          invoiceUpdatedAt: current.updatedAt || '', model: invoicePrintModel(current)
        });
        showShared(result.sharedAt);
      } catch (error) {
        if (active()) status.textContent = feedback(error);
      } finally {
        busy = button.disabled = false;
      }
    };
    call('portalInvoice', 'status', { id: invoice.id }).then(({ sharedAt }) => {
      if (active() && sharedAt && !busy) showShared(sharedAt);
    }).catch(() => {});
  }

  window.addEventListener('ds-customer-data-ready', watchAppointments);
  window.DSPortalActions = { watchAppointments, reset, isAction, chatCard, bindChat, invoiceControls, invoiceShareStatuses, renderBankSettings };
})();
