require("dotenv").config();
const crypto = require('crypto');
const { User, sync_xray_from_db, get_xray_static_info, build_xray_client_config_from, build_xray_subscription_url_from } = require('./utils.js');

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
    const missing = await User.find({ $or: [{ xray_uuid: { $exists: false } }, { xray_uuid: "" }] }).lean();
    const xinfo = await get_xray_static_info();
    let updated = 0;
    for (const u of missing) {
      if (u.status === 'active') {
        const id = uuidv4();
        const update = { xray_uuid: id };
        if (xinfo) {
          const cfg = build_xray_client_config_from(id, xinfo);
          update.xray_last_config = cfg;
          const tempUser = { xray_last_config: cfg };
          const xraySub = await build_xray_subscription_url_from(tempUser, xinfo);
          update.xray_subscription_url = xraySub;
        }
        await User.updateOne({ username: u.username }, update);
        updated++;
      }
    }
    await sync_xray_from_db();
    console.log(`UPDATED_USERS=${updated}`);
    process.exit(0);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
}

main();