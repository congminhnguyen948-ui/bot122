require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Đang đăng ký ${commands.length} lệnh...`);

    // Đăng ký lệnh TOÀN CỤC (global) — hoạt động ở MỌI server bot được mời vào,
    // không cần cấu hình GUILD_ID hay chạy lại lệnh này mỗi khi thêm server mới.
    // Lưu ý: có thể mất tới 1 giờ để Discord cập nhật lệnh trên toàn bộ server.
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log('Đăng ký lệnh thành công!');
  } catch (error) {
    console.error(error);
  }
})();
