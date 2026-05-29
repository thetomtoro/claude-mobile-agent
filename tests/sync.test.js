const { buildSyncMessages } = require('../sync');

const fakeTranscript = {
  project: 'C:\\Users\\you\\project',
  messages: [
    { role: 'user', text: 'continue' },
    { role: 'claude', text: 'Done — here is the result.' },
  ],
};

// Loader stub that returns a transcript for a known id, null otherwise.
const loadFor = (knownId, transcript) => (id) =>
  id === knownId ? transcript : null;

test('replays the persisted transcript when a client reconnects after a finished response', () => {
  const msgs = buildSyncMessages({
    sessionId: 'abc',
    streaming: false,
    liveBuffer: '',
    loadSessionMessages: loadFor('abc', fakeTranscript),
  });

  expect(msgs).toEqual([
    { type: 'session-loaded', project: fakeTranscript.project, messages: fakeTranscript.messages },
  ]);
});

test('replays transcript plus buffered partial when reconnecting mid-response', () => {
  const msgs = buildSyncMessages({
    sessionId: 'abc',
    streaming: true,
    liveBuffer: 'thinking about it',
    loadSessionMessages: loadFor('abc', fakeTranscript),
  });

  expect(msgs).toEqual([
    { type: 'session-loaded', project: fakeTranscript.project, messages: fakeTranscript.messages },
    { type: 'start' },
    { type: 'chunk', data: 'thinking about it' },
  ]);
});

test('mid-response with no buffered text yet sends start but no empty chunk', () => {
  const msgs = buildSyncMessages({
    sessionId: 'abc',
    streaming: true,
    liveBuffer: '',
    loadSessionMessages: loadFor('abc', fakeTranscript),
  });

  expect(msgs).toEqual([
    { type: 'session-loaded', project: fakeTranscript.project, messages: fakeTranscript.messages },
    { type: 'start' },
  ]);
});

test('brand-new session with no transcript on disk replays nothing', () => {
  const msgs = buildSyncMessages({
    sessionId: 'fresh',
    streaming: false,
    liveBuffer: '',
    loadSessionMessages: loadFor('abc', fakeTranscript), // 'fresh' is unknown
  });

  expect(msgs).toEqual([]);
});

test('streaming brand-new session still announces the in-flight response', () => {
  const msgs = buildSyncMessages({
    sessionId: 'fresh',
    streaming: true,
    liveBuffer: 'half a sentence',
    loadSessionMessages: loadFor('abc', fakeTranscript),
  });

  expect(msgs).toEqual([
    { type: 'start' },
    { type: 'chunk', data: 'half a sentence' },
  ]);
});
