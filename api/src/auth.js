const jwt = require('jsonwebtoken');
const { Router } = require('express');

const router = Router();

router.post('/login', (req, res) => {
  if (req.body.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
  res.json({ token });
});

function requireJwt(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireApiSecret(req, res, next) {
  if (req.headers.authorization !== `Bearer ${process.env.API_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireJwtOrApiSecret(req, res, next) {
  const header = req.headers.authorization;
  if (header === `Bearer ${process.env.API_SECRET}`) return next();
  return requireJwt(req, res, next);
}

module.exports = { router, requireJwt, requireApiSecret, requireJwtOrApiSecret };
