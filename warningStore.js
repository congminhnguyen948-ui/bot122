const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'warnings.json');

// Đảm bảo file dữ liệu tồn tại
function ensureFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
  }
}

function readData() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/**
 * Thêm một cảnh cáo mới cho user trong 1 guild
 */
function addWarning(guildId, userId, { moderatorId, reason, timestamp }) {
  const data = readData();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = [];

  const warning = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    moderatorId,
    reason: reason || 'Không có lý do',
    timestamp,
  };

  data[guildId][userId].push(warning);
  writeData(data);
  return { warning, total: data[guildId][userId].length };
}

/**
 * Lấy danh sách cảnh cáo của 1 user trong 1 guild
 */
function getWarnings(guildId, userId) {
  const data = readData();
  return (data[guildId] && data[guildId][userId]) || [];
}

/**
 * Xoá toàn bộ cảnh cáo của 1 user trong 1 guild
 */
function clearWarnings(guildId, userId) {
  const data = readData();
  if (data[guildId] && data[guildId][userId]) {
    const count = data[guildId][userId].length;
    delete data[guildId][userId];
    writeData(data);
    return count;
  }
  return 0;
}

module.exports = { addWarning, getWarnings, clearWarnings };
