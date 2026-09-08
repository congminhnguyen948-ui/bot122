require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, EmbedBuilder, Partials } = require('discord.js');
const { addWarning } = require('./warningStore');
const { recordOverLimit, jailUserInChannel, MUTE_DURATION_MS } = require('./jailSystem');
const { incrementDailyPlayCount } = require('./playCounter');

// Lưu lại "chữ ký" kết quả ván bj gần nhất đã đếm cho mỗi tin nhắn (message.id),
// để không đếm trùng khi Discord gửi nhiều sự kiện update cho cùng 1 kết quả,
// và để phân biệt "vẫn đang chơi (Hit/Stand)" với "đã kết thúc ván (có kết quả)".
const trackedHandSignatures = new Map();

/**
 * Kiểm tra tin nhắn có phải là embed ván bj (kiểu UnbelievaBoat) hay không,
 * dựa vào NỘI DUNG embed ("Your Hand" / "Dealer Hand") thay vì tên lệnh —
 * vì khi bấm nút "Play Again"/"Hit"/"Stand", tin nhắn mới/được sửa có thể
 * không còn giữ tên lệnh gốc "bj" trong dữ liệu interaction.
 */
function isBjEmbedMessage(message) {
  return (message.embeds || []).some(embed => {
    const text = [
      embed.description || '',
      ...(embed.fields || []).map(f => `${f.name} ${f.value}`),
    ].join(' ');
    return /your hand/i.test(text) && /dealer hand/i.test(text);
  });
}

/**
 * Trích "chữ ký" của 1 ván bj từ embed tin nhắn (ví dụ của UnbelievaBoat):
 * chỉ trả về giá trị khi ván đã có KẾT QUẢ (Win/Loss/Push...), null nếu ván
 * còn đang chơi dở (vừa Hit/Stand, chưa ra kết quả).
 */
function extractBjResultSignature(message) {
  for (const embed of message.embeds || []) {
    const fields = embed.fields || [];
    const resultField = fields.find(f => /result/i.test(f.name));
    const hasResultInDescription = embed.description && /result/i.test(embed.description);
    if (!resultField && !hasResultInDescription) continue;

    const yourHand = fields.find(f => /your hand/i.test(f.name));
    const dealerHand = fields.find(f => /dealer hand/i.test(f.name));
    return [
      resultField ? resultField.value : embed.description,
      yourHand ? yourHand.value : '',
      dealerHand ? dealerHand.value : '',
    ].join('|');
  }
  return null;
}

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
  partials: [Partials.Message, Partials.Channel],
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
 *
 * @param {object} params
 * @param {import('discord.js').Guild} params.guild
 * @param {string} params.userId
 * @param {import('discord.js').TextChannel} params.channel
 * @param {import('discord.js').Message} [params.message] - tin nhắn gốc gõ lệnh, nếu có thể xóa được
 */
async function trackBjUsage({ guild, userId, channel, message }) {
  const count = incrementDailyPlayCount(guild.id, userId); // lưu file -> không mất khi bot restart

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
    .setDescription(`<@${userId}> đã chơi \`bj\` quá ${WARN_THRESHOLD} lần hôm nay rồi, coi chừng bị tù à nha!`)
    .addFields(
      { name: 'Số lần dùng lệnh bj (hôm nay)', value: `${count}`, inline: true },
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

  // Trường hợp 1: chính người dùng tự gõ lệnh (ví dụ: !bj)
  if (!message.author.bot) {
    const content = message.content.trim().toLowerCase();
    const matchesPrefix = TRACKED_PREFIX_COMMANDS.some(cmd => content.startsWith(cmd));
    if (matchesPrefix) {
      await trackBjUsage({
        guild: message.guild,
        userId: message.author.id,
        channel: message.channel,
        message, // cho phép trackBjUsage xóa tin nhắn này nếu vượt hạn mức
      });
    }
    return;
  }

  // Trường hợp 2: tin nhắn từ 1 bot khác (như UnbelievaBoat) hiển thị ván bj
  // Nhận diện qua NỘI DUNG embed (Your Hand/Dealer Hand), không dựa vào tên lệnh,
  // vì tin nhắn sinh ra từ việc bấm nút (Play Again/Hit/Stand) không giữ tên lệnh gốc.
  if (isBjEmbedMessage(message)) {
    const signature = extractBjResultSignature(message);
    if (signature) {
      const interactionInfo = message.interaction ?? message.interactionMetadata;
      const invokerId = interactionInfo?.user?.id;
      if (invokerId) {
        trackedHandSignatures.set(message.id, signature);
        // Không có tin nhắn gốc của user để xóa (đây là tin nhắn của bot khác)
        await trackBjUsage({ guild: message.guild, userId: invokerId, channel: message.channel });
      }
    }
  }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  try {
    if (newMessage.partial) newMessage = await newMessage.fetch();
  } catch (err) {
    console.error('Không thể fetch tin nhắn đã chỉnh sửa:', err.message);
    return;
  }

  if (!newMessage.guild) return;
  if (!newMessage.author?.bot) return;

  // Bắt lúc người chơi bấm "Hit"/"Stand" và bot khác SỬA lại tin nhắn cũ
  // (trường hợp không tạo tin nhắn mới mà chỉ edit) — nhận diện qua nội dung embed.
  if (!isBjEmbedMessage(newMessage)) return;

  const signature = extractBjResultSignature(newMessage);
  if (!signature) return; // ván chưa kết thúc (vừa Hit/Stand), chưa tính là 1 lượt

  const lastSignature = trackedHandSignatures.get(newMessage.id);
  if (lastSignature === signature) return; // ván này đã được đếm rồi, tránh đếm trùng
  trackedHandSignatures.set(newMessage.id, signature);

  const interactionInfo = newMessage.interaction ?? newMessage.interactionMetadata;
  const invokerId = interactionInfo?.user?.id;
  if (invokerId) {
    await trackBjUsage({ guild: newMessage.guild, userId: invokerId, channel: newMessage.channel });
  }
});

client.login(process.env.DISCORD_TOKEN);
