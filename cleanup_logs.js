require('dotenv').config();
const { MongoClient } = require('mongodb');

async function cleanupLogs(daysToKeep = 30) {
    const client = new MongoClient('mongodb://mongo-knp:27017');
    
    try {
        console.log('Connecting to MongoDB...');
        await client.connect();
        const db = client.db('KN_PANEL');
        const logs = db.collection('logs');
        
        const cutoffTime = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
        
        console.log(`🧹 Starting log cleanup...`);
        console.log(`📅 Keeping logs newer than ${daysToKeep} days`);
        console.log(`⏰ Cutoff time: ${new Date(cutoffTime * 1000).toLocaleString('fa-IR')}`);
        
        // شمارش لاگ‌های قدیمی
        const oldLogsCount = await logs.countDocuments({ time: { $lt: cutoffTime } });
        console.log(`📊 Found ${oldLogsCount} old logs to delete`);
        
        if (oldLogsCount > 0) {
            console.log('🗑️  Deleting old logs...');
            const result = await logs.deleteMany({ time: { $lt: cutoffTime } });
            console.log(`✅ Successfully deleted ${result.deletedCount} old logs`);
        } else {
            console.log('ℹ️  No old logs found to delete');
        }
        
        // نمایش آمار باقی‌مانده
        const remainingCount = await logs.countDocuments();
        console.log(`📈 Remaining logs: ${remainingCount}`);
        
        // نمایش آمار بر اساس نوع
        const syslogCount = await logs.countDocuments({ is_syslog: 1 });
        const normalLogsCount = await logs.countDocuments({ is_syslog: { $ne: 1 } });
        console.log(`📋 System logs: ${syslogCount}`);
        console.log(`📋 Normal logs: ${normalLogsCount}`);
        
    } catch (err) {
        console.error('❌ Error during cleanup:', err);
        process.exit(1);
    } finally {
        await client.close();
        console.log('🔌 Database connection closed');
    }
}

// اجرای پاکسازی
const daysToKeep = process.argv[2] ? parseInt(process.argv[2]) : 30;

if (isNaN(daysToKeep) || daysToKeep < 1) {
    console.error('❌ Invalid number of days. Please provide a positive integer.');
    process.exit(1);
}

console.log(`🚀 Starting log cleanup with ${daysToKeep} days retention...`);
cleanupLogs(daysToKeep);
