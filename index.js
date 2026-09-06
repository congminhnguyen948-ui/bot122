require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const { incrementCount } = require('./commandTracker');
const { addWarning } = require('./warningStore');
const { recordOverLimit, jailUserInChannel, MUTE_DURATION_MS } = require('./jailSystem');

// Cấu hình: các cách dùng lệnh "bj" cần theo dõi và ngưỡng số lần để tự động cảnh cáo
const TRACKED_PREFIX_COMMANDS = ['!bj', '!blackjack']; // Các lệnh gõ tay cần theo dõi
const TRACKED_SLASH_COMMAND_NAMES = ['bj', 'blackjack']; // Tên lệnh slash cần theo dõi (không phân biệt hoa/thường)
const WARN_THRESHOLD = 5; // Số lần chơi miễn phí, từ lần thứ (WARN_THRESHOLD + 1) trở đi sẽ bị xóa lệnh + cảnh báo
const JAIL_AFTER_WARNINGS = 2; // Số lần cảnh báo (trong cùng 1 kênh) trước khi bị bỏ tù

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('ready', () => {
  console.log(`Bot đã đăng nhập với tên: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const errorMsg = { content: 'Có lỗi xảy ra khi chạy lệnh này.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMsg);
    } else {
      await interaction.reply(errorMsg);
    }
  }
});

/**
 * Tăng số lần dùng lệnh "bj" của 1 user.
 * - 5 lần đầu: cho chơi bình thường, không nhắc gì.
 * - Từ lần thứ 6 trở đi: xóa tin nhắn lệnh (nếu có thể), gửi cảnh báo "chơi quá tay".
 * - Khi đã bị cảnh báo đủ JAIL_AFTER_WARNINGS (2) lần TRONG CÙNG 1 KÊNH:
 *   bỏ tù (khóa quyền chat) người đó trong kênh đó, trong MUTE_DURATION_MS (100 phút).
 */
async function trackBjUsage({ guild, userId, channel, message }) {
  const key = 'bj';
  const count = incrementCount(guild.id, userId, key);

  // Vẫn trong hạn mức miễn phí, cho chơi bình thường
  if (count <= WARN_THRESHOLD) return;

  // Từ lần thứ (WARN_THRESHOLD + 1) trở đi: xóa lệnh nếu có thể
  if (message && message.deletable) {
    try {
      await message.delete();
    } catch (err) {
      console.error('Không thể xóa tin nhắn lệnh bj:', err.message);
    }
  }

  const { warning, total } = addWarning(guild.id, userId, {
    moderatorId: client.user.id,
    reason: `Tự động cảnh cáo: đã dùng lệnh bj (blackjack) ${count} lần, vượt quá giới hạn ${WARN_THRESHOLD} lần`,
    timestamp: Date.now(),
  });

  const overLimitCount = recordOverLimit(guild.id, channel.id, userId);

  const embed = new EmbedBuilder()
    .setColor(0xff5555)
    .setTitle('🔒 Chơi bài quá tay rồi đó!')
    .setDescription(`<@${userId}> đã chơi \`bj\` quá ${WARN_THRESHOLD} lần rồi, coi chừng bị tù à nha!`)
    .addFields(
      { name: 'Số lần dùng lệnh bj', value: `${count}`, inline: true },
      { name: 'Số lần cảnh báo (kênh này)', value: `${overLimitCount}/${JAIL_AFTER_WARNINGS}`, inline: true },
      { name: 'Tổng số cảnh cáo (server)', value: `${total}`, inline: true },
    )
    .setFooter({ text: `Mã cảnh cáo: ${warning.id}` })
    .setTimestamp();

  if (channel && channel.send) {
    await channel.send({ embeds: [embed] });
  }

  if (overLimitCount >= JAIL_AFTER_WARNINGS) {
    await jailUserInChannel(channel, userId, guild);
    await channel.send(
