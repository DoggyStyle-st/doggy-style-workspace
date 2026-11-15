'use strict';

const { DateTime } = require('luxon');

const ZONE = 'Europe/Berlin';
const REMINDER_MINUTES = new Set([0, 15, 60, 1440]);
const PEOPLE = { raphael: 'Raphael', anschi: 'Anschi' };
const EDITABLE_FIELDS = ['title', 'date', 'allDay', 'startTime', 'endTime', 'notes'];

class CalendarError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function invalid(message) {
  throw new CalendarError('invalid-argument', message);
}

function eventId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{20,48}$/.test(value)) {
    invalid('Die Termin-ID ist ungültig.');
  }
  return value;
}

function emailAddress(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim();
  if (email.length > 254 || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i.test(email)) return '';
  return email;
}

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('Bitte ein gültiges Datum auswählen.');
  const date = DateTime.fromISO(value, { zone: ZONE });
  if (!date.isValid || date.year < 1900) invalid('Bitte ein gültiges Datum auswählen.');
  return date;
}

function timeOn(date, value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) invalid('Bitte Start und Ende eingeben.');
  const time = DateTime.fromISO(`${date.toISODate()}T${value}`, { zone: ZONE });
  if (!time.isValid || time.toFormat('HH:mm') !== value) invalid('Diese Uhrzeit gibt es am gewählten Datum wegen der Zeitumstellung nicht.');
  return time.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis())[0];
}

function normalizeEvent(data) {
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const notes = typeof data.notes === 'string' ? data.notes.trim().replace(/\r\n?/g, '\n') : '';
  if (!title || title.length > 120 || /[\x00-\x1f\x7f]/.test(title)) invalid('Bitte einen Titel mit bis zu 120 Zeichen eingeben.');
  if (notes.length > 1200 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(notes)) invalid('Die Notiz darf bis zu 1.200 Zeichen umfassen.');
  const date = calendarDate(data.date);
  if (typeof data.allDay !== 'boolean' || typeof data.invite !== 'boolean') invalid('Bitte Terminoptionen prüfen.');
  const { allDay, invite, reminderMinutes } = data;
  if (reminderMinutes !== null && !REMINDER_MINUTES.has(reminderMinutes)) invalid('Bitte eine Erinnerungszeit auswählen.');
  const start = allDay ? date : timeOn(date, data.startTime);
  const end = allDay ? date.plus({ days: 1 }) : timeOn(date, data.endTime);
  if (end <= start) invalid('Das Ende muss nach dem Beginn liegen.');

  // Ganztägige Erinnerungen orientieren sich an 09:00 Uhr am ersten Tag.
  const reminderBase = allDay ? date.set({ hour: 9 }) : start;
  const reminderAt = reminderMinutes === null ? null : (
    reminderMinutes === 1440 ? reminderBase.minus({ days: 1 }) : reminderBase.minus({ minutes: reminderMinutes })
  ).toMillis();
  return {
    title, notes, date: data.date, allDay, invite,
    startTime: allDay ? '' : data.startTime,
    endTime: allDay ? '' : data.endTime,
    startMs: start.toMillis(), endMs: end.toMillis(), reminderMinutes, reminderAt,
    reminderExpiresAt: reminderBase.plus({ minutes: 5 }).toMillis()
  };
}

function invitationChanged(previous, next) {
  return !previous || previous.invite !== next.invite || EDITABLE_FIELDS.some(field => previous[field] !== next[field]);
}

function sameEvent(previous, next) {
  return !invitationChanged(previous, next) && previous.reminderMinutes === next.reminderMinutes;
}

function icalText(value) {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function foldLine(line) {
  let result = '';
  let size = 0;
  for (const character of line) {
    const bytes = Buffer.byteLength(character);
    if (size + bytes > 75) {
      result += '\r\n ';
      size = 1;
    }
    result += character;
    size += bytes;
  }
  return result;
}

function icalUtc(ms) {
  return DateTime.fromMillis(ms, { zone: 'utc' }).toFormat("yyyyMMdd'T'HHmmss'Z'");
}

function makeInvite({ entry, organizer, recipient, method }) {
  const canceled = method === 'CANCEL';
  const startLine = entry.allDay
    ? `DTSTART;VALUE=DATE:${entry.date.replaceAll('-', '')}`
    : `DTSTART:${icalUtc(entry.startMs)}`;
  const endLine = entry.allDay
    ? `DTEND;VALUE=DATE:${calendarDate(entry.date).plus({ days: 1 }).toFormat('yyyyMMdd')}`
    : `DTEND:${icalUtc(entry.endMs)}`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Doggy Style Workspace//Kalender//DE',
    `METHOD:${method}`, 'BEGIN:VEVENT',
    `UID:${entry.id}@doggy-style-workspace`, `SEQUENCE:${entry.revision - 1}`, `DTSTAMP:${icalUtc(entry.updatedAt)}`,
    startLine, endLine, `SUMMARY:${icalText(entry.title)}`,
    `DESCRIPTION:${icalText(entry.notes)}`,
    `ORGANIZER;CN=Doggy Style Workspace:mailto:${organizer}`,
    canceled
      ? `ATTENDEE:mailto:${recipient}`
      : `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${recipient}`,
    `STATUS:${canceled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT', 'END:VCALENDAR'
  ].map(foldLine).join('\r\n') + '\r\n';
}

function mailMessage(job) {
  const { entry, organizer, recipient, method } = job;
  const kind = method === 'CANCEL' ? 'Termin abgesagt' : (job.update ? 'Termin aktualisiert' : 'Einladung zum Termin');
  const date = calendarDate(entry.date).setLocale('de').toFormat('cccc, dd.MM.yyyy');
  const time = entry.allDay ? 'ganztägig' : `${entry.startTime}–${entry.endTime} Uhr`;
  return {
    from: { name: 'Doggy Style Workspace', address: organizer },
    to: recipient,
    subject: `${kind} · ${entry.title}`,
    text: [kind, entry.title, `${date}, ${time}`, entry.notes].filter(Boolean).join('\n\n'),
    messageId: `<${entry.id}.${entry.revision}.${job.person}@${organizer.split('@').pop()}>`,
    icalEvent: { filename: 'termin.ics', method, content: makeInvite(job) }
  };
}

module.exports = {
  CalendarError, PEOPLE, ZONE, invalid, eventId, emailAddress, normalizeEvent,
  invitationChanged, sameEvent, mailMessage
};
