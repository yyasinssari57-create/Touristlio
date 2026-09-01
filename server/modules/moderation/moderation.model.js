const { db } = require('../../db');



async function pendingTiolas() {

  return await db.prepare(`

    SELECT t.*, u.name AS user_name, p.name AS place_name

    FROM tiolas t

    JOIN users u ON u.id = t.user_id

    LEFT JOIN places p ON p.id = t.place_id

    WHERE t.status = 'pending'

    ORDER BY t.created_at ASC

  `).all();

}



async function pendingBlogs() {

  return await db.prepare(`

    SELECT b.*, u.name AS user_name FROM blogs b

    JOIN users u ON u.id = b.user_id

    WHERE b.status = 'pending'

    ORDER BY b.created_at ASC

  `).all();

}



async function approveTiola(id, moderatorId) {

  return await db.prepare(`

    UPDATE tiolas SET status = 'approved', moderated_by = ?, moderated_at = datetime('now')

    WHERE id = ? AND status = 'pending'

  `).run(moderatorId, id);

}



async function rejectTiola(id, moderatorId) {

  return await db.prepare(`

    UPDATE tiolas SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now')

    WHERE id = ? AND status = 'pending'

  `).run(moderatorId, id);

}



async function approveBlog(id, moderatorId) {

  return await db.prepare(`

    UPDATE blogs SET status = 'approved', moderated_by = ?, moderated_at = datetime('now')

    WHERE id = ? AND status = 'pending'

  `).run(moderatorId, id);

}



async function rejectBlog(id, moderatorId) {

  return await db.prepare(`

    UPDATE blogs SET status = 'rejected', moderated_by = ?, moderated_at = datetime('now')

    WHERE id = ? AND status = 'pending'

  `).run(moderatorId, id);

}



module.exports = {

  pendingTiolas,

  pendingBlogs,

  approveTiola,

  rejectTiola,

  approveBlog,

  rejectBlog,

};

