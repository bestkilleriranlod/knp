#!/bin/bash

# اسکریپت تنظیم Cron Job برای پاکسازی خودکار لاگ‌ها
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLEANUP_SCRIPT="$SCRIPT_DIR/cleanup_logs.sh"
DAYS_TO_KEEP=${1:-30}

echo "🔧 Setting up automatic log cleanup for KNP..."

# بررسی وجود فایل‌ها
if [ ! -f "$CLEANUP_SCRIPT" ]; then
    echo "❌ cleanup_logs.sh not found in $SCRIPT_DIR"
    exit 1
fi

# قابل اجرا کردن اسکریپت
chmod +x "$CLEANUP_SCRIPT"
echo "✅ Made cleanup script executable"

# ایجاد لاگ دایرکتوری
sudo mkdir -p /var/log
sudo touch /var/log/knp_cleanup.log
sudo chmod 666 /var/log/knp_cleanup.log
echo "✅ Created log directory and file"

# اضافه کردن Cron Job
CRON_JOB="0 2 * * * $CLEANUP_SCRIPT $DAYS_TO_KEEP >> /var/log/knp_cleanup.log 2>&1"

# بررسی وجود Cron Job قبلی
if crontab -l 2>/dev/null | grep -q "cleanup_logs.sh"; then
    echo "⚠️  Existing cron job found. Removing old one..."
    crontab -l 2>/dev/null | grep -v "cleanup_logs.sh" | crontab -
fi

# اضافه کردن Cron Job جدید
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo "✅ Cron job added successfully"
echo "📅 Logs will be cleaned daily at 2:00 AM"
echo "📊 Keeping logs for $DAYS_TO_KEEP days"
echo ""
echo "🔍 To check cron jobs: crontab -l"
echo "📋 To view logs: tail -f /var/log/knp_cleanup.log"
echo "🗑️  To remove cron job: crontab -e (then delete the line)"
