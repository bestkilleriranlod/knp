// set_expire.js
require("dotenv").config();

const { User, get_now } = require("./utils.js");

async function main() {
  try {
    const args = process.argv.slice(2);

    if (args.length < 2) {
      console.log("Usage: node set_expire.js <days_from_now> <username1> [username2] ...");
      process.exit(1);
    }

    const daysStr = args[0];
    const usernames = args.slice(1);

    const days = Number(daysStr);
    if (!Number.isFinite(days)) {
      console.error("days_from_now باید عدد باشه (مثلاً 10)");
      process.exit(1);
    }

    const now = get_now(); // همون Math.floor(Date.now()/1000) از utils.js
    const secondsToAdd = Math.floor(days * 24 * 60 * 60);
    const newExpire = now + secondsToAdd;

    console.log(`در حال ست کردن expire برای یوزرها به ${days} روز از الان...`);
    console.log(`timestamp جدید: ${newExpire} (${new Date(newExpire * 1000).toString()})`);

    for (const username of usernames) {
      const res = await User.updateOne(
        { username },
        { $set: { expire: newExpire } }
      );

      if (res.matchedCount === 0) {
        console.log(`❌ User '${username}' پیدا نشد`);
      } else {
        console.log(`✅ expire یوزر '${username}' تنظیم شد`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
