jest.mock('node-fetch');
const fetch = require('node-fetch');
const { sendNotification } = require('../notify');

describe('sendNotification', () => {
  beforeEach(() => {
    fetch.mockReset();
    fetch.mockResolvedValue({ ok: true });
  });

  test('POSTs to correct ntfy URL', async () => {
    await sendNotification('my-topic', 'Test Title', 'Test message');
    expect(fetch).toHaveBeenCalledWith(
      'https://ntfy.sh/my-topic',
      expect.objectContaining({ method: 'POST', body: 'Test message' })
    );
  });

  test('includes Title header', async () => {
    await sendNotification('topic', 'My Title', 'body');
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Title: 'My Title' }),
      })
    );
  });

  test('does not throw on network error', async () => {
    fetch.mockRejectedValue(new Error('Network error'));
    await expect(sendNotification('topic', 'title', 'msg')).resolves.toBeUndefined();
  });
});
