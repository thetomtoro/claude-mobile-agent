const crypto = require('crypto');

function validateToken(provided, expected) {
  if (typeof provided !== 'string' || provided.length === 0) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false; // catches mismatched buffer lengths
  }
}

function authMiddleware(config) {
  if (!config || !config.token) {
    throw new Error('authMiddleware requires config.token');
  }
  return (req, res, next) => {
    const token = req.query.token || req.headers['x-token'];
    if (!validateToken(token, config.token)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };
}

module.exports = { validateToken, authMiddleware };
