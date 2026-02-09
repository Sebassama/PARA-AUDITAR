// src/middleware/adminKey.js
require('dotenv').config();

module.exports = function adminKey(req, res, next) {
  const sent = req.headers['x-admin-key'] || req.query.admin_key;
  if (!process.env.ADMIN_KEY) return next(); // sin llave, sin validar
  if (sent !== process.env.ADMIN_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
};
