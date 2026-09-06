require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const { incrementCount } = require('./commandTracker');
const { addWarning } = require('./warningStore');
const { recordOverLimit, jailUserInChannel, MUTE_DURATION_MS } = require('./jailSystem');

const TRACKED_PREFIX_COMMANDS = ['!bj', '!blackjack'];
const TRACKED_SLASH_COMMAND_NAMES = ['bj', 'blackjack'];
const WARN_THRESHOLD = 5;
const JAIL_AFTER_WARNINGS = 2;

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

async function trackBjUsage({ guild, userId, channel, message }) {
  const key = 'bj';
  const count = incrementCount(guild.id, userId, key);

  if (count <= WARN_THRESHOLD) return;

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
      `🚨 <@${userId}> đã bị cảnh báo đủ ${JAIL_AFTER_WARNINGS} lần vì chơi bài quá tay.\n` +
      `**BỊ PHẠT TÙ ${MUTE_DURATION_MS / 60000} PHÚT** trong kênh này! Hãy chơi ngoan để tránh bị tù nhé! 🔒`
    );
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

  if (!message.author.bot) {
    const content = message.content.trim().toLowerCase();
    const matchesPrefix = TRACKED_PREFIX_COMMANDS.some(cmd => content.startsWith(cmd));
    if (matchesPrefix) {
      await trackBjUsage({
        guild: message.guild,
        userId: message.author.id,
        channel: message.channel,
        message,
      });
    }
    return;
  }

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
