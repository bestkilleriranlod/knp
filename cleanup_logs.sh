#!/bin/bash

# تنظیمات
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAYS_TO_KEEP=${1:-30}
LOG_FILE="/var/log/knp_cleanup.log"

# تابع لاگ
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_message "🧹 Starting KNP log cleanup process..."

# بررسی وجود Node.js
if ! command -v node &> /dev/null; then
    log_message "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

# بررسی وجود فایل اسکریپت
if [ ! -f "$SCRIPT_DIR/cleanup_logs.js" ]; then
    log_message "❌ cleanup_logs.js not found in $SCRIPT_DIR"
    exit 1
fi

# اجرای پاکسازی
log_message "📅 Cleaning logs older than $DAYS_TO_KEEP days..."
cd "$SCRIPT_DIR"

# اجرای اسکریپت Node.js
node cleanup_logs.js "$DAYS_TO_KEEP" 2>&1 | while IFS= read -r line; do
    log_message "$line"
done

# بررسی نتیجه
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    log_message "✅ Log cleanup completed successfully"
else
    log_message "❌ Log cleanup failed"
    exit 1
fi

log_message "🏁 Cleanup process finished"
