const { validateToken, authMiddleware } = require('../auth');

describe('validateToken', () => {
  test('returns true for matching token', () => {
    expect(validateToken('abc123', 'abc123')).toBe(true);
  });

  test('returns false for wrong token', () => {
    expect(validateToken('wrong', 'abc123')).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(validateToken(undefined, 'abc123')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(validateToken('', 'abc123')).toBe(false);
  });
});

describe('authMiddleware', () => {
  const config = { token: 'secret123' };
  const middleware = authMiddleware(config);

  function makeReq(query = {}, headers = {}) {
    return { query, headers };
  }
  function makeRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  }

  test('calls next() with valid query token', () => {
    const next = jest.fn();
    middleware(makeReq({ token: 'secret123' }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('calls next() with valid x-token header', () => {
    const next = jest.fn();
    middleware(makeReq({}, { 'x-token': 'secret123' }), makeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 401 with wrong token', () => {
    const res = makeRes();
    const next = jest.fn();
    middleware(makeReq({ token: 'wrong' }), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 with no token', () => {
    const res = makeRes();
    const next = jest.fn();
    middleware(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 with error body when token is wrong', () => {
    const res = makeRes();
    const next = jest.fn();
    middleware(makeReq({ token: 'wrong' }), res, next);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  test('throws if config.token is missing', () => {
    expect(() => authMiddleware({})).toThrow('authMiddleware requires config.token');
  });
});
