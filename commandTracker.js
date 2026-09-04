const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'command-counts.json');

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
 * Tăng số lần dùng lệnh của 1 user trong 1 guild, trả về tổng số lần mới
 * key: tên lệnh cần theo dõi, ví dụ "!bj"
 */
function incrementCount(guildId, userId, key) {
  const data = readData();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = {};
  if (!data[guildId][userId][key]) data[guildId][userId][key] = 0;

  data[guildId][userId][key] += 1;
  writeData(data);
  return data[guildId][userId][key];
}

/**
 * Xem số lần hiện tại (không tăng)
 */
function getCount(guildId, userId, key) {
  const data = readData();
  return (data[guildId] && data[guildId][userId] && data[guildId][userId][key]) || 0;
}

/**
 * Reset số lần của 1 user cho 1 lệnh cụ thể
 */
function resetCount(guildId, userId, key) {
  const data = readData();
  if (data[guildId] && data[guildId][userId] && data[guildId][userId][key] !== undefined) {
    data[guildId][userId][key] = 0;
    writeData(data);
  }
}

module.exports = { incrementCount, getCount, resetCount };
