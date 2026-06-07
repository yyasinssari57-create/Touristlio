const { db } = require('../db');

function getTiolaLikeCount(tiolaId) {
  return db.prepare('SELECT COUNT(*) AS c FROM tiola_likes WHERE tiola_id = ?').get(tiolaId).c;
}

function getBlogLikeCount(blogId) {
  return db.prepare('SELECT COUNT(*) AS c FROM blog_likes WHERE blog_id = ?').get(blogId).c;
}

function userLikedTiola(userId, tiolaId) {
  if (!userId) return false;
  return !!db.prepare('SELECT 1 FROM tiola_likes WHERE user_id = ? AND tiola_id = ?').get(userId, tiolaId);
}

function userLikedBlog(userId, blogId) {
  if (!userId) return false;
  return !!db.prepare('SELECT 1 FROM blog_likes WHERE user_id = ? AND blog_id = ?').get(userId, blogId);
}

function toggleTiolaLike(userId, tiolaId) {
  const existing = db.prepare('SELECT 1 FROM tiola_likes WHERE user_id = ? AND tiola_id = ?').get(userId, tiolaId);
  if (existing) {
    db.prepare('DELETE FROM tiola_likes WHERE user_id = ? AND tiola_id = ?').run(userId, tiolaId);
    return { liked: false, count: getTiolaLikeCount(tiolaId) };
  }
  db.prepare('INSERT INTO tiola_likes (user_id, tiola_id) VALUES (?, ?)').run(userId, tiolaId);
  return { liked: true, count: getTiolaLikeCount(tiolaId) };
}

function toggleBlogLike(userId, blogId) {
  const existing = db.prepare('SELECT 1 FROM blog_likes WHERE user_id = ? AND blog_id = ?').get(userId, blogId);
  if (existing) {
    db.prepare('DELETE FROM blog_likes WHERE user_id = ? AND blog_id = ?').run(userId, blogId);
    return { liked: false, count: getBlogLikeCount(blogId) };
  }
  db.prepare('INSERT INTO blog_likes (user_id, blog_id) VALUES (?, ?)').run(userId, blogId);
  return { liked: true, count: getBlogLikeCount(blogId) };
}

function getUserTiolaLikeCount(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS c FROM tiola_likes tl
    JOIN tiolas t ON t.id = tl.tiola_id
    WHERE t.user_id = ? AND t.status = 'approved'
  `).get(userId).c;
}

function enrichTiolaLikes(row, userId) {
  const likeCount = getTiolaLikeCount(row.id);
  return {
    likeCount,
    likedByMe: userLikedTiola(userId, row.id),
  };
}

function enrichBlogLikes(row, userId) {
  const likeCount = getBlogLikeCount(row.id);
  return {
    likeCount,
    likedByMe: userLikedBlog(userId, row.id),
  };
}

module.exports = {
  getTiolaLikeCount,
  getBlogLikeCount,
  userLikedTiola,
  userLikedBlog,
  toggleTiolaLike,
  toggleBlogLike,
  getUserTiolaLikeCount,
  enrichTiolaLikes,
  enrichBlogLikes,
};
