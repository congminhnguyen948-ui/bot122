const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { addWarning } = require('../warningStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Cảnh cáo một thành viên')
    .addUserOption(option =>
      option.setName('thanhvien')
        .setDescription('Thành viên cần cảnh cáo')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('lydo')
        .setDescription('Lý do cảnh cáo')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('thanhvien');
    const reason = interaction.options.getString('lydo') || 'Không có lý do';
    const moderator = interaction.user;

    if (target.id === moderator.id) {
      return interaction.reply({ content: 'Bạn không thể tự cảnh cáo chính mình.', ephemeral: true });
    }
    if (target.bot) {
      return interaction.reply({ content: 'Không thể cảnh cáo bot.', ephemeral: true });
    }

    const { warning, total } = addWarning(interaction.guildId, target.id, {
      moderatorId: moderator.id,
      reason,
      timestamp: Date.now(),
    });

    const embed = new EmbedBuilder()
      .setColor(0xffcc00)
      .setTitle('⚠️ Đã cảnh cáo thành viên')
      .addFields(
        { name: 'Thành viên', value: `<@${target.id}>`, inline: true },
        { name: 'Người phạt', value: `<@${moderator.id}>`, inline: true },
        { name: 'Tổng số cảnh cáo', value: `${total}`, inline: true },
        { name: 'Lý do', value: reason },
      )
      .setFooter({ text: `Mã cảnh cáo: ${warning.id}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Gửi tin nhắn riêng cho thành viên bị cảnh cáo (nếu họ cho phép DM)
    try {
      await target.send(
        `Bạn đã bị cảnh cáo trong server **${interaction.guild.name}**.\nLý do: ${reason}\nTổng số cảnh cáo hiện tại: ${total}`
      );
    } catch {
      // Người dùng tắt DM, bỏ qua không báo lỗi
    }
  },
};
