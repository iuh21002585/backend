# IUH_PLAGCHECK Worker System

## Tổng quan

Hệ thống worker cho ứng dụng IUH_PLAGCHECK dùng để xử lý các tác vụ nền như kiểm tra đạo văn, gửi email thông báo và xử lý các file có kích thước lớn.

## Các loại queue

1. **thesisQueue**: Xử lý các công việc liên quan đến luận văn (phân tích, kiểm tra đạo văn)
2. **notificationQueue**: Xử lý các thông báo (gửi email, push notification)

## Cài đặt

```bash
# Cài đặt các dependencies
npm install

# Chạy worker độc lập (nếu muốn tách riêng khỏi API)
npm run worker

# Chạy worker trong môi trường development
npm run worker:dev
```

## Cấu hình

Các cài đặt cần thiết:

- **REDIS_URL**: URL kết nối đến Redis server (định dạng: `redis://username:password@host:port`)
- **MONGO_URI**: Connection string đến MongoDB
- **EMAIL_USER**, **EMAIL_PASS**, **EMAIL_HOST**, **EMAIL_PORT**: Cài đặt email để gửi thông báo

## Tích hợp

Trong ứng dụng IUH_PLAGCHECK, workers được tích hợp trực tiếp vào server API, không cần chạy quy trình riêng biệt.

## Monitoring

Hệ thống cung cấp các endpoint để giám sát hoạt động của queue:

- `GET /api/queues/stats`: Thống kê số lượng công việc trong queue
- `GET /api/queues/pending`: Danh sách các công việc đang chờ xử lý
- `GET /api/queues/failed`: Danh sách các công việc thất bại
- `POST /api/queues/retry/:id`: Thử lại một công việc thất bại
- `DELETE /api/queues/:id`: Xóa một công việc khỏi queue

## Troubleshooting

Một số lỗi thường gặp:

1. **Lỗi kết nối Redis**: Kiểm tra REDIS_URL và đảm bảo máy chủ Redis hoạt động
2. **Lỗi kết nối MongoDB**: Kiểm tra MONGO_URI và đảm bảo MongoDB hoạt động
3. **Worker bị treo**: Kiểm tra logs và xem các công việc đã stalled
