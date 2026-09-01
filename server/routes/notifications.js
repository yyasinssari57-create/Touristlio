const express = require('express');
const { authRequired } = require('../middleware/auth');
const { parsePositiveInt } = require('../lib/sanitize');
const { ok, fail } = require('../lib/apiResponse');
const notifications = require('../lib/notifications');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  const unreadOnly = req.query.unread === '1';
  const items = await notifications.listForUser(req.user.id, { unreadOnly });
  return ok(res, { notifications: items });
});

router.post('/read-all', authRequired, async (req, res) => {
  await notifications.markAllRead(req.user.id);
  return ok(res, { read: true });
});

router.post('/:id/read', authRequired, async (req, res) => {
  const id = parsePositiveInt(req.params.id, res);
  if (!id) return;
  await notifications.markRead(id, req.user.id);
  return ok(res, { read: true });
});

module.exports = router;
