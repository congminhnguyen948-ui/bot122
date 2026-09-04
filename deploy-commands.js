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

    // Đăng ký lệnh riêng cho 1 server (GUILD_ID) để cập nhật NGAY LẬP TỨC.
    // Khi bot đã sẵn sàng dùng thực tế, có thể đổi sang Routes.applicationCommands(CLIENT_ID)
    // để đăng ký toàn cục (global) cho mọi server (mất tới 1 giờ để cập nhật).
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log('Đăng ký lệnh thành công!');
  } catch (error) {
    console.error(error);
  }
})();
