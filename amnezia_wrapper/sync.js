const {
    sleep,
    $sync_accounting,
    sync_xray_from_db,
  } = require('./utils.js');

async function init()
{
    while(true)
    {
        await $sync_accounting();
        await sync_xray_from_db();
        await sleep(90);
    }
}

init();