require("dotenv").config();
const logger = require('./logger');
const { cleanupOrphanedUsers } = require('./cleanup_orphaned_users.js');

/**
 * اجرای خودکار پاکسازی کاربران orphaned
 */
async function autoCleanup() {
    console.log('🔄 شروع پاکسازی خودکار...');
    
    try {
        await cleanupOrphanedUsers();
        console.log('✅ پاکسازی خودکار کامل شد');
    } catch (error) {
        console.error('❌ خطا در پاکسازی خودکار:', error);
    }
}

// اجرای پاکسازی
autoCleanup();
