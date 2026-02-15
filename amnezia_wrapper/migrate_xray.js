require("dotenv").config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const {
  User,
  sync_xray_from_db,
  get_xray_static_info,
  build_xray_client_config_from,
  build_xray_subscription_url_from,
  encode_amnezia_data,
  isXrayAvailable
} = require('./utils.js');

const uuidv4 = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString('hex');
  return `${hex.substr(0,8)}-${hex.substr(8,4)}-${hex.substr(12,4)}-${hex.substr(16,4)}-${hex.substr(20)}`;
};

async function main() {
  try {
    const isClean = process.argv.slice(2).includes('clean');

    // --- حالت clean: خالی کردن اطلاعات xray برای یوزرهایی که دارند ---
    if (isClean) {
      const query = {
        $or: [
          { xray_uuid: { $exists: true, $ne: "" } },
          { xray_last_config: { $exists: true, $ne: "" } },
          { xray_real_subscription_url: { $exists: true, $ne: "" } },
          { xray_subscription_url: { $exists: true, $ne: "" } },
          { xray_enabled: true },
        ],
      };

      const res = await User.updateMany(query, {
        $set: {
          xray_uuid: "",
          xray_last_config: "",
          xray_real_subscription_url: "",
          xray_subscription_url: "",
          xray_enabled: false,
        },
      });

      console.log(`CLEANED_USERS=${res.modifiedCount}`);
      process.exit(0);
    }

    // --- حالت عادی: migrate قبلی ---
    if (!(await isXrayAvailable())) {
      console.log("Xray not found → skip migration");
      process.exit(0);
    }

    // Fix: Also include users with outdated configs/keys
    const users = await User.find({}).lean();

    const xinfo = await get_xray_static_info();
    let updated = 0;
    
    for (const u of users) {
      if (u.status === 'active') {
          
        let needsUpdate = false;
        let id = u.xray_uuid;
        
        // 1. Missing UUID
        if (!id) {
            id = uuidv4();
            needsUpdate = true;
        }
        
        // 2. Check if current config matches xinfo
        if (xinfo) {
            const newCfg = build_xray_client_config_from(id, xinfo);
            if (!u.xray_last_config || u.xray_last_config !== newCfg) {
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            const update = { xray_uuid: id };
            if (xinfo) {
              const cfg = build_xray_client_config_from(id, xinfo);
              update.xray_last_config = cfg;
              const tempUser = { xray_last_config: cfg };
              const xraySubReal = await build_xray_subscription_url_from(tempUser, xinfo);
              update.xray_real_subscription_url = xraySubReal;
              
              // Only update sub url if missing
              if (!u.xray_subscription_url) {
                  const xrayApiRaw = {
                    config_version: 1,
                    api_endpoint: `https://${process.env.ENDPOINT_ADDRESS}/sub`,
                    protocol: "xray",
                    name: process.env.COUNTRY_EMOJI + " " + u.username + "_xray",
                    description: "",
                    api_key: jwt.sign({ username: u.username, proto: "xray" }, process.env.SUB_JWT_SECRET),
                  };
                  update.xray_subscription_url = await encode_amnezia_data(JSON.stringify(xrayApiRaw));
              }
            }
            update.xray_enabled = true;
            await User.updateOne({ username: u.username }, update);
            updated++;
        }
      }
    }

    await sync_xray_from_db();
    console.log(`UPDATED_USERS=${updated}`);
    console.log(`\nIMPORTANT: Now run 'node fix_xray_sync.js' in the KNP root directory to sync these links to the main panel!`);
    process.exit(0);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
}

main();