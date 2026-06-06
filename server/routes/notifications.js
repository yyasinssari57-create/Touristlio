const express = require('express');
const { authRequired } = require('../middleware/auth');
const { parsePositiveInt } = require('../lib/sanitize');
const { ok, fail } = require('../lib/apiResponse');
const notifications = require('../lib/notifications');

const router = express.Router();

router.get('/', authRequired, (req, res) => {
  const unreadOnly = req.query.unread === '1';
  const items = notifications.listForUser(req.user.id, { unreadOnly });
  return ok(res, { notifications: items });
});

router.post('/read-all', authRequired, (req, res) => {
  notifications.markAllRead(req.user.id);
  return ok(res, { read: true });
});

router.post('/:id/read', authRequired, (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  notifications.markRead(id, req.user.id);
  return ok(res, { read: true });
});

module.exports = router;
