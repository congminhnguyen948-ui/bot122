
/**
 * playCounter.js
 * Đếm số lượt chơi "bj" của mỗi thành viên, TÍNH THEO NGÀY (00h giờ Việt Nam).
 *
 * Khác với đếm trong RAM (bị mất mỗi khi bot restart/redeploy), dữ liệu ở đây
 * được LƯU RA FILE trên đĩa (data/bjPlayCounts.json), nên số lượt chơi sẽ
 * KHÔNG bị mất khi bot khởi động lại — chỉ tự động về 0 khi sang ngày mới.
 *
 * LƯU Ý QUAN TRỌNG khi host trên Railway:
 * Theo mặc định, mỗi lần bạn deploy code mới (push lên GitHub), Railway sẽ
 * dựng lại container từ đầu — nghĩa là file này vẫn có thể bị mất nếu bạn
 * KHÔNG gắn "Volume" (ổ đĩa lưu trữ bền vững) cho service trên Railway.
 * Để dữ liệu sống sót qua cả việc redeploy code, cần vào Railway → Service →
 * Settings → Volumes → tạo 1 Volume, mount vào đường dẫn "/app/data".
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.BJ_DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bjPlayCounts.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '{}', 'utf8');
  }
}

function readData() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error('Không đọc được file đếm lượt chơi bj, tạo lại dữ liệu trống:', err.message);
    return {};
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Trả về chuỗi ngày hiện tại (YYYY-MM-DD) theo giờ Việt Nam.
 */
function getTodayKeyVN() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

/**
 * Tăng và trả về số lượt chơi bj HÔM NAY của 1 user trong 1 server.
 * Tự động "reset" về 0 khi sang ngày mới, vì mỗi ngày là 1 dòng dữ liệu riêng.
 */
function incrementDailyPlayCount(guildId, userId) {
  const data = readData();
  const dateKey = getTodayKeyVN();
  const recordKey = `${guildId}-${userId}`;

  if (!data[recordKey] || data[recordKey].date !== dateKey) {
    data[recordKey] = { date: dateKey, count: 0 };
  }
  data[recordKey].count += 1;

  writeData(data);
  return data[recordKey].count;
}

module.exports = { incrementDailyPlayCount, getTodayKeyVN };
