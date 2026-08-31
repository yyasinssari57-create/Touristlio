function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data, error: null });
}

function fail(res, message, status = 400, extra) {
  const body = { success: false, data: null, error: message };
  if (extra && typeof extra === 'object') Object.assign(body, extra);
  return res.status(status).json(body);
}

module.exports = { ok, fail };
