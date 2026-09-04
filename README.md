# Discord Warn Bot

Bot Discord đơn giản dùng để cảnh cáo (warn) thành viên và lưu lại lịch sử cảnh cáo.

## Các lệnh

| Lệnh | Mô tả |
|---|---|
| `/warn thanhvien lydo` | Cảnh cáo một thành viên, có ghi lý do (tuỳ chọn) |
| `/warnings thanhvien` | Xem toàn bộ lịch sử cảnh cáo của thành viên |
| `/clearwarnings thanhvien` | Xoá toàn bộ cảnh cáo của thành viên |

Chỉ thành viên có quyền **Moderate Members** (Kiểm duyệt thành viên) mới dùng được các lệnh trên.

Lịch sử cảnh cáo được lưu trong `data/warnings.json` — không mất khi bot restart.

## Cài đặt

### 1. Tạo bot Discord

1. Vào https://discord.com/developers/applications → **New Application**
2. Vào tab **Bot** → **Add Bot** → copy **Token** (giữ bí mật, không share cho ai)
3. Vào tab **OAuth2 > URL Generator**:
   - Scopes: chọn `bot` và `applications.commands`
   - Bot Permissions: chọn `Moderate Members`, `Send Messages`, `Embed Links`
   - Copy URL tạo ra, mở bằng trình duyệt để mời bot vào server của bạn
4. Lấy **Application ID** (CLIENT_ID) ở tab **General Information**
5. Lấy **Server ID** (GUILD_ID): bật Developer Mode trong Discord (Settings > Advanced), sau đó chuột phải vào server > Copy Server ID

### 2. Cấu hình

```bash
cd discord-warn-bot
npm install
cp .env.example .env
```

Mở file `.env` và điền `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` bạn vừa lấy ở bước 1.

### 3. Đăng ký lệnh & chạy bot

```bash
npm run deploy   # Đăng ký các lệnh slash lên server Discord (chỉ cần chạy khi thêm/sửa lệnh)
npm start        # Khởi động bot
```

Nếu mọi thứ đúng, console sẽ hiện `Bot đã đăng nhập với tên: ...` và bạn có thể gõ `/warn` trong server để thử.

## Mở rộng thêm

- Muốn có thêm lệnh `mute`, `kick`, `ban`? Chỉ cần tạo file mới trong thư mục `commands/` theo mẫu của `warn.js`.
- Muốn tự động mute/kick sau N lần cảnh cáo? Có thể thêm logic đó trong `warn.js` sau khi tính được `total`.
