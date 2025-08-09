# Amnezia VPN Management Wrapper

یک سیستم مدیریت VPN بر پایه Amnezia AWG با قابلیت‌های پیشرفته و error handling بهبود یافته.

## ویژگی‌های اصلی

- مدیریت کاربران و اشتراک‌ها
- همگام‌سازی خودکار کانفیگوریشن
- مدیریت ترافیک و محدودیت‌ها
- API سازگار با Marzban
- بکاپ خودکار
- مانیتورینگ و لاگ‌گذاری پیشرفته

## پیش‌نیازها

- Node.js >= 16.0.0
- MongoDB
- Docker (برای AWG container)
- Python 3 (برای decoder)

## نصب

1. نصب dependencies:
```bash
npm install
```

2. کپی کردن فایل محیطی:
```bash
cp .env.example .env
```

3. ویرایش فایل `.env` و تنظیم متغیرهای مورد نیاز

4. اجرای سرور:
```bash
npm start
```

5. اجرای sync process:
```bash
npm run sync
```

## استفاده

### راه‌اندازی سرور
```bash
# Development mode
npm run dev

# Production mode
npm start
```

### راه‌اندازی sync
```bash
# Development mode
npm run sync-dev

# Production mode  
npm run sync
```

### ری‌استارت AWG Container
```bash
npm run restart-awg
```

### بررسی سازگاری یوزرها
```bash
npm run check-users
```

### پاکسازی یوزرهای ناسازگار
```bash
npm run cleanup-users
```

## API Endpoints

- `POST /api/admin/token` - دریافت token مدیریت
- `GET /api/system` - وضعیت سیستم
- `POST /api/user` - ایجاد کاربر جدید
- `GET /api/user/:username` - دریافت اطلاعات کاربر
- `PUT /api/user/:username` - ویرایش کاربر
- `DELETE /api/user/:username` - حذف کاربر
- `POST /sub` - دریافت subscription URL

## Error Handling بهبود یافته

- بررسی null/undefined objects
- مدیریت بهتر xtables locks
- retry mechanism برای عملیات ناموفق
- logging پیشرفته

## مشکلات برطرف شده

✅ Cannot read properties of null (reading 'connection_uuids')
✅ Cannot read properties of undefined (reading 'replace')  
✅ Another app is currently holding the xtables lock
✅ No such container errors
✅ Configuration parsing errors در WireGuard

## لایسنس

MIT 