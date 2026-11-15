'use strict';

const { createHash } = require('node:crypto');
const {
  CalendarError, PEOPLE, invalid, eventId, emailAddress, normalizeEvent, invitationChanged, sameEvent
} = require('./calendar-event');

const ORG = 'doggystyle';
const OWNER = 'raphael@boch-plan.de';

function workspaceRole(profile, email, verified) {
  if (verified && email?.toLowerCase() === OWNER) return 'admin';
  return ['admin', 'staff'].includes(profile?.role) ? profile.role : '';
}

function subscriptionEndpoint(value) {
  const allowed = ['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com'];
  let url;
  try { url = typeof value === 'string' && value.length < 2048 ? new URL(value) : null; } catch (_) { url = null; }
  if (!url || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
      !allowed.includes(url.hostname) || url.pathname === '/') {
    invalid('Dieses Gerät hat keine unterstützte Mitteilungsverbindung.');
  }
  return url.href;
}

function subscriptionData(value) {
  const endpoint = subscriptionEndpoint(value?.endpoint);
  const keys = {};
  for (const [name, length] of [['p256dh', 65], ['auth', 16]]) {
    const key = value?.keys?.[name];
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{20,90}={0,2}$/.test(key)) invalid('Die Mitteilungsverbindung ist ungültig.');
    const decoded = Buffer.from(key, 'base64url');
    if (decoded.length !== length || (name === 'p256dh' && decoded[0] !== 4)) invalid('Die Mitteilungsverbindung ist ungültig.');
    keys[name] = decoded.toString('base64url');
  }
  return { endpoint, keys };
}

function subscriptionId(endpoint) {
  return createHash('sha256').update(endpoint).digest('hex');
}

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalid('Die Terminversion ist ungültig.');
  return value;
}

function concurrentChange() {
  throw new CalendarError('aborted', 'Der Termin wurde auf einem anderen Gerät geändert. Öffne ihn erneut.');
}

function calendarRefs(db) {
  const org = db.collection('orgs').doc(ORG);
  return {
    users: org.collection('users'),
    events: org.collection('calendarEvents'),
    settings: org.collection('calendarSettings').doc('defaults'),
    routing: org.collection('calendarEventRouting'),
    subscriptions: org.collection('calendarPushSubscriptions'),
    reminders: org.collection('calendarReminderQueue'),
    invitations: org.collection('calendarInvitationQueue')
  };
}

function settingsAddresses(input) {
  const addresses = {};
  for (const person of Object.keys(PEOPLE)) {
    const value = input?.[person];
    if (typeof value !== 'string' || (value.trim() && !emailAddress(value))) {
      invalid(`Bitte eine gültige E-Mail-Adresse für ${PEOPLE[person]} eingeben.`);
    }
    addresses[person] = emailAddress(value);
  }
  return addresses;
}

function invitationRecipients(addresses) {
  const seen = new Set();
  return Object.fromEntries(Object.entries(addresses).filter(([, email]) => {
    const address = email.toLowerCase();
    if (seen.has(address)) return false;
    seen.add(address);
    return true;
  }));
}

function createStore(db, { publicKey, organizer }) {
  const refs = calendarRefs(db);

  async function configuration(admin) {
    const saved = (await refs.settings.get()).data() || {};
    const addresses = { raphael: emailAddress(saved.raphael), anschi: emailAddress(saved.anschi) };
    return {
      admin,
      pushKey: publicKey,
      mailReady: !!organizer,
      inviteReady: !!(organizer && addresses.raphael && addresses.anschi),
      ...(admin ? { addresses } : {})
    };
  }

  async function changeEvent(data, uid, cancel) {
    const id = eventId(data.id);
    const expected = revision(data.revision);
    const requested = cancel ? null : normalizeEvent(data.event || {});
    const eventRef = refs.events.doc(id);
    const routingRef = refs.routing.doc(id);
    const reminderRef = refs.reminders.doc(id);

    return db.runTransaction(async tx => {
      const previous = (await tx.get(eventRef)).data();
      if (previous?.status === 'canceled') {
        if (cancel) return previous;
        concurrentChange();
      }
      if (!previous && cancel) throw new CalendarError('not-found', 'Der Termin wurde nicht gefunden.');
      if (!cancel && previous && sameEvent(previous, requested)) return previous;
      if ((previous?.revision || 0) !== expected) concurrentChange();
      if (requested?.reminderAt != null && !publicKey) {
        throw new CalendarError('failed-precondition', 'Workspace-Erinnerungen müssen zuerst in Firebase eingerichtet werden.');
      }

      const now = Date.now();
      const next = {
        ...previous, ...(cancel ? { invite: false } : requested),
        id, revision: expected + 1, status: cancel ? 'canceled' : 'active',
        createdAt: previous?.createdAt || now, createdBy: previous?.createdBy || uid,
        updatedAt: now, updatedBy: uid
      };
      const sendsInvite = next.invite && invitationChanged(previous, next);
      const cancelsInvite = !next.invite && previous?.invite;
      if (sendsInvite || cancelsInvite) {
        let routing = (await tx.get(routingRef)).data();
        if (!routing) {
          const addresses = (await tx.get(refs.settings)).data() || {};
          if (!organizer || !emailAddress(addresses.raphael) || !emailAddress(addresses.anschi)) {
            throw new CalendarError('failed-precondition', 'Für Einladungen fehlt der Absender oder eine der beiden E-Mail-Adressen.');
          }
          routing = {
            organizer,
            recipients: invitationRecipients({ raphael: addresses.raphael, anschi: addresses.anschi })
          };
          tx.set(routingRef, routing);
        }
        next.mailRevision = next.revision;
        next.mailMethod = sendsInvite ? 'REQUEST' : 'CANCEL';
        next.mailStatus = {};
        for (const [person, recipient] of Object.entries(routing.recipients)) {
          next.mailStatus[person] = 'pending';
          tx.set(refs.invitations.doc(`${id}-${person}`), {
            id, person, recipient, organizer: routing.organizer, method: next.mailMethod,
            update: !!previous?.invite, runAt: now, attempts: 0,
            entry: {
              id, revision: next.revision, updatedAt: now, title: next.title, notes: next.notes,
              date: next.date, allDay: next.allDay, startTime: next.startTime, endTime: next.endTime,
              startMs: next.startMs, endMs: next.endMs
            }
          });
        }
      }

      if (!previous || cancel || previous.reminderAt !== next.reminderAt ||
          previous.reminderExpiresAt !== next.reminderExpiresAt) {
        next.reminderRevision = next.revision;
        const pending = !cancel && next.reminderAt !== null && now < next.reminderExpiresAt;
        next.reminderStatus = pending ? 'pending' : (cancel || next.reminderAt === null ? 'none' : 'expired');
        if (pending) {
          tx.set(reminderRef, {
            id, revision: next.reminderRevision, runAt: Math.max(now, next.reminderAt),
            attempts: 0, delivered: []
          });
        } else {
          tx.delete(reminderRef);
        }
      }
      tx.set(eventRef, next);
      return next;
    });
  }

  async function retryInvitation(id) {
    const ref = refs.events.doc(eventId(id));
    return db.runTransaction(async tx => {
      const entry = (await tx.get(ref)).data();
      if (!entry) throw new CalendarError('not-found', 'Der Termin wurde nicht gefunden.');
      const keys = Object.keys(PEOPLE).filter(person => entry.mailStatus?.[person] === 'failed');
      const jobs = await Promise.all(keys.map(person => tx.get(refs.invitations.doc(`${id}-${person}`))));
      const status = { ...entry.mailStatus };
      for (const snap of jobs) {
        const job = snap.data();
        if (job?.entry.revision !== entry.mailRevision || !job.failed) continue;
        tx.set(snap.ref, { ...job, failed: false, attempts: 0, runAt: Date.now() });
        status[job.person] = 'pending';
      }
      tx.update(ref, { mailStatus: status });
      return { ...entry, mailStatus: status };
    });
  }

  async function enablePush(data, uid) {
    if (!publicKey) throw new CalendarError('failed-precondition', 'Die Mitteilungen sind in Firebase noch nicht eingerichtet.');
    const subscription = subscriptionData(data.subscription);
    await refs.subscriptions.doc(subscriptionId(subscription.endpoint)).set({
      uid, subscription, updatedAt: Date.now()
    });
  }

  async function disablePush(data, uid) {
    const ref = refs.subscriptions.doc(subscriptionId(subscriptionEndpoint(data.endpoint)));
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).data()?.uid === uid) tx.delete(ref);
    });
  }

  return {
    configuration, changeEvent, retryInvitation, enablePush, disablePush,
    async saveSettings(input) { await refs.settings.set(settingsAddresses(input)); }
  };
}

module.exports = { calendarRefs, workspaceRole, createStore };
