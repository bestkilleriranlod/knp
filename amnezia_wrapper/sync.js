const {
    sleep,
    $sync_accounting,
    sync_xray_from_db,
    ensure_xray_keys_from_backup,
    ensure_xray_stats_config,
  } = require('./utils.js');

async function init()
{
    await ensure_xray_keys_from_backup();
    await ensure_xray_stats_config();
    while(true)
    {
        await $sync_accounting();
        await sync_xray_from_db();
        await sleep(90);
    }
}

init();