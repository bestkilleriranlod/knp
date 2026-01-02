require('dotenv').config();
const { 
    get_all_users, 
    get_panels, 
    get_marzban_user, 
    update_user 
} = require('./utils');

async function main() {
    console.log("Starting Xray link sync...");
    
    // Fetch all panels and users
    const panels = await get_panels();
    // Filter for Amnezia panels or any panel with "amnezia" in the URL
    const amneziaPanels = panels.filter(p => p.panel_type === "AMN" || p.panel_url.includes("amnezia"));
    
    console.log(`Found ${amneziaPanels.length} Amnezia panels.`);
    
    if (amneziaPanels.length === 0) {
        console.log("No Amnezia panels found. Exiting.");
        process.exit(0);
    }

    const users = await get_all_users();
    console.log(`Found ${users.length} total users in DB.`);
    
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const panel of amneziaPanels) {
        const panelUsers = users.filter(u => u.corresponding_panel_id === panel.id);
        console.log(`\nProcessing panel '${panel.panel_name}' (${panel.panel_url}): ${panelUsers.length} users.`);
        
        for (const user of panelUsers) {
            try {
                // Fetch fresh user info from the panel (Amnezia Wrapper)
                const userInfo = await get_marzban_user(panel.panel_url, panel.panel_username, panel.panel_password, user.username);
                
                if (userInfo && userInfo !== "ERR") {
                    const updateObj = {
                        real_subscription_url: (userInfo.subscription_url.startsWith("/") ? panel.panel_url : "") + userInfo.subscription_url,
                        links: userInfo.links,
                        xray_subscription_url: userInfo.xray_subscription_url || ""
                    };
                    
                    // Force update the user in local DB
                    await update_user(user.id, updateObj);
                    
                    if (userInfo.xray_subscription_url) {
                        updatedCount++;
                        // console.log(`[OK] Updated ${user.username} with Xray link.`);
                    } else {
                        // console.log(`[WARN] User ${user.username} has no Xray link from panel.`);
                    }
                } else {
                    console.log(`[ERR] Failed to fetch info for ${user.username} from panel.`);
                    errorCount++;
                }
            } catch (err) {
                console.error(`[ERR] Exception processing ${user.username}:`, err.message);
                errorCount++;
            }
            
            // Small delay to avoid hammering the API if there are many users
            // await new Promise(r => setTimeout(r, 10)); 
        }
    }
    
    console.log(`\nSync complete.`);
    console.log(`Updated users with Xray links: ${updatedCount}`);
    console.log(`Errors encountered: ${errorCount}`);
    process.exit(0);
}

main();
