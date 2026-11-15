'use strict';

const { randomUUID } = require('node:crypto');
const { mailMessage } = require('./calendar-event');
const { calendarRefs } = require('./calendar-store');

const MAX_ATTEMPTS = 5;
const LEASE_MS = 180_000;

async function claim(db, ref) {
  return db.runTransaction(async tx => {
    const job = (await tx.get(ref)).data();
    const now = Date.now();
    if (!job || !Number.isFinite(job.runAt) || job.runAt > now) return null;
    const leased = { ...job, lease: randomUUID(), attempts: job.attempts + 1, runAt: now + LEASE_MS };
    tx.set(ref, leased);
    return leased;
  });
}

function withoutLease(job) {
  const { lease, runAt, ...data } = job;
  return data;
}

function retryTime(attempt) {
  return Date.now() + Math.min(15, 2 ** (attempt - 1)) * 60_000;
}

async function runQueue(db, queue, deliver) {
  const pending = await queue.where('runAt', '<=', Date.now()).orderBy('runAt').limit(20).get();
  for (let start = 0; start < pending.docs.length; start += 4) {
    const results = await Promise.allSettled(pending.docs.slice(start, start + 4).map(async snap => {
      const job = await claim(db, snap.ref);
      if (job) await deliver(snap.ref, job);
    }));
    if (results.some(result => result.status === 'rejected')) {
      console.warn('Kalenderwarteschlange: Ein Arbeitsschritt wird nach Ablauf der Sperre erneut versucht.');
    }
  }
}

async function deliverInvitations(db, sendMail) {
  const refs = calendarRefs(db);
  await runQueue(db, refs.invitations, async (ref, job) => {
    const eventRef = refs.events.doc(job.id);
    const [currentJob, currentEvent] = await db.getAll(ref, eventRef);
    if (currentJob.data()?.lease !== job.lease) return;

    let status = 'sent';
    if (currentEvent.data()?.mailRevision !== job.entry.revision) {
      status = 'obsolete';
    } else {
      try {
        const info = await sendMail(mailMessage(job));
        if (!info.accepted?.length) throw new Error('SMTP hat die Einladung nicht angenommen.');
      } catch (error) {
        status = job.attempts >= MAX_ATTEMPTS || Number(error.responseCode) >= 500 ? 'failed' : 'retry';
        console.warn('Kalendereinladung konnte nicht zugestellt werden.', { id: job.id, attempt: job.attempts, status });
      }
    }

    await db.runTransaction(async tx => {
      const [latestJob, latestEvent] = await tx.getAll(ref, eventRef);
      if (latestJob.data()?.lease !== job.lease) return;
      const entry = latestEvent.data();
      if (status === 'obsolete' || entry?.mailRevision !== job.entry.revision) {
        tx.delete(ref);
      } else if (status === 'retry') {
        tx.set(ref, { ...withoutLease(job), runAt: retryTime(job.attempts) });
      } else {
        tx.update(eventRef, { mailStatus: { ...entry.mailStatus, [job.person]: status } });
        if (status === 'failed') tx.set(ref, { ...withoutLease(job), failed: true });
        else tx.delete(ref);
      }
    });
  });
}

async function removeExpiredSubscription(db, snap) {
  await db.runTransaction(async tx => {
    const latest = await tx.get(snap.ref);
    if (latest.exists && latest.updateTime.isEqual(snap.updateTime)) tx.delete(snap.ref);
  });
}

async function deliverReminders(db, sendPush, activeOwners) {
  const refs = calendarRefs(db);
  let availableDevices;
  async function devices() {
    if (!availableDevices) {
      availableDevices = refs.subscriptions.get().then(async snapshot => {
        const allowed = await activeOwners([...new Set(snapshot.docs.map(snap => snap.data().uid))]);
        return snapshot.docs.filter(snap => allowed.has(snap.data().uid));
      });
    }
    return availableDevices;
  }

  await runQueue(db, refs.reminders, async (ref, job) => {
    const eventRef = refs.events.doc(job.id);
    const entry = (await eventRef.get()).data();
    let status = 'obsolete';
    const delivered = new Set(job.delivered);
    if (entry?.status === 'active' && entry.reminderRevision === job.revision) {
      status = entry.reminderExpiresAt <= Date.now() ? 'expired' : 'no-devices';
      if (status !== 'expired') {
        let softFailure = false;
        let hardFailure = false;
        for (const source of await devices()) {
          if (delivered.has(source.id)) continue;
          const [latestJob, device] = await db.getAll(ref, source.ref);
          if (latestJob.data()?.lease !== job.lease) return;
          if (!device.exists || device.data().uid !== source.data().uid) continue;
          const remaining = entry.reminderExpiresAt - Date.now();
          if (remaining <= 0) break;

          const time = entry.allDay ? 'Ganztägiger Termin' : `${entry.startTime} Uhr`;
          const payload = {
            title: entry.title,
            body: `${time} · ${entry.date.split('-').reverse().join('.')}`,
            id: entry.id, day: entry.date
          };
          try {
            await sendPush(device.data().subscription, JSON.stringify(payload), {
              TTL: Math.max(1, Math.floor(remaining / 1000)),
              topic: entry.id.replace(/-/g, '').slice(0, 32),
              urgency: 'high'
            });
            delivered.add(device.id);
          } catch (error) {
            const code = Number(error.statusCode);
            if ([404, 410].includes(code)) await removeExpiredSubscription(db, device);
            else if (!code || code === 429 || code >= 500) softFailure = true;
            else hardFailure = true;
          }
        }
        const retryAt = retryTime(job.attempts);
        if (softFailure && job.attempts < MAX_ATTEMPTS && retryAt < entry.reminderExpiresAt) status = 'retry';
        else if (softFailure || hardFailure) status = delivered.size ? 'partial' : 'failed';
        else if (delivered.size) status = 'sent';
        else if (entry.reminderExpiresAt <= Date.now()) status = 'expired';
      }
    }

    await db.runTransaction(async tx => {
      const [latestJob, latestEvent] = await tx.getAll(ref, eventRef);
      if (latestJob.data()?.lease !== job.lease) return;
      const current = latestEvent.data();
      if (status === 'obsolete' || current?.reminderRevision !== job.revision || current.status !== 'active') {
        tx.delete(ref);
      } else if (status === 'retry') {
        tx.set(ref, { ...withoutLease(job), delivered: [...delivered], runAt: retryTime(job.attempts) });
      } else {
        tx.update(eventRef, { reminderStatus: status });
        tx.delete(ref);
      }
    });
  });
}

module.exports = { deliverInvitations, deliverReminders };
