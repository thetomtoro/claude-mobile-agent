const fetch = require('node-fetch');

async function sendNotification(topic, title, message) {
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: { Title: title, 'Content-Type': 'text/plain' },
      body: message,
    });
  } catch (err) {
    console.error('[notify] failed:', err.message);
  }
}

module.exports = { sendNotification };
