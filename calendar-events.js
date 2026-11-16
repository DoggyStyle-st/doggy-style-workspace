(function () {
  'use strict';

  const REGION = 'europe-west1';
  const DEVICE_OWNER = 'ds-calendar-push-owner';
  const byId = id => document.getElementById(id);
  const eventForm = () => byId('calEventForm');
  let account = '';
  let configuration = null;
  let controller = null;
  let open = false;
  let eventsByDay = new Map();
  let stopWatching = null;
  let monthKey = '';
  let editing = null;
  let customerTargets = new Map();
  let saving = false;
  let pushBusy = false;
  let deviceRegistration = null;
  let subscription = null;
  let wired = false;

  function staffUser() {
    const cloud = window.CLOUD;
    return ['admin', 'staff'].includes(cloud?.role) ? cloud.auth?.currentUser : null;
  }

  async function call(action, data = {}) {
    if (!staffUser()) throw new Error('Bitte im Workspace anmelden.');
    const result = await firebase.app().functions(REGION).httpsCallable('calendarControl', { timeout: 15000 })({ action, ...data });
    return result.data;
  }

  function messageFor(error) {
    const code = error?.code?.split('/').pop();
    if (['invalid-argument', 'permission-denied', 'failed-precondition', 'aborted', 'unauthenticated'].includes(code)) return error.message;
    if (code === 'internal' || code === 'unavailable' || code === 'not-found' || !navigator.onLine) {
      return 'Firebase ist für Termine gerade nicht erreichbar. Bitte erneut versuchen.';
    }
    if (code === 'deadline-exceeded') return 'Das Speichern konnte nicht bestätigt werden. Bitte erneut versuchen.';
    return error?.message || 'Die Aktion konnte nicht abgeschlossen werden.';
  }

  function watch(from, to) {
    if (!open || !account || !window.CLOUD?.db) return;
    const key = from + '/' + to;
    if (monthKey === key) return;
    stopWatching?.();
    monthKey = key;
    eventsByDay = new Map();
    const uid = account;
    stopWatching = CLOUD.db.collection('orgs').doc(CLOUD.orgId).collection('calendarEvents')
      .where('date', '>=', from).where('date', '<=', to)
      .onSnapshot(snapshot => {
        if (!open || account !== uid || monthKey !== key) return;
        eventsByDay = new Map();
        snapshot.forEach(doc => addToDay(doc.data()));
        if (editing && byId('calEventDialog').open) {
          const latest = (eventsByDay.get(editing.date) || []).find(event => event.id === editing.id);
          if (latest) byId('calEventCustomerStatus').textContent = customerSummary(latest);
        }
        controller.refresh();
      }, () => {
        if (account !== uid || monthKey !== key) return;
        byId('calendarCloudStatus').textContent = 'Eigene Termine konnten aus Firebase nicht geladen werden.';
        monthKey = '';
        stopWatching = null;
      });
  }

  function remember(event) {
    for (const [day, entries] of eventsByDay) {
      const filtered = entries.filter(value => value.id !== event.id);
      if (filtered.length) eventsByDay.set(day, filtered);
      else eventsByDay.delete(day);
    }
    addToDay(event);
  }

  function addToDay(event) {
    if (!eventsByDay.has(event.date)) eventsByDay.set(event.date, []);
    eventsByDay.get(event.date).push(event);
  }

  function eventCount(day) {
    return (eventsByDay.get(day) || []).filter(event => event.status === 'active').length;
  }

  function mailSummary(event) {
    const statuses = Object.values(event?.mailStatus || {});
    const noun = event?.mailMethod === 'CANCEL' ? 'Absage' : 'Einladung';
    if (statuses.includes('failed')) return `${noun} teilweise oder ganz fehlgeschlagen`;
    if (statuses.includes('pending')) return `${noun} wartet auf Versand`;
    if (statuses.length && statuses.every(status => status === 'sent')) return `${noun} vom Mailserver angenommen`;
    return '';
  }

  function reminderSummary(event) {
    const labels = {
      'no-devices': 'Keine Geräte für Mitteilungen aktiviert',
      expired: 'Erinnerungszeit verstrichen',
      partial: 'Ein Gerät konnte nicht erreicht werden',
      failed: 'Erinnerung konnte nicht zugestellt werden',
      sent: 'Erinnerung versendet'
    };
    return labels[event?.reminderStatus] || '';
  }

  function customerSummary(event) {
    const appointment = event?.appointment;
    const labels = { pending: 'Antwort offen', accepted: 'Zugesagt', declined: 'Passt nicht', canceled: 'Abgesagt' };
    return appointment ? [appointment.name, labels[appointment.status]].filter(Boolean).join(' · ') : '';
  }

  function dayList(day, transfers) {
    const list = byId('calEventList');
    if (!list) return;
    const appointments = (eventsByDay.get(day) || []).filter(event => event.status === 'active' ||
      Object.values(event.mailStatus || {}).some(status => ['pending', 'failed'].includes(status)));
    const timeline = transfers.concat(appointments.map(event => ({
      time: event.allDay ? '' : event.startTime,
      title: event.title,
      trailing: event.allDay ? 'Ganztägig' : `${event.startTime}–${event.endTime} Uhr`,
      detail: [event.status === 'canceled' ? 'Abgesagt' : '', customerSummary(event), mailSummary(event), reminderSummary(event)].filter(Boolean).join(' · '),
      event
    }))).sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title, 'de'));

    list.replaceChildren();
    if (!timeline.length) return;
    const heading = document.createElement('h3');
    heading.textContent = 'Tagesablauf';
    list.append(heading);
    for (const entry of timeline) {
      const row = document.createElement('div');
      row.className = 'item calendar-agenda-item';
      const text = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = entry.title;
      const detail = document.createElement('small');
      detail.textContent = [entry.trailing || `${entry.time} Uhr`, entry.detail].filter(Boolean).join(' · ');
      text.append(title, detail);
      row.append(text);
      if (entry.event) {
        row.dataset.calendarEvent = entry.event.id;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'smallbtn';
        button.textContent = entry.event.status === 'canceled' ? 'Öffnen' : 'Bearbeiten';
        button.disabled = !configuration;
        button.onclick = () => showEvent(entry.event);
        row.append(button);
      }
      list.append(row);
    }
  }

  function updateOptions() {
    const fields = eventForm().elements;
    const allDay = fields.allDay.checked;
    byId('calEventTimeFields').hidden = allDay;
    fields.startTime.disabled = allDay;
    fields.endTime.disabled = allDay;
    byId('calEventReminderHint').textContent = !configuration?.pushKey
      ? 'Mitteilungen müssen zuerst in Firebase eingerichtet werden.'
      : (allDay && fields.reminder.value !== '' ? 'Bei ganztägigen Terminen gilt 9 Uhr als Bezugspunkt.' : '');
    byId('calEventInviteHint').textContent = !configuration?.inviteReady && !editing?.invite
      ? 'Einladungen benötigen zwei hinterlegte Adressen und einen eingerichteten E-Mail-Versand.'
      : (fields.invite.checked ? 'Die Einladung enthält Titel, Zeit und Notiz.' : '');
  }

  async function loadCustomerChoices(entry) {
    const select = eventForm().elements.customer;
    const hint = byId('calEventCustomerHint');
    const target = entry.appointment;
    customerTargets = new Map();
    select.replaceChildren(new Option('Kein Kunde', ''));
    if (target) {
      const key = `${target.uid}/${target.customerId}`;
      customerTargets.set(key, target);
      select.add(new Option(target.name, key, false, true));
    }
    select.disabled = true;
    hint.textContent = 'Kundenkonten werden geladen …';
    const uid = account;
    try {
      const options = await DSCustomerPortal.refreshChoices();
      if (entry !== editing || uid !== account) return;
      for (const option of options) {
        const key = `${option.uid}/${option.id}`;
        if (!customerTargets.has(key)) select.add(new Option(`${option.name} · ${option.email}`, key));
        customerTargets.set(key, { uid: option.uid, customerId: option.id });
      }
      hint.textContent = options.length || target ? '' : 'Kundenkonten können unter Einstellungen zugeordnet werden.';
    } catch (_) {
      if (entry === editing && uid === account) hint.textContent = 'Kundenkonten konnten nicht geladen werden. Öffne den Termin erneut.';
    } finally {
      if (entry === editing && uid === account) select.disabled = entry.status === 'canceled';
    }
  }

  function showEvent(entry = null) {
    if (!configuration || !staffUser()) return;
    const dialog = byId('calEventDialog');
    const form = eventForm();
    const fields = form.elements;
    editing = entry || { id: crypto.randomUUID(), revision: 0 };
    const canceled = entry?.status === 'canceled';
    form.reset();
    fields.title.value = entry?.title || '';
    fields.date.value = entry?.date || controller.selectedDate();
    fields.allDay.checked = !!entry?.allDay;
    fields.startTime.value = entry?.startTime || '09:00';
    fields.endTime.value = entry?.endTime || '10:00';
    fields.notes.value = entry?.notes || '';
    fields.reminder.value = String(entry?.reminderMinutes ?? (entry ? '' : (configuration.pushKey ? 15 : '')));
    fields.invite.checked = entry ? !!entry.invite : configuration.inviteReady;
    fields.invite.disabled = !configuration.inviteReady && !entry?.invite;
    fields.reminder.disabled = !configuration.pushKey;
    byId('calEventHeading').textContent = canceled ? 'Termin abgesagt' : (entry ? 'Termin bearbeiten' : 'Neuer Termin');
    byId('calEventFeedback').textContent = [mailSummary(entry), reminderSummary(entry)].filter(Boolean).join(' · ');
    byId('calEventSave').hidden = canceled;
    byId('calEventCancel').hidden = !entry || canceled;
    byId('calEventRetry').hidden = !Object.values(entry?.mailStatus || {}).includes('failed');
    byId('calEventCustomerWrap').hidden = !configuration.customerAppointments;
    byId('calEventCustomerStatus').textContent = customerSummary(entry);
    if (configuration.customerAppointments) loadCustomerChoices(editing);
    updateOptions();
    if (!dialog.open) dialog.showModal();
  }

  function recordFromForm() {
    const fields = eventForm().elements;
    const target = customerTargets.get(fields.customer.value);
    return {
      title: fields.title.value, date: fields.date.value, allDay: fields.allDay.checked,
      startTime: fields.startTime.value, endTime: fields.endTime.value, notes: fields.notes.value,
      reminderMinutes: fields.reminder.value === '' ? null : Number(fields.reminder.value),
      invite: fields.invite.checked,
      ...(configuration.customerAppointments ? { customerTarget: target ? { uid: target.uid, customerId: target.customerId } : null } : {})
    };
  }

  async function amend(action) {
    if (saving || !editing) return;
    if (action === 'cancel' && !confirm('Diesen Termin absagen?')) return;
    const uid = account;
    saving = true;
    const form = eventForm();
    const request = { id: editing.id, revision: editing.revision };
    if (action === 'save') request.event = recordFromForm();
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    const status = byId('calEventFeedback');
    status.textContent = action === 'save' ? 'Wird gespeichert …' : 'Wird aktualisiert …';
    try {
      const updated = await call(action, request);
      if (uid !== account) return;
      byId('calEventDialog').close();
      controller.showDay(updated.date);
      remember(updated);
      controller.refresh();
      byId('calendarCloudStatus').textContent = [
        updated.status === 'canceled' ? 'Termin abgesagt.' : 'Termin gespeichert.',
        customerSummary(updated), mailSummary(updated), reminderSummary(updated)
      ].filter(Boolean).join(' ');
    } catch (error) {
      if (uid === account) status.textContent = messageFor(error);
    } finally {
      buttons.forEach(button => { button.disabled = false; });
      saving = false;
    }
  }

  function showSettings() {
    const form = byId('calSettingsForm');
    form.elements.raphael.value = configuration.addresses.raphael;
    form.elements.anschi.value = configuration.addresses.anschi;
    byId('calSettingsFeedback').textContent = configuration.mailReady
      ? '' : 'Der E-Mail-Absender muss noch in Firebase eingerichtet werden.';
    byId('calSettingsDialog').showModal();
  }

  async function saveSettings(form) {
    const button = form.querySelector('[type=submit]');
    const uid = account;
    button.disabled = true;
    try {
      const updated = await call('settings', {
        addresses: { raphael: form.elements.raphael.value, anschi: form.elements.anschi.value }
      });
      if (uid !== account) return;
      configuration = updated;
      byId('calSettingsDialog').close();
      byId('calendarCloudStatus').textContent = configuration.inviteReady
        ? 'Einladungen für neue Termine sind aktiviert.' : 'Einladungsadressen gespeichert.';
    } catch (error) {
      byId('calSettingsFeedback').textContent = messageFor(error);
    } finally {
      button.disabled = false;
    }
  }

  function deviceOwner(value) {
    try {
      if (value === null) localStorage.removeItem(DEVICE_OWNER);
      else if (value !== undefined) localStorage.setItem(DEVICE_OWNER, value);
      return localStorage.getItem(DEVICE_OWNER);
    } catch (_) {
      return null;
    }
  }

  function pushUnsupported() {
    const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (appleMobile && !(navigator.standalone || matchMedia('(display-mode: standalone)').matches)) {
      return 'Für Mitteilungen den Workspace zum Home-Bildschirm hinzufügen und von dort öffnen.';
    }
    if (!('serviceWorker' in navigator) || !('Notification' in window) || !deviceRegistration?.pushManager) {
      return 'Mitteilungen sind in diesem Browser gerade nicht verfügbar.';
    }
    if (Notification.permission === 'denied') return 'Mitteilungen für den Workspace sind in den Systemeinstellungen gesperrt.';
    return '';
  }

  function renderPush(text) {
    const button = byId('btnCalPush');
    const status = byId('calendarPushStatus');
    const active = subscription && deviceOwner() === account;
    const blocked = configuration?.pushKey ? pushUnsupported() : 'Mitteilungen sind für den Kalender noch nicht eingerichtet.';
    button.textContent = active ? 'Mitteilungen ausschalten' : 'Mitteilungen einschalten';
    button.disabled = pushBusy || (!active && !!blocked);
    status.textContent = text || (active ? 'Mitteilungen sind auf diesem Gerät aktiv.' : blocked);
  }

  async function loadDevice(uid) {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.ready;
    if (uid !== account) return;
    const existing = await registration.pushManager?.getSubscription();
    if (uid !== account) return;
    deviceRegistration = registration;
    subscription = existing || null;
    if (deviceOwner() && deviceOwner() !== uid) {
      await subscription?.unsubscribe();
      subscription = null;
      deviceOwner(null);
    }
    renderPush();
  }

  async function stopDevice() {
    const existing = subscription || await (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription();
    if (existing) {
      const endpoint = existing.endpoint;
      await existing.unsubscribe();
      subscription = null;
      deviceOwner(null);
      try { await call('push-disable', { endpoint }); } catch (_) { /* The browser has already ended delivery. */ }
    } else {
      deviceOwner(null);
    }
  }

  async function togglePush() {
    const active = subscription && deviceOwner() === account;
    if (pushBusy || (!active && !configuration?.pushKey)) return;
    pushBusy = true;
    renderPush();
    try {
      if (active) {
        await stopDevice();
      } else {
        const key = Uint8Array.from(atob(configuration.pushKey.replaceAll('-', '+').replaceAll('_', '/')), ch => ch.charCodeAt(0));
        // Start the subscription inside the button event. iOS requires a user gesture.
        subscription = subscription || await deviceRegistration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        try {
          await call('push-enable', { subscription: subscription.toJSON() });
          deviceOwner(account);
        } catch (error) {
          await subscription.unsubscribe();
          subscription = null;
          throw error;
        }
      }
      pushBusy = false;
      renderPush();
    } catch (error) {
      pushBusy = false;
      renderPush(pushUnsupported() || messageFor(error));
    }
  }

  function wire() {
    if (wired) return;
    wired = true;
    byId('btnCalNewEvent').onclick = () => showEvent();
    byId('btnCalSettings').onclick = showSettings;
    byId('btnCalPush').onclick = togglePush;
    byId('calEventAllDay').onchange = updateOptions;
    byId('calEventInvite').onchange = updateOptions;
    byId('calEventReminder').onchange = updateOptions;
    eventForm().onsubmit = event => { event.preventDefault(); amend('save'); };
    byId('calEventCancel').onclick = () => amend('cancel');
    byId('calEventRetry').onclick = () => amend('retry');
    byId('calEventDialog').addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    byId('calSettingsForm').onsubmit = event => { event.preventDefault(); saveSettings(event.currentTarget); };
    document.querySelectorAll('[data-calendar-close]').forEach(button => {
      button.onclick = () => button.closest('dialog').close();
    });
  }

  function leave() {
    if (!open) return;
    open = false;
    stopWatching?.();
    stopWatching = null;
    monthKey = '';
  }

  function reset() {
    leave();
    account = '';
    eventsByDay = new Map();
    configuration = null;
    subscription = null;
    deviceRegistration = null;
    byId('btnCalNewEvent').disabled = true;
    byId('btnCalSettings').hidden = true;
    byId('calendarCloudStatus').textContent = '';
    editing = null;
    customerTargets.clear();
    if (byId('calEventDialog').open) byId('calEventDialog').close();
    if (byId('calSettingsDialog').open) byId('calSettingsDialog').close();
    renderPush();
  }

  function show(controls) {
    controller = controls;
    wire();
    const uid = staffUser()?.uid || '';
    if (uid !== account) reset();
    if (open) return;
    account = uid;
    open = true;
    if (!uid) return;
    byId('calendarCloudStatus').textContent = 'Kalender wird verbunden …';
    call('config').then(result => {
      if (account !== uid) return;
      configuration = result;
      byId('calendarCloudStatus').textContent = '';
      byId('btnCalNewEvent').disabled = false;
      byId('btnCalSettings').hidden = !result.admin;
      renderPush();
      if (open) controller.refresh();
    }).catch(() => {
      if (account !== uid) return;
      configuration = null;
      byId('btnCalNewEvent').disabled = true;
      byId('btnCalSettings').hidden = true;
      byId('calendarCloudStatus').textContent = 'Eigene Termine benötigen die Kalenderanbindung in Firebase.';
      renderPush();
    });
    loadDevice(uid).catch(() => {});
  }

  async function removeDeviceOnLogout() {
    if (deviceOwner() || subscription) {
      let timer;
      try {
        await Promise.race([stopDevice(), new Promise(resolve => { timer = setTimeout(resolve, 1800); })]);
      } finally {
        clearTimeout(timer);
      }
    }
    reset();
  }

  window.DSCalendarEvents = { show, leave, watch, eventCount, dayList, reset, removeDeviceOnLogout };
})();
