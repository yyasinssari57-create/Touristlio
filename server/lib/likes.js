const { db } = require('../db');

async function getTiolaLikeCount(tiolaId) {
  return (await db.prepare('SELECT COUNT(*) AS c FROM tiola_likes WHERE tiola_id = ?').get(tiolaId)).c;
}

async function getBlogLikeCount(blogId) {
  return (await db.prepare('SELECT COUNT(*) AS c FROM blog_likes WHERE blog_id = ?').get(blogId)).c;
}

async function userLikedTiola(userId, tiolaId) {
  if (!userId) return false;
  return !!await db.prepare('SELECT 1 FROM tiola_likes WHERE user_id = ? AND tiola_id = ?').get(userId, tiolaId);
}

async function userLikedBlog(userId, blogId) {
  if (!userId) return false;
  return !!await db.prepare('SELECT 1 FROM blog_likes WHERE user_id = ? AND blog_id = ?').get(userId, blogId);
}

async function toggleTiolaLike(userId, tiolaId) {
  const existing = await db.prepare('SELECT 1 FROM tiola_likes WHERE user_id = ? AND tiola_id = ?').get(userId, tiolaId);
  if (existing) {
    await db.prepare('DELETE FROM tiola_likes WHERE user_id = ? AND tiola_id = ?').run(userId, tiolaId);
    return { liked: false, count: await getTiolaLikeCount(tiolaId) };
  }
  await db.prepare('INSERT INTO tiola_likes (user_id, tiola_id) VALUES (?, ?)').run(userId, tiolaId);
  return { liked: true, count: await getTiolaLikeCount(tiolaId) };
}

async function toggleBlogLike(userId, blogId) {
  const existing = await db.prepare('SELECT 1 FROM blog_likes WHERE user_id = ? AND blog_id = ?').get(userId, blogId);
  if (existing) {
    await db.prepare('DELETE FROM blog_likes WHERE user_id = ? AND blog_id = ?').run(userId, blogId);
    return { liked: false, count: await getBlogLikeCount(blogId) };
  }
  await db.prepare('INSERT INTO blog_likes (user_id, blog_id) VALUES (?, ?)').run(userId, blogId);
  return { liked: true, count: await getBlogLikeCount(blogId) };
}

async function getUserTiolaLikeCount(userId) {
  return (await db.prepare(`
    SELECT COUNT(*) AS c FROM tiola_likes tl
    JOIN tiolas t ON t.id = tl.tiola_id
    WHERE t.user_id = ? AND t.status = 'approved'
  `).get(userId)).c;
}

async function enrichTiolaLikes(row, userId) {
  const likeCount = await getTiolaLikeCount(row.id);
  return {
    likeCount,
    likedByMe: await userLikedTiola(userId, row.id),
  };
}

async function enrichBlogLikes(row, userId) {
  const likeCount = await getBlogLikeCount(row.id);
  return {
    likeCount,
    likedByMe: await userLikedBlog(userId, row.id),
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
