/**
 * jailSystem.js
 * Xử lý "bỏ tù" (mute theo kênh) cho người chơi bj/blackjack quá tay.
 */

const MUTE_DURATION_MS = 100 * 60 * 1000; // 100 phút

const overLimitCounts = new Map();
const currentlyJailed = new Map();

function keyOf(guildId, channelId, userId) {
  return `${guildId}-${channelId}-${userId}`;
}

function recordOverLimit(guildId, channelId, userId) {
  const key = keyOf(guildId, channelId, userId);
  const count = (overLimitCounts.get(key) || 0) + 1;
  overLimitCounts.set(key, count);
  return count;
}

function resetOverLimit(guildId, channelId, userId) {
  overLimitCounts.delete(keyOf(guildId, channelId, userId));
}

function isJailed(guildId, channelId, userId) {
  return !!currentlyJailed.get(keyOf(guildId, channelId, userId));
}

async function jailUserInChannel(channel, userId, guild) {
  const key = keyOf(guild.id, channel.id, userId);
  if (currentlyJailed.get(key)) return;
  currentlyJailed.set(key, true);

  const existingOverwrite = channel.permissionOverwrites.cache.get(userId);
  const hadOverwrite = !!existingOverwrite;

  try {
    await channel.permissionOverwrites.edit(userId, {
      SendMessages: false,
      AddReactions: false,
    });
  } catch (err) {
    console.error('Không thể bỏ tù (set permission overwrite):', err);
    currentlyJailed.delete(key);
    return;
  }

  setTimeout(async () => {
    try {
      if (hadOverwrite) {
        await channel.permissionOverwrites.edit(userId, {
          SendMessages: null,
          AddReactions: null,
        }).catch(() => {});
      } else {
        await channel.permissionOverwrites.delete(userId).catch(() => {});
      }
      await channel.send(
        `🔓 <@${userId}> đã mãn hạn tù rồi đó! Được thả tự do trong kênh này, chơi ngoan nha, đừng để bị bắt lại! 😌`
      ).catch(() => {});
    } finally {
      currentlyJailed.delete(key);
      resetOverLimit(guild.id, channel.id, userId);
    }
  }, MUTE_DURATION_MS);
}

module.exports = {
  recordOverLimit,
  resetOverLimit,
  isJailed,
  jailUserInChannel,
  MUTE_DURATION_MS,
};
