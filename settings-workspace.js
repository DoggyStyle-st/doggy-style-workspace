(function () {
  'use strict';

  const byId = id => document.getElementById(id);
  const root = byId('settings');
  const business = byId('invoiceBusinessForm');
  const preview = byId('settingsPricePreview');
  const dialog = byId('settingsRestoreDialog');
  const file = byId('fileBackupImport');
  const feedback = new Map();
  const keys = ['name', 'owner', 'street', 'zipCity', 'phone', 'email'];
  let restore = null;
  let generation = 0;

  function select(section) {
    root.querySelectorAll('[data-settings-pane]').forEach(pane => {
      pane.hidden = pane.dataset.settingsPane !== section;
    });
    root.querySelectorAll('[data-settings-section]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.settingsSection === section));
    });
  }

  function message(id, value) {
    feedback.set(id, value);
    const output = byId(id);
    if (output) output.textContent = value;
  }

  function track(element, id) {
    if (element.dataset.settingsTracking) return;
    element.dataset.settingsTracking = 'true';
    element.addEventListener('input', () => {
      element.dataset.dirty = 'true';
      message(id, 'Ungespeicherte Änderungen');
    });
  }

  function saved(element, id) {
    delete element.dataset.dirty;
    message(id, 'Übernommen. Den Übertragungsstatus findest du unter Cloud & Datensicherung.');
  }

  function businessFields() {
    return Object.fromEntries(keys.map(key => [key, business.elements.namedItem(key).value.trim()]));
  }

  function enter() {
    if (!preview.elements.from.value) preview.elements.from.value = preview.elements.to.value = toISODateLocal(new Date());
    const admin = DSBilling.admin();
    business.hidden = !admin;
    byId('pricingSettingsBlock')?.querySelectorAll('input,button').forEach(control => { control.disabled = !admin; });
    if (!business.hasAttribute('data-dirty')) {
      const current = {...COMPANY, ...state.settings?.invoiceBusiness};
      for (const key of keys) business.elements.namedItem(key).value = current[key] || '';
    }
    for (const [id, value] of feedback) {
      if (byId(id)) byId(id).textContent = value;
    }
  }

  function prepareExportMonth() {
    const input = byId('settingsExportMonth');
    if (!input.value) input.value = toISODateLocal(new Date()).slice(0, 7);
  }

  function dismissRestore() {
    restore = null;
    if (dialog.open) dialog.close();
  }

  function reset() {
    generation++;
    dismissRestore();
    file.value = '';
    for (const id of feedback.keys()) byId(id)?.replaceChildren();
    feedback.clear();
    root.querySelectorAll('[data-dirty]').forEach(element => { delete element.dataset.dirty; });
    byId('settingsPreviewResult').replaceChildren();
    business.reset();
    byId('invoiceBankForm').reset();
    byId('invoiceBankStatus').replaceChildren();
    byId('settingsLegalEditor').replaceChildren();
    byId('settingsPricing').replaceChildren();
    select('billing');
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('[data-settings-section]');
    if (button) select(button.dataset.settingsSection);
  });

  track(business, 'settingsBusinessStatus');
  business.addEventListener('submit', event => {
    event.preventDefault();
    if (!DSBilling.admin()) return;
    const fields = businessFields();
    if (!fields.name || !fields.street || !fields.zipCity) {
      message('settingsBusinessStatus', 'Bitte Betriebsname und Anschrift angeben.');
      return;
    }
    state.settings ||= {};
    state.settings.invoiceBusiness = fields;
    saveState();
    saved(business, 'settingsBusinessStatus');
  });

  preview.addEventListener('submit', event => {
    event.preventDefault();
    const container = byId('settingsPreviewResult');
    container.replaceChildren();
    const from = preview.elements.from.value, to = preview.elements.to.value;
    const care = preview.elements.care.value;
    try {
      const calendar = DSBilling.stayCalendar(from, to);
      if (!calendar) throw new Error('Bitte einen gültigen Zeitraum angeben.');
      const cfg = DSBilling.admin() ? readPricingForm() : getPricingSettings();
      const result = calculateInvoicePricing({meta: {betreuung: care, von: from, bis: to}, fields: {}}, calendar, cfg);
      const issuer = DSBilling.admin() ? businessFields() : {...COMPANY, ...state.settings?.invoiceBusiness};
      const tax = computeNetVatFromGross(result.total, cfg.vatPercent);
      for (const line of [
        [issuer.name, issuer.owner].filter(Boolean).join(' · '),
        [issuer.street, issuer.zipCity].filter(Boolean).join(' · '),
        [issuer.phone, issuer.email].filter(Boolean).join(' · '),
        care + ' · ' + result.days + (result.days === 1 ? ' Tag' : ' Tage') + ' × ' + formatEuro(result.daily),
        ...result.surchargeItems.map(item => item.label + ' · ' + formatEuro(item.value)),
        'Gesamt brutto ' + formatEuro(tax.gross) + ' · darin MwSt. ' + formatEuro(tax.vat)
      ].filter(Boolean)) {
        const paragraph = document.createElement('p');
        paragraph.textContent = line;
        container.append(paragraph);
      }
    } catch (error) {
      container.textContent = error.message;
    }
  });

  byId('btnBackupImport').addEventListener('click', () => {
    if (DSBilling.admin()) file.click();
  });
  file.addEventListener('change', async () => {
    const selected = file.files?.[0];
    file.value = '';
    if (!selected || !DSBilling.admin()) return;
    const request = ++generation;
    const uid = firebase.auth().currentUser.uid;
    try {
      const data = JSON.parse(await selected.text());
      if (request !== generation || firebase.auth().currentUser?.uid !== uid || !DSBilling.admin()) return;
      if (data?.format === 'DoggyStyleLocalBackup-v1') {
        throw new Error('Wähle für diese Wiederherstellung eine Workspace-Sicherung (JSON).');
      }
      const sections = {customers: 'Kunden', pets: 'Hunde', docs: 'Dokumente', invoices: 'Rechnungen'};
      if (!data || !Array.isArray(data.docs) || !Array.isArray(data.dogs) ||
          ['customers', 'pets', 'invoices'].some(key => data[key] !== undefined && !Array.isArray(data[key])) ||
          ['dogs', ...Object.keys(sections)].some(key => data[key]?.some(row => !row || typeof row !== 'object' || Array.isArray(row)))) {
        throw new Error('Die Datei enthält keine gültige Workspace-Sicherung.');
      }
      const date = new Date(data._backupCreatedAt || data._localUpdatedAt || selected.lastModified);
      const label = data._backupCreatedAt ? 'Sicherung erstellt' : data._localUpdatedAt ? 'Letzte Änderung im Backup' : 'Dateidatum';
      byId('settingsRestoreDate').textContent = label + ' ' + (Number.isFinite(date.getTime()) ? date.toLocaleString('de-DE') : 'unbekannt');
      const contents = byId('settingsRestoreContents');
      contents.replaceChildren();
      for (const [key, label] of Object.entries(sections)) {
        const row = document.createElement('li');
        const records = data[key] ?? (key === 'pets' ? data.dogs : null);
        row.textContent = label + ' · ' + (records?.length ?? 'nicht enthalten');
        contents.append(row);
      }
      if (data.settings) {
        const row = document.createElement('li');
        row.textContent = 'Einstellungen enthalten';
        contents.append(row);
      }
      restore = {data, uid};
      dialog.showModal();
    } catch (error) {
      if (request === generation) message('settingsRestoreStatus', error.message);
    }
  });
  byId('settingsRestoreCancel').addEventListener('click', dismissRestore);
  dialog.addEventListener('close', () => { if (!dialog.open) restore = null; });
  byId('settingsRestoreConfirm').addEventListener('click', () => {
    if (!restore || !DSBilling.admin() || firebase.auth().currentUser?.uid !== restore.uid) return;
    const previous = state;
    try {
      const next = restore.data;
      delete next._backupCreatedAt;
      next._cloudUpdatedAt = previous._cloudUpdatedAt;
      state = next;
      ensureStateShape();
      ensureContractDefaults();
      migrateToV2();
      pruneInvoiceDocs();
      ensureDefaultDog();
    } catch (error) {
      state = previous;
      dismissRestore();
      message('settingsRestoreStatus', 'Wiederherstellung fehlgeschlagen. ' + error.message);
      return;
    }
    dismissRestore();
    saveState();
    renderDogs();
    renderDocs();
    renderInvoiceList();
    reset();
    select('storage');
    renderStaffSettings();
    renderPolicySettings();
    renderSettingsLegal();
    window.DSPortalActions?.renderBankSettings();
    enter();
    saved(root, 'settingsRestoreStatus');
  });

  track(byId('staffCard'), 'staffSettingsStatus');
  select('billing');
  window.DSSettingsWorkspace = {enter, reset, prepareExportMonth, track, saved};
})();
