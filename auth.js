function validateToken(provided, expected) {
  return typeof provided === 'string' && provided.length > 0 && provided === expected;
}

function authMiddleware(config) {
  return (req, res, next) => {
    const token = req.query.token || req.headers['x-token'];
    if (!validateToken(token, config.token)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };
}

module.exports = { validateToken, authMiddleware };
