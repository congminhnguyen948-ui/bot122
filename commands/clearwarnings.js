const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { clearWarnings } = require('../warningStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Xoá toàn bộ cảnh cáo của một thành viên')
    .addUserOption(option =>
      option.setName('thanhvien')
        .setDescription('Thành viên cần xoá cảnh cáo')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const target = interaction.options.getUser('thanhvien');
    const count = clearWarnings(interaction.guildId, target.id);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setDescription(
        count > 0
          ? `Đã xoá **${count}** cảnh cáo của <@${target.id}>.`
          : `<@${target.id}> không có cảnh cáo nào để xoá.`
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
