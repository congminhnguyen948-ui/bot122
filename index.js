require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const { incrementCount } = require('./commandTracker');
const { addWarning } = require('./warningStore');

// Cấu hình: các cách dùng lệnh "bj" cần theo dõi và ngưỡng số lần để tự động cảnh cáo
const TRACKED_PREFIX_COMMAND = '!bj';      // Lệnh gõ tay, ví dụ: !bj
const TRACKED_SLASH_COMMAND_NAMES = ['bj', 'blackjack']; // Tên lệnh slash cần theo dõi (không phân biệt hoa/thường)
const WARN_THRESHOLD = 5;

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
 * Tăng số lần dùng lệnh "bj" của 1 user, và tự động cảnh cáo nếu đủ ngưỡng.
 * key dùng chung cho cả gõ tay lẫn slash, để cộng dồn thành 1 số đếm duy nhất.
 */
async function trackBjUsage({ guild, userId, channel }) {
  const key = 'bj';
  const count = incrementCount(guild.id, userId, key);

  if (count % WARN_THRESHOLD !== 0) return;

  const { warning, total } = addWarning(guild.id, userId, {
    moderatorId: client.user.id,
    reason: `Tự động cảnh cáo: đã dùng lệnh bj (blackjack) ${count} lần`,
    timestamp: Date.now(),
  });

  const embed = new EmbedBuilder()
    .setColor(0xff5555)
    .setTitle('⚠️ Tự động cảnh cáo')
    .addFields(
      { name: 'Thành viên', value: `<@${userId}>`, inline: true },
      { name: 'Số lần dùng lệnh bj', value: `${count}`, inline: true },
      { name: 'Tổng số cảnh cáo', value: `${total}`, inline: true },
    )
    .setFooter({ text: `Mã cảnh cáo: ${warning.id}` })
    .setTimestamp();

  if (channel && channel.send) {
    await channel.send({ embeds: [embed] });
  }

  try {
    const member = await guild.members.fetch(userId);
    await member.send(
      `Bạn đã bị tự động cảnh cáo trong server **${guild.name}** vì dùng lệnh bj quá ${WARN_THRESHOLD} lần liên tiếp.\nTổng số cảnh cáo hiện tại: ${total}`
    );
  } catch {
    // Người dùng tắt DM hoặc không tìm thấy, bỏ qua
  }
}

client.on('messageCreate', async message => {
  if (!message.guild) return;

  // Trường hợp 1: chính người dùng tự gõ lệnh (ví dụ: !bj)
  if (!message.author.bot) {
    const content = message.content.trim().toLowerCase();
    if (content.startsWith(TRACKED_PREFIX_COMMAND)) {
      await trackBjUsage({ guild: message.guild, userId: message.author.id, channel: message.channel });
    }
    return;
  }

  // Trường hợp 2: tin nhắn trả lời từ 1 bot khác (như UnbelievaBoat) cho 1 lệnh slash /bj
  // Discord đính kèm thông tin "ai đã gọi lệnh gì" vào message.interaction
  const interactionInfo = message.interaction ?? message.interactionMetadata;
  if (interactionInfo && interactionInfo.commandName) {
    const cmdName = interactionInfo.commandName.toLowerCase();
    const isTracked = TRACKED_SLASH_COMMAND_NAMES.some(name => cmdName === name || cmdName.startsWith(name + ' '));
    if (isTracked) {
      const invokerId = interactionInfo.user?.id;
      if (invokerId) {
        await trackBjUsage({ guild: message.guild, userId: invokerId, channel: message.channel });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
