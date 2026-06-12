import { describe, expect, it } from 'vitest';
import { normalizeEvent, redactConfig, serviceAccountEmail, type GcalConfig } from './gcal';

const cfg: GcalConfig = {
  serviceAccountJson: JSON.stringify({
    type: 'service_account',
    client_email: 'timer@proj.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nSECRETSECRET\n-----END PRIVATE KEY-----\n',
  }),
  readCalendarIds: ['me@gmail.com'],
  pushCalendarId: 'abc@group.calendar.google.com',
};

describe('redactConfig', () => {
  it('never leaks the private key', () => {
    const out = JSON.stringify(redactConfig(cfg));
    expect(out).not.toContain('private_key');
    expect(out).not.toContain('SECRETSECRET');
    expect(out).not.toContain('serviceAccountJson');
  });

  it('exposes metadata for the settings UI', () => {
    expect(redactConfig(cfg)).toEqual({
      configured: true,
      clientEmail: 'timer@proj.iam.gserviceaccount.com',
      readCalendarIds: ['me@gmail.com'],
      pushCalendarId: 'abc@group.calendar.google.com',
    });
  });

  it('handles the unconfigured case', () => {
    expect(redactConfig(null)).toEqual({ configured: false });
  });
});

describe('serviceAccountEmail', () => {
  it('returns null on malformed JSON', () => {
    expect(serviceAccountEmail({ ...cfg, serviceAccountJson: 'not json' })).toBeNull();
  });
});

describe('normalizeEvent', () => {
  it('normalizes a timed event', () => {
    expect(
      normalizeEvent(
        { id: 'e1', summary: 'Standup', start: { dateTime: '2026-06-08T09:00:00+02:00' }, end: { dateTime: '2026-06-08T09:30:00+02:00' } },
        'me@gmail.com',
      ),
    ).toEqual({ id: 'e1', calendarId: 'me@gmail.com', title: 'Standup', start: '2026-06-08T09:00:00+02:00', end: '2026-06-08T09:30:00+02:00', allDay: false });
  });

  it('normalizes an all-day event', () => {
    expect(
      normalizeEvent({ id: 'e2', summary: 'Trip', start: { date: '2026-06-08' }, end: { date: '2026-06-10' } }, 'me@gmail.com'),
    ).toEqual({ id: 'e2', calendarId: 'me@gmail.com', title: 'Trip', start: '2026-06-08', end: '2026-06-10', allDay: true });
  });

  it('drops cancelled events and events without times, and defaults the title', () => {
    expect(normalizeEvent({ id: 'e3', status: 'cancelled', start: { date: '2026-06-08' }, end: { date: '2026-06-09' } }, 'c')).toBeNull();
    expect(normalizeEvent({ id: 'e4' }, 'c')).toBeNull();
    expect(normalizeEvent({ id: 'e5', start: { date: '2026-06-08' }, end: { date: '2026-06-09' } }, 'c')?.title).toBe('(no title)');
  });
});
