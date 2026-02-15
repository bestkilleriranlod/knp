require("dotenv").config();
const { User } = require('./utils.js');
const mongoose = require('mongoose');

const fix_max_connections = async () => {
    console.log("Starting fix_max_connections script...");
    
    // Give mongoose a moment to connect if it hasn't already (utils.js connects on load)
    // but better to be safe or check connection status.
    // However, mongoose buffers so we can just fire commands.
    
    try {
        const result = await User.updateMany(
            { maximum_connections: { $ne: 1 } },
            { $set: { maximum_connections: 1 } }
        );
        
        console.log(`Matched ${result.matchedCount} users.`);
        console.log(`Modified ${result.modifiedCount} users to have maximum_connections = 1.`);
        
    } catch (error) {
        console.error("Error updating users:", error);
    } finally {
        console.log("Done. Exiting.");
        process.exit(0);
    }
};

// Allow some time for DB connection from utils.js to establish if needed, 
// though mongoose buffers.
setTimeout(fix_max_connections, 2000);
