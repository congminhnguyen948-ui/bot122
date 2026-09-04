const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getWarnings } = require('../warningStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Xem lịch sử cảnh cáo của một thành viên')
    .addUserOption(option =>
      option.setName('thanhvien')
        .setDescription('Thành viên cần xem')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('thanhvien');
    const list = getWarnings(interaction.guildId, target.id);

    if (list.length === 0) {
      return interaction.reply({ content: `<@${target.id}> chưa từng bị cảnh cáo.`, ephemeral: true });
    }

    const lines = list.map((w, i) => {
      const date = new Date(w.timestamp).toLocaleString('vi-VN');
      return `**${i + 1}.** [${date}] bởi <@${w.moderatorId}> — ${w.reason} (mã: ${w.id})`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`Lịch sử cảnh cáo của ${target.username}`)
      .setDescription(lines.join('\n').slice(0, 4000))
      .setFooter({ text: `Tổng cộng: ${list.length} lần` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
