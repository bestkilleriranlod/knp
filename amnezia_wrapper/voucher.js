const axios = require('axios');

async function init()
{
    for(let i = 0; i < 10000000; i++)
    {
        await axios.get('https://buysellvouchers.com/en/products/view/Software-Other/fcb49363239383/');
        const time = new Date().getTime();
        console.log("Time: ", time, " i: ", i);
    }
}

init()