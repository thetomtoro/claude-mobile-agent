// Decides what a freshly (re)connected client needs in order to catch up to the
// current conversation state. Pure function so it can be tested without sockets.
//
// - A client that reconnects after a response finished gets the persisted
//   transcript replayed (the in-flight stream it missed is now on disk).
// - A client that reconnects mid-response gets the transcript (completed turns)
//   plus a `start` and the buffered partial text of the turn still in flight,
//   then continues receiving live chunks.
function buildSyncMessages({ sessionId, streaming, liveBuffer, loadSessionMessages }) {
  const messages = [];

  const loaded = sessionId ? loadSessionMessages(sessionId) : null;
  if (loaded) {
    messages.push({
      type: 'session-loaded',
      project: loaded.project,
      messages: loaded.messages,
    });
  }

  if (streaming) {
    messages.push({ type: 'start' });
    if (liveBuffer) messages.push({ type: 'chunk', data: liveBuffer });
  }

  return messages;
}

module.exports = { buildSyncMessages };
