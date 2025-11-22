require("dotenv").config();
const mongoose = require('mongoose');
const { 
    get_wg0_interface, 
    get_amnezia_clients_table, 
    replace_wg0_interface, 
    replace_amnezia_clients_table,
    sync_configs,
    get_amnezia_container_id,
    exec_on_container,
    User,
    sync_xray_from_db,
} = require('./utils.js');

// اتصال به دیتابیس
mongoose.connect('mongodb://127.0.0.1:27017/knaw');

// استفاده از User تعریف شده در utils.js

/**
 * چک کردن و حذف کاربران orphaned از فایل کانفیگ Amnezia
 */
async function cleanupOrphanedUsers() {
        console.log('🔍 شروع بررسی کاربران orphaned...');
    
    try {
        // دریافت لیست کاربران از دیتابیس
        const dbUsers = await User.find({}, 'username public_key');
        const usernamesToCleanupXray = new Set();
        const dbUsernames = dbUsers.map(user => user.username);
        const dbPublicKeys = dbUsers.map(user => user.public_key);
        
        console.log(`📊 تعداد کاربران در دیتابیس: ${dbUsernames.length}`);
        
        // دریافت فایل کانفیگ WireGuard
        const interface = await get_wg0_interface();
        const interfaceLines = interface.split('\n');
        
        // دریافت clients table
        const clientsTable = await get_amnezia_clients_table();
        const clientsUsernames = clientsTable.map(item => item.userData.clientName);
        
        console.log(`📊 تعداد کاربران در clients table: ${clientsUsernames.length}`);
        
        // پیدا کردن کاربران orphaned در clients table
        const orphanedClients = clientsTable.filter(item => 
            !dbUsernames.includes(item.userData.clientName)
        );
        
        console.log(`🗑️  تعداد کاربران orphaned در clients table: ${orphanedClients.length}`);
        
        if (orphanedClients.length > 0) {
            console.log('📋 کاربران orphaned در clients table:');
            orphanedClients.forEach(client => {
                console.log(`   - ${client.userData.clientName}`);
            });
            
            // حذف کاربران orphaned از clients table
            const cleanedClientsTable = clientsTable.filter(item => 
                dbUsernames.includes(item.userData.clientName)
            );
            for(const item of orphanedClients){
                if(item && item.userData && item.userData.clientName){
                    usernamesToCleanupXray.add(item.userData.clientName);
                }
            }
            
            await replace_amnezia_clients_table(JSON.stringify(cleanedClientsTable, null, 4));
            console.log('✅ کاربران orphaned از clients table حذف شدند');
        }
        
        // پیدا کردن کاربران orphaned در فایل کانفیگ WireGuard (شامل کامنت‌شده‌ها)
        const orphanedInConfig = [];
        let currentPeer = null;
        let peerLines = [];
        
        for (let i = 0; i < interfaceLines.length; i++) {
            const line = interfaceLines[i];
            
            // شروع یک peer جدید (عادی یا کامنت‌شده)
            if (line.trim() === '[Peer]' || line.trim() === '#[Peer]') {
                if (currentPeer && peerLines.length > 0) {
                    // بررسی peer قبلی
                    const hasValidPublicKey = peerLines.some(peerLine => {
                        const trimmedLine = peerLine.trim();
                        return (trimmedLine.startsWith('PublicKey = ') || trimmedLine.startsWith('#PublicKey = ')) && 
                               dbPublicKeys.includes(trimmedLine.split(' = ')[1]);
                    });
                    
                    if (!hasValidPublicKey) {
                        orphanedInConfig.push({
                            startIndex: currentPeer.startIndex,
                            lines: peerLines
                        });
                    }
                }
                
                currentPeer = { startIndex: i };
                peerLines = [line];
            } else if (currentPeer && (line.startsWith('PublicKey = ') || 
                                    line.startsWith('#PublicKey = ') ||
                                    line.startsWith('PresharedKey = ') || 
                                    line.startsWith('#PresharedKey = ') ||
                                    line.startsWith('AllowedIPs = ') || 
                                    line.startsWith('#AllowedIPs = ') ||
                                    line.startsWith('Endpoint = ') || 
                                    line.startsWith('#Endpoint = ') ||
                                    line.startsWith('PersistentKeepalive = ') ||
                                    line.startsWith('#PersistentKeepalive = '))) {
                peerLines.push(line);
            } else if (currentPeer && (line.startsWith('[') || line.trim() === '')) {
                // پایان peer
                if (peerLines.length > 0) {
                    const hasValidPublicKey = peerLines.some(peerLine => {
                        const trimmedLine = peerLine.trim();
                        return (trimmedLine.startsWith('PublicKey = ') || trimmedLine.startsWith('#PublicKey = ')) && 
                               dbPublicKeys.includes(trimmedLine.split(' = ')[1]);
                    });
                    
                    if (!hasValidPublicKey) {
                        orphanedInConfig.push({
                            startIndex: currentPeer.startIndex,
                            lines: peerLines
                        });
                    }
                }
                currentPeer = null;
                peerLines = [];
            }
        }
        
        // بررسی آخرین peer
        if (currentPeer && peerLines.length > 0) {
            const hasValidPublicKey = peerLines.some(peerLine => {
                const trimmedLine = peerLine.trim();
                return (trimmedLine.startsWith('PublicKey = ') || trimmedLine.startsWith('#PublicKey = ')) && 
                       dbPublicKeys.includes(trimmedLine.split(' = ')[1]);
            });
            
            if (!hasValidPublicKey) {
                orphanedInConfig.push({
                    startIndex: currentPeer.startIndex,
                    lines: peerLines
                });
            }
        }

        for(const peer of orphanedInConfig){
            const publicKeyLine = peer.lines.find(line => 
                line.trim().startsWith('PublicKey = ') || line.trim().startsWith('#PublicKey = ')
            );
            const pk = publicKeyLine ? publicKeyLine.split(' = ')[1] : '';
            if(pk){
                const u = await User.findOne({ public_key: pk }, 'username');
                if(u && u.username){ usernamesToCleanupXray.add(u.username); }
            }
        }
        
        console.log(`🗑️  تعداد peer های orphaned در کانفیگ: ${orphanedInConfig.length}`);
        
        if (orphanedInConfig.length > 0) {
            console.log('📋 Peer های orphaned در کانفیگ:');
            orphanedInConfig.forEach((peer, index) => {
                const publicKeyLine = peer.lines.find(line => 
                    line.trim().startsWith('PublicKey = ') || line.trim().startsWith('#PublicKey = ')
                );
                const publicKey = publicKeyLine ? publicKeyLine.split(' = ')[1] : 'نامشخص';
                const isCommented = publicKeyLine && publicKeyLine.trim().startsWith('#');
                console.log(`   - Peer ${index + 1}: ${publicKey} ${isCommented ? '(کامنت‌شده)' : ''}`);
            });
            
            // حذف peer های orphaned از کانفیگ
            const cleanedInterfaceLines = [...interfaceLines];
            
            // حذف از انتها به ابتدا تا index ها تغییر نکنند
            orphanedInConfig.reverse().forEach(peer => {
                const startIndex = peer.startIndex;
                const endIndex = startIndex + peer.lines.length;
                
                // پیدا کردن خط خالی بعد از peer
                let actualEndIndex = endIndex;
                while (actualEndIndex < cleanedInterfaceLines.length && 
                       cleanedInterfaceLines[actualEndIndex].trim() === '') {
                    actualEndIndex++;
                }
                
                cleanedInterfaceLines.splice(startIndex, actualEndIndex - startIndex);
            });
            
            await replace_wg0_interface(cleanedInterfaceLines.join('\n'));
            console.log('✅ Peer های orphaned از کانفیگ حذف شدند');
        }
        
        // اعمال تغییرات
        if (orphanedClients.length > 0 || orphanedInConfig.length > 0) {
            console.log('🔄 اعمال تغییرات...');
            await sync_configs();
            if (usernamesToCleanupXray.size > 0) {
                const usernames = Array.from(usernamesToCleanupXray);
                await User.updateMany(
                    { username: { $in: usernames } },
                    {
                        $set: {
                            xray_enabled: false,
                            xray_last_config: "",
                            xray_real_subscription_url: "",
                            xray_subscription_url: "",
                        },
                    },
                );
            }
            
            // restart کامل Amnezia AWG برای اطمینان
            const containerId = await get_amnezia_container_id();
            await exec_on_container(containerId, 'sh -c "cd /opt/amnezia/awg/ && wg-quick down ./wg0.conf"');
            await exec_on_container(containerId, 'sh -c "cd /opt/amnezia/awg/ && wg-quick up ./wg0.conf"');
            
            console.log('✅ تغییرات اعمال شد و Amnezia AWG restart شد');
            if (usernamesToCleanupXray.size > 0) {
                await sync_xray_from_db();
            }
        } else {
            console.log('✅ هیچ کاربر orphaned یافت نشد');
        }
        
        console.log('🎉 عملیات پاکسازی کامل شد');
        
    } catch (error) {
        console.error('❌ خطا در عملیات پاکسازی:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
    }
}

/**
 * چک کردن وضعیت همگام‌سازی
 */
async function checkSyncStatus() {
    console.log('🔍 بررسی وضعیت همگام‌سازی...');
    
    try {
        const dbUsers = await User.find({}, 'username public_key');
        const dbUsernames = dbUsers.map(user => user.username);
        const dbPublicKeys = dbUsers.map(user => user.public_key);
        
        const clientsTable = await get_amnezia_clients_table();
        const clientsUsernames = clientsTable.map(item => item.userData.clientName);
        
        const interface = await get_wg0_interface();
        const interfaceLines = interface.split('\n');
        
        console.log(`📊 آمار همگام‌سازی:`);
        console.log(`   - کاربران در دیتابیس: ${dbUsernames.length}`);
        console.log(`   - کاربران در clients table: ${clientsUsernames.length}`);
        
        // بررسی عدم تطابق
        const missingInClients = dbUsernames.filter(username => 
            !clientsUsernames.includes(username)
        );
        
        const extraInClients = clientsUsernames.filter(username => 
            !dbUsernames.includes(username)
        );
        
        if (missingInClients.length > 0) {
            console.log(`⚠️  کاربران موجود در دیتابیس اما مفقود در clients table: ${missingInClients.length}`);
            missingInClients.forEach(username => console.log(`   - ${username}`));
        }
        
        if (extraInClients.length > 0) {
            console.log(`⚠️  کاربران موجود در clients table اما مفقود در دیتابیس: ${extraInClients.length}`);
            extraInClients.forEach(username => console.log(`   - ${username}`));
        }
        
        if (missingInClients.length === 0 && extraInClients.length === 0) {
            console.log('✅ همگام‌سازی کامل است');
        }
        
    } catch (error) {
        console.error('❌ خطا در بررسی وضعیت:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
    }
}

// اجرای اسکریپت
async function main() {
    const command = process.argv[2];
    
    switch (command) {
        case 'cleanup':
            await cleanupOrphanedUsers();
            break;
        case 'check':
            await checkSyncStatus();
            break;
        default:
            console.log('استفاده:');
            console.log('  node cleanup_orphaned_users.js cleanup  - حذف کاربران orphaned');
            console.log('  node cleanup_orphaned_users.js check    - بررسی وضعیت همگام‌سازی');
            break;
    }
}

main().catch(console.error);
