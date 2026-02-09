// app.js – FINAL STABLE PATCH
// Build: M48_4G3_INBOX_PORTAL_GUARD_20260209C
// Scope: Portal-Kunden-Zuordnung + Aufgaben sichtbar + harter Customer-Guard
// NOTE: Diese Datei ersetzt die bestehende app.js vollständig.

/* =====================
   GLOBAL STATE EXTENSION
===================== */
window.state = window.state || {};
state.portalCustomerMap = state.portalCustomerMap || {};
state.inboxTasks = state.inboxTasks || [];

/* =====================
   SECURITY GUARD
===================== */
function enforceCustomerGuard() {
  if (state.currentUserRole === 'customer') {
    document.body.classList.add('customer-mode');
    document.querySelectorAll('[data-admin-only]').forEach(el => el.remove());
    showCustomerPortal();
  }
}

function showCustomerPortal() {
  document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
  const portal = document.getElementById('customerPortal');
  if (portal) portal.style.display = 'block';
}

/* =====================
   PORTAL ↔ KUNDE ZUORDNUNG
===================== */
function linkPortalUserToCustomer(uid, customer) {
  state.portalCustomerMap[uid] = {
    customerId: customer.id,
    customerName: customer.name,
    linkedAt: Date.now()
  };
  saveState();
}

function getCustomerForUser(uid) {
  return state.portalCustomerMap[uid] || null;
}

/* =====================
   AUFGABEN ERSTELLEN
===================== */
function createInboxTask({ uid, customerId, template, title }) {
  const task = {
    id: 'task_' + Date.now(),
    assignedUid: uid,
    customerId,
    template,
    title,
    status: 'open',
    createdAt: Date.now()
  };
  state.inboxTasks.push(task);
  saveState();
}

/* =====================
   AUFGABEN SICHTBARKEIT
===================== */
function getTasksForAdmin() {
  return state.inboxTasks.filter(t => t.status === 'open');
}

function getTasksForCustomer(uid) {
  return state.inboxTasks.filter(t => t.assignedUid === uid && t.status === 'open');
}

/* =====================
   INIT
===================== */
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  enforceCustomerGuard();
});
