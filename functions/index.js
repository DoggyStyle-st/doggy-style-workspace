'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const nodemailer = require('nodemailer');
const webPush = require('web-push');
const { CalendarError, emailAddress, invalid } = require('./calendar-event');
const { calendarRefs, createStore, workspaceRole } = require('./calendar-store');
const { deliverInvitations, deliverReminders } = require('./calendar-delivery');

initializeApp();
const REGION = 'europe-west1';
const VAPID_PUBLIC = defineString('CALENDAR_VAPID_PUBLIC_KEY', { default: '' });
const VAPID_CONTACT = defineString('CALENDAR_PUSH_CONTACT', { default: '' });
const VAPID_PRIVATE = defineSecret('CALENDAR_VAPID_PRIVATE_KEY');
const MAIL_FROM = defineString('CALENDAR_MAIL_FROM', { default: '' });
const SMTP_URL = defineSecret('CALENDAR_SMTP_URL');

exports.calendarControl = onCall({ region: REGION, maxInstances: 3, timeoutSeconds: 30 }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Bitte im Workspace anmelden.');
  const { uid, token } = request.auth;
  const db = getFirestore();
  const refs = calendarRefs(db);
  const profile = (await refs.users.doc(uid).get()).data();
  const role = workspaceRole(profile, token.email, token.email_verified === true);
  if (!role) throw new HttpsError('permission-denied', 'Der Kalender ist für das Workspace-Team verfügbar.');

  const store = createStore(db, { publicKey: VAPID_PUBLIC.value(), organizer: emailAddress(MAIL_FROM.value()) });
  const data = request.data || {};
  try {
    switch (data.action) {
      case 'config':
        return await store.configuration(role === 'admin');
      case 'settings':
        if (role !== 'admin') throw new HttpsError('permission-denied', 'Einladungsadressen kann ein Administrator ändern.');
        await store.saveSettings(data.addresses);
        return await store.configuration(true);
      case 'save':
        return await store.changeEvent(data, uid, false);
      case 'cancel':
        return await store.changeEvent(data, uid, true);
      case 'retry':
        return await store.retryInvitation(data.id);
      case 'push-enable':
        await store.enablePush(data, uid);
        return { enabled: true };
      case 'push-disable':
        await store.disablePush(data, uid);
        return { enabled: false };
      default:
        invalid('Diese Kalenderaktion ist unbekannt.');
    }
  } catch (error) {
    if (error instanceof CalendarError) throw new HttpsError(error.code, error.message);
    throw error;
  }
});

async function activeDeviceOwners(db, uids) {
  const userRefs = calendarRefs(db).users;
  const allowed = new Set();
  for (let offset = 0; offset < uids.length; offset += 100) {
    const requested = uids.slice(offset, offset + 100);
    const [accounts, profiles] = await Promise.all([
      getAuth().getUsers(requested.map(uid => ({ uid }))),
      db.getAll(...requested.map(uid => userRefs.doc(uid)))
    ]);
    const byId = new Map(profiles.map(snap => [snap.id, snap.data()]));
    for (const user of accounts.users) {
      if (!user.disabled && workspaceRole(byId.get(user.uid), user.email, user.emailVerified)) allowed.add(user.uid);
    }
  }
  return allowed;
}

const schedule = {
  region: REGION, schedule: '* * * * *', timeZone: 'Etc/UTC',
  timeoutSeconds: 120, maxInstances: 1, concurrency: 1
};

exports.calendarReminders = onSchedule({ ...schedule, secrets: [VAPID_PRIVATE] }, async () => {
  const contact = emailAddress(VAPID_CONTACT.value());
  const publicKey = VAPID_PUBLIC.value();
  if (!contact || !publicKey) throw new Error('Die Konfiguration für Kalender-Mitteilungen ist unvollständig.');
  const db = getFirestore();
  const vapidDetails = { subject: `mailto:${contact}`, publicKey, privateKey: VAPID_PRIVATE.value() };
  await deliverReminders(
    db,
    (subscription, payload, options) => webPush.sendNotification(subscription, payload, { ...options, vapidDetails, timeout: 8000 }),
    uids => activeDeviceOwners(db, uids)
  );
});

function mailTransport() {
  try {
    const url = new URL(SMTP_URL.value());
    if (!['smtp:', 'smtps:'].includes(url.protocol) || !url.hostname || !url.username || !url.password) throw new Error();
    const secure = url.protocol === 'smtps:';
    return nodemailer.createTransport({
      host: url.hostname,
      port: Number(url.port || (secure ? 465 : 587)),
      secure,
      requireTLS: !secure,
      auth: { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000
    });
  } catch (_) {
    throw new Error('Der SMTP-Zugang für Kalendereinladungen ist ungültig.');
  }
}

exports.calendarInvitations = onSchedule({ ...schedule, secrets: [SMTP_URL] }, async () => {
  if (!emailAddress(MAIL_FROM.value())) throw new Error('Die Absenderadresse für Kalendereinladungen fehlt.');
  const transport = mailTransport();
  await deliverInvitations(getFirestore(), message => transport.sendMail(message));
});
