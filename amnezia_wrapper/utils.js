require("dotenv").config();
const mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1:27017/knaw');
const fs = require('fs').promises;
const crypto = require('crypto');
const axios = require('axios');
const https = require('https');
const {JWT_SECRET_KEY} = process.env
const {SUB_JWT_SECRET} = process.env
const jwt = require('jsonwebtoken');
const child_process = require('child_process');
const AdmZip = require('adm-zip');
const jalali_moment = require('jalali-moment');
const cron = require('node-cron');

// X-UI Configuration
const XUI_URL = process.env.XUI_URL || "http://127.0.0.1:2053";
const XUI_USERNAME = process.env.XUI_USERNAME || "admin";
const XUI_PASSWORD = process.env.XUI_PASSWORD || "admin";
const XUI_INBOUND_PORT = parseInt(process.env.XUI_INBOUND_PORT || "8443");
let XUI_COOKIE = "";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const xui_login = async () => {
    try {
        const response = await axios.post(`${XUI_URL}/login`, {
            username: XUI_USERNAME,
            password: XUI_PASSWORD
        }, { httpsAgent });
        if (response.headers['set-cookie']) {
            XUI_COOKIE = response.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
            return true;
        }
    } catch (error) {
        console.log("X-UI Login Error:", error.message);
    }
    return false;
}

const xui_call = async (method, path, data = null) => {
    if (!XUI_COOKIE) await xui_login();
    try {
        const config = {
            method,
            url: `${XUI_URL}${path}`,
            headers: {
                'Cookie': XUI_COOKIE,
                'Content-Type': 'application/json'
            },
            data,
            httpsAgent
        };
        const response = await axios(config);
        if(response.data && response.data.success === false && response.data.msg && response.data.msg.includes("login")) {
             await xui_login();
             config.headers['Cookie'] = XUI_COOKIE;
             const retry = await axios(config);
             return retry.data;
        }
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            await xui_login();
            try {
                const config = {
                    method,
                    url: `${XUI_URL}${path}`,
                    headers: {
                        'Cookie': XUI_COOKIE,
                        'Content-Type': 'application/json'
                    },
                    data,
                    httpsAgent
                };
                const response = await axios(config);
                return response.data;
            } catch (e) {
                console.log(`X-UI Call Error (${path}):`, e.message);
                return null;
            }
        }
        console.log(`X-UI Call Error (${path}):`, error.message);
        return null;
    }
}

const get_xui_inbound = async () => {
    // 3x-ui typically uses GET for list, but some versions might vary. 
    // Debugging showed GET works for /panel/api/inbounds/list
    const res = await xui_call('get', '/panel/api/inbounds/list');
    if(res && res.success && res.obj) {
        const inbound = res.obj.find(i => i.port === XUI_INBOUND_PORT);
        return inbound;
    }
    return null;
}

const PRIMARY_DNS = process.env.PRIMARY_DNS || "8.8.8.8";
const SECONDARY_DNS = process.env.SECONDARY_DNS || "8.8.4.4";
const AWG_ITIME = process.env.AWG_ITIME || "";
const AWG_I1 = process.env.AWG_I1 || "";

String.prototype.farsify = function()
{
    return this.replace(/0/g, '۰').replace(/1/g, '۱').replace(/2/g, '۲').replace(/3/g, '۳').replace(/4/g, '۴').replace(/5/g, '۵').replace(/6/g, '۶').replace(/7/g, '۷').replace(/8/g, '۸').replace(/9/g, '۹');
}

const uid = () => { return Math.floor(Math.random() * (9999999999 - 1000000000 + 1)) + 1000000000; }

const generate_token = () => { return jwt.sign({},JWT_SECRET_KEY,{expiresIn: '24h'}); }

const to_unicode_escape = (str) => 
{
    return str.split('').map(char => 
    {
        const code = char.charCodeAt(0).toString(16).padStart(4, '0');
        return `\\u${code}`;
    }).join('');
};

const b2gb = (bytes) => 
{
    var x = (bytes / (2 ** 10) ** 3);
    return Math.round(x * 100) / 100;
}

const gb2b = (gb) =>
{
    return gb * (2 ** 10) ** 3;
}

const sleep = (seconds) => { return new Promise((resolve) => { setTimeout(resolve, seconds * 1000); }); }

const format_amnezia_data_to_byte = (str) =>
{
    if(!str) return 0;
    const unit = str.split(" ")[1];
    var value = str.split(" ")[0]; 
    value = parseFloat(value);
    if(unit == "KiB") return Math.round(value * 1024);
    if(unit == "MiB") return Math.round(value * 1024 * 1024);
    if(unit == "GiB") return Math.round(value * 1024 * 1024 * 1024);
    if(unit == "TiB") return Math.round(value * 1024 * 1024 * 1024 * 1024);
    else return 0;
}

const get_user_traffic_from_wg_cli = async (public_key) =>
{
    try
    {
        var container_id = await get_amnezia_container_id();
        var data = await exec_on_container(container_id,`wg show wg0 transfer | grep ${public_key}`);
        var data_arr = data.split("\t");
        var received = data_arr[1];
        var sent = data_arr[2];
        if (process.env.DEBUG_WG_TRAFFIC === "1") {
            console.log(`Received: ${received}, Sent: ${sent}`);
        }
        return parseInt(received) + parseInt(sent);
    }

    catch(err)
    {
        console.log(err);
        return false;
    }
}

const get_wg_transfers_map = async () =>
{
    try
    {
        var container_id = await get_amnezia_container_id();
        var data = await exec_on_container(container_id,`wg show wg0 transfer`);
        const map = new Map();
        const lines = String(data || "").split("\n");
        for(const ln of lines)
        {
            const parts = ln.split("\t");
            if(parts.length >= 3)
            {
                const pk = parts[0].trim();
                const rx = parseInt(parts[1]);
                const tx = parseInt(parts[2]);
                if(pk) map.set(pk, (isNaN(rx)?0:rx) + (isNaN(tx)?0:tx));
            }
        }
        return map;
    }
    catch(err)
    {
        console.log(err);
        return new Map();
    }
}

const get_now = () =>
{
    return Math.floor(Date.now() / 1000);
}

const ts__to__pd = (ts) => 
{

    if(ts > 9999999999) ts = Math.floor(ts / 1000);

    var months =
    {
        1:"فروردین",
        2:"اردیبهشت",
        3:"خرداد",
        4:"تیر",
        5:"مرداد",
        6:"شهریور",
        7:"مهر",
        8:"آبان",
        9:"آذر",
        10:"دی",
        11:"بهمن",
        12:"اسفند",
    }

    var result = 
    {
        year:jalali_moment.unix(ts).locale('fa').format('YYYY').farsify(),
        month:months[jalali_moment.unix(ts).locale('fa').format('M')],
        day:jalali_moment.unix(ts).locale('fa').format('DD').farsify(),
    }

    return result;
}

const get_days_passed = (timestamp) =>
{
    var now = get_now();
    var diff = now - timestamp;
    var days = Math.floor(diff / (60*60*24));
    return days;
}

const get_days_left = (timestamp) =>
{
    var now = get_now();
    var diff = timestamp - now;
    var days = Math.floor(diff / (60*60*24));
    return days + 1;
}

const generate_desc = (expire, ip_limit) =>
{
    var expire_date = ts__to__pd(expire);
    var desc = "انقضا: "
    desc += expire_date.day + " " + expire_date.month + " " + expire_date.year;
    desc += "|"
    desc += String(get_days_left(expire)).farsify() + " روزه";
    desc += "|"
    desc += "1 کاربره";

    return to_unicode_escape(desc);
}


const validate_token = (token) =>
{
    token = token.replace("bearer ","").replace("Bearer ","");
    try
    {
        var decoded = jwt.verify(token, JWT_SECRET_KEY);
        return decoded;
    }
    
    catch(err)
    {
        console.log(err,JWT_SECRET_KEY);
        return false;
    }
}

const get_system_status = async () =>
{

    const users = await User.find();

    var result =
    {
        total_user: users.length,
        users_active: users.filter((item) => item.status == "active").length,
        incoming_bandwidth: users.reduce((acc, item) => acc + item.lifetime_used_traffic + item.used_traffic + (item.xray_used_traffic || 0), 0),
        outgoing_bandwidth: 0,
        panel_type:"AMN",
    }

    return result;
}

const extend_expire_times = async (added_time) =>
{
    await User.updateMany({},{$inc: {expire: added_time}});
}

const create_user = async (username, expire, data_limit, ip_limit, unlock=false) =>
{

    const does_exist = await User.findOne({username});

    if(!unlock)
    {
        if(does_exist) throw new Error("User already exists");
        const username_regex = /^[a-zA-Z0-9_]+$/;
        if(!username.match(username_regex)) throw new Error("Invalid username");
    }

    else if(unlock && !does_exist) throw new Error("User not found");

    var docker_id = await get_amnezia_container_id();
    if(docker_id == "") throw new Error("Amnezia container not found");


    var private_key = await exec_on_container(docker_id,"wg genkey");
    var public_key = await exec_on_container(docker_id,`echo ${private_key} | wg pubkey`);
    var client_public_key = await exec_on_container(docker_id,`wg show wg0 public-key`);
    let psk = "";
    try {
      let raw = await exec_on_container(docker_id, "wg show wg0 preshared-keys | head -n 1 || true");
      raw = (raw || "").trim();
      if (raw && raw.includes("\t")) {
        psk = raw.split("\t")[1].trim();
      }
    } catch (e) {}
    if (!psk) {
      psk = (await exec_on_container(docker_id, "wg genpsk")).trim();
    }
    
    var interface = await get_wg0_interface();
    var clients_table = await get_amnezia_clients_table();

    var dedicated_ip = null;
    if(!unlock) dedicated_ip = await get_next_available_ip();
    else
    {
        var interface_lines = interface.split("\n");
        var public_key_line_index = interface_lines.findIndex((item) => item.includes(does_exist.public_key));
        dedicated_ip = interface_lines[public_key_line_index + 2].split(" = ")[1];
    }

    const Jc_value = get_interface_key(interface,"Jc");
    const Jmin_value = get_interface_key(interface,"Jmin");
    const Jmax_value = get_interface_key(interface,"Jmax");
    const S1_value = get_interface_key(interface,"S1");
    const S2_value = get_interface_key(interface,"S2");
    const H1_value = get_interface_key(interface,"H1");
    const H2_value = get_interface_key(interface,"H2");
    const H3_value = get_interface_key(interface,"H3");
    const H4_value = get_interface_key(interface,"H4");
    const amnezia_port = get_interface_key(interface,"ListenPort");


    var new_interface = null;

    if(unlock)
    {
        new_interface = interface;
        new_interface = new_interface
            .replace(`PublicKey = ${does_exist.public_key}`,`PublicKey = ${public_key}`)
            .replace(`#PublicKey = ${does_exist.public_key}`,`#PublicKey = ${public_key}`);
    }

    else
    {
        const base = interface.endsWith('\n') ? interface : interface + '\n';
        new_interface =
`${base}
[Peer]
PublicKey = ${public_key}
PresharedKey = ${psk}
AllowedIPs = ${dedicated_ip}

`
    }



    var connection_string =
`

[Interface]
Address = ${dedicated_ip}
DNS = ${PRIMARY_DNS}, ${SECONDARY_DNS}
PrivateKey = ${private_key}
Jc = ${Jc_value}
Jmin = ${Jmin_value}
Jmax = ${Jmax_value}
S1 = ${S1_value}
S2 = ${S2_value}
H1 = ${H1_value}
H2 = ${H2_value}
H3 = ${H3_value}
H4 = ${H4_value}
Itime = ${AWG_ITIME}
I1 = ${AWG_I1}

[Peer]
PublicKey = ${client_public_key}
PresharedKey = ${psk}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${process.env.SERVER_ADDRESS}:${amnezia_port}
PersistentKeepalive = 25
`;

    const xray_available = await isXrayAvailable();
    var xray_info = null;
    var xray_uuid = "";
    var xray_last_config = "";
    var xray_real_subscription_url = "";
    var xray_subscription_url = "";
    if(xray_available)
    {
        xray_info = await get_xray_static_info();
        if(!unlock)
        {
            xray_uuid = uuidv4();
        }
        else
        {
            // User requested new UUID on unlock
            xray_uuid = uuidv4();
        }
        xray_last_config = xray_info ? build_xray_client_config_from(xray_uuid, xray_info) : "";
        if(xray_last_config && xray_info)
        {
            const tempUser = { xray_last_config };
            xray_real_subscription_url = await build_xray_subscription_url_from(tempUser, xray_info);
        }
        {
            xray_subscription_url = await build_xray_subscription_url({ username, expire, maximum_connections: ip_limit });
        }
    }

    var subscription_url = null;
    if(!unlock) subscription_url = await build_awg_subscription_url({ username, expire, maximum_connections: ip_limit });

    console.log(subscription_url);


    var real_subscription_url_raw =
    {
        "containers": [
            {
                "awg": {
                    "H1": `${H1_value}`,
                    "H2": `${H2_value}`,
                    "H3": `${H3_value}`,
                    "H4": `${H4_value}`,
                    "Jc": `${Jc_value}`,
                    "Jmax": `${Jmax_value}`,
                    "Jmin": `${Jmin_value}`,
                    "S1": `${S1_value}`,
                    "S2": `${S2_value}`,
                    "last_config": `{\n    \"H1\": \"${H1_value}\",\n    \"H2\": \"${H2_value}\",\n    \"H3\": \"${H3_value}\",\n    \"H4\": \"${H4_value}\",\n    \"Jc\": \"${Jc_value}\",\n    \"Jmax\": \"${Jmax_value}\",\n    \"Jmin\": \"${Jmin_value}\",\n    \"S1\": \"${S1_value}\",\n    \"S2\": \"${S2_value}\",\n    \"allowed_ips\": [\n        \"0.0.0.0/0\",\n        \"::/0\"\n    ],\n    \"clientId\": \"${public_key}\",\n    \"client_ip\": \"${dedicated_ip.split("/")[0]}\",\n    \"client_priv_key\": \"${private_key}\",\n    \"client_pub_key\": \"${public_key}\",\n    \"config\": \"[Interface]\\nAddress = ${dedicated_ip}\\nDNS = $PRIMARY_DNS, $SECONDARY_DNS\\nPrivateKey = ${private_key}\\nJc = ${Jc_value}\\nJmin = ${Jmin_value}\\nJmax = ${Jmax_value}\\nS1 = ${S1_value}\\nS2 = ${S2_value}\\nH1 = ${H1_value}\\nH2 = ${H2_value}\\nH3 = ${H3_value}\\nH4 = ${H4_value}\\n\\n[Peer]\\nPublicKey = ${client_public_key}\\nPresharedKey = ${psk}\\nAllowedIPs = 0.0.0.0/0, ::/0\\nEndpoint = ${process.env.SERVER_ADDRESS}:${amnezia_port}\\nPersistentKeepalive = 25\\n\",\n    \"hostName\": \"${process.env.SERVER_ADDRESS}\",\n    \"mtu\": \"1280\",\n    \"persistent_keep_alive\": \"25\",\n    \"port\": ${amnezia_port},\n    \"psk_key\": \"${psk}\",\n    \"server_pub_key\": \"${client_public_key}\"\n}\n`,
                    "port": `${amnezia_port}`,
                    "transport_proto": "udp"
                },
                "container": "amnezia-awg"
            }
        ],
        "defaultContainer": "amnezia-awg",
        "description": "AWG Server",
        "dns1": "${PRIMARY_DNS}",
        "dns2": "${SECONDARY_DNS}",
        "hostName": `${process.env.SERVER_ADDRESS}`,
    }

    try {
        const lcObj = JSON.parse(real_subscription_url_raw.containers[0].awg.last_config);
        lcObj.Itime = AWG_ITIME;
        lcObj.I1 = AWG_I1;
        lcObj.config = lcObj.config.replace("DNS = $PRIMARY_DNS, $SECONDARY_DNS", `DNS = ${PRIMARY_DNS}, ${SECONDARY_DNS}`)
                                   .replace("\n\n[Peer]", `\nItime = ${AWG_ITIME}\nI1 = ${AWG_I1}\n\n[Peer]`);
        real_subscription_url_raw.containers[0].awg.last_config = JSON.stringify(lcObj);
        real_subscription_url_raw.dns1 = `${PRIMARY_DNS}`;
        real_subscription_url_raw.dns2 = `${SECONDARY_DNS}`;
    } catch(e) {}

    var real_subscription_url = await encode_amnezia_data(JSON.stringify(real_subscription_url_raw));


    var creation_date = new Date(expire * 1000).toString().split(" GMT")[0];

    creation_date = creation_date.split(" ");
    var temp = creation_date[creation_date.length - 1];
    creation_date[creation_date.length - 1] = creation_date[creation_date.length - 2];
    creation_date[creation_date.length - 2] = temp;
    creation_date = creation_date.join(" ");


    if(unlock)
    {
        clients_table = clients_table.map((item) =>
        {
            if(item.userData.clientName == username)
            {
                item.clientId = public_key;
            }

            return item;
        });
    }

    else
    {
        clients_table.push
        ({
            clientId: public_key,
            userData:
            {
                clientName: username,
                creationDate: creation_date,
            }
        });
    }
        

    await replace_wg0_interface(new_interface);
        
    await replace_amnezia_clients_table(JSON.stringify(clients_table,null,4));
    await sync_configs();

    if(unlock)
    {
        const updateObj = {
            connection_string: connection_string,
            real_subscription_url: real_subscription_url,
            public_key: public_key,
            connection_uuids: [],
            has_been_unlocked: true,
        };
        updateObj.subscription_url = await build_awg_subscription_url({ username, expire: does_exist.expire, maximum_connections: does_exist.maximum_connections || 1 });
        if(xray_available)
        {
            updateObj.xray_uuid = xray_uuid;
            updateObj.xray_last_config = xray_last_config;
            updateObj.xray_real_subscription_url = xray_real_subscription_url;
            updateObj.xray_subscription_url = await build_xray_subscription_url({ username, expire: does_exist.expire, maximum_connections: does_exist.maximum_connections || 1 });
            updateObj.xray_enabled = true;
        }
        await User.updateOne({username}, updateObj);
    }

    else
    {
        const createObj = {
            username: username,
            expire: expire,
            data_limit: data_limit,
            connection_string: connection_string,
            subscription_url: subscription_url,
            real_subscription_url: real_subscription_url,
            public_key: public_key,
            maximum_connections: ip_limit,
        };
        if(xray_available)
        {
            createObj.xray_uuid = xray_uuid;
            createObj.xray_last_config = xray_last_config;
            createObj.xray_real_subscription_url = xray_real_subscription_url;
            createObj.xray_subscription_url = xray_subscription_url;
            createObj.xray_enabled = true;
        }
        await User.create(createObj);
    }
            
    if(xray_available) {
         // Force sync with the just-created/updated UUID
         await sync_xray_single_user(username);
    }
    await sync_awg_single_user(username);

    return {
        links: [connection_string],
        subscription_url: subscription_url,
        xray_subscription_url: xray_available ? xray_subscription_url : "",
        xray_real_subscription_url: xray_available ? xray_real_subscription_url : "",
    }

}

const get_user_for_marzban = async (username) =>
{

    const user = await User.findOne({username});
    if(!user) throw new Error("User not found");

    const result =
    {
        proxies: {
            "trojan": {
              "password": "AWG",
              "flow": ""
            },
            "vless": {
              "id": "AWG",
              "flow": ""
            },
            "vmess": {
              "id": "AWG"
            },
            "shadowsocks": {
              "password": "AWG",
              "method": "AWG"
            }
          },

          links: [user.connection_string],
          lifetime_used_traffic: user.lifetime_used_traffic + user.used_traffic + (user.xray_used_traffic || 0),
          used_traffic: user.used_traffic + (user.xray_used_traffic || 0),
          subscription_url: user.subscription_url,
          xray_subscription_url: user.xray_subscription_url || "",
          ip_limit: user.maximum_connections,
    }

    return result;
}

const get_all_users_for_marzban = async () =>
{

    const users = await User.find({},
    {   
        username: 1,
        expire: 1,
        data_limit: 1,
        used_traffic: 1,
        lifetime_used_traffic: 1,
        status: 1,
        created_at: 1,
        subscription_url: 1,
        xray_subscription_url: 1,
        xray_used_traffic: 1,
    }).lean()


    for(let user of users)
    {
        user.lifetime_used_traffic = user.lifetime_used_traffic + user.used_traffic + (user.xray_used_traffic || 0);
        user.used_traffic = user.used_traffic + (user.xray_used_traffic || 0);
        user.created_at = format_timestamp(user.created_at);
    }


    return {
        users,
    }

}

const format_timestamp = (timestamp) =>
{
    var date = new Date(timestamp * 1000);
    
    let year = date.getFullYear();
    let month = String(date.getMonth() + 1).padStart(2, '0');
    let day = String(date.getDate()).padStart(2, '0');
    let hours = String(date.getHours()).padStart(2, '0');
    let minutes = String(date.getMinutes()).padStart(2, '0');
    let seconds = String(date.getSeconds()).padStart(2, '0');
    let milliseconds = String(date.getMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}000`;
}

const reset_user_account = async (username) =>
{
    const user_obj = await User.findOne({username});
    await User.updateOne({username}, {used_traffic: 0, xray_used_traffic: 0, lifetime_used_traffic: user_obj.lifetime_used_traffic + user_obj.used_traffic + (user_obj.xray_used_traffic || 0)});
    if(await isXrayAvailable()) await sync_xray_single_user(username);
    return true;
}

const edit_user = async (username, status, expire, data_limit) =>
{
    // اگر صراحتاً status فرستاده شده (مثلاً از API پنل)، همون رو اعمال کن
    if(status) 
    {
        await User.updateOne({ username }, { status });
        if(await isXrayAvailable()) await sync_xray_single_user(username);
        await sync_awg_single_user(username);
        return true;
    }

    const user_obj = await User.findOne({ username });
    if(!user_obj) throw new Error("User not found");

    // --- منطق جدید برای تعیین status براساس expire جدید ---
    const now = get_now();
    let newStatus = user_obj.status;

    // فقط اگر expire جدید معتبر باشه
    if(typeof expire === "number" && expire > 0)
    {
        if(expire > now)
        {
            // اگر قبلاً expired یا limited بوده و الان تمدید شده، فعالش کن
            if(user_obj.status === "expired" || user_obj.status === "limited")
            {
                newStatus = "active";
            }
        }
        else
        {
            // اگر expire جدید در گذشته است، حتماً expired بشه
            newStatus = "expired";
        }
    }

    // اگر روزهای باقی‌مانده تغییر کرده (یعنی تمدید واقعی)
    if(get_days_left(user_obj.expire) != get_days_left(expire))
    {
        // expire + دیتالیمیت + ریست ترافیک + به‌روز کردن lifetime + status جدید
        await User.updateOne(
            { username },
            {
                expire,
                data_limit,
                used_traffic: 0,
                xray_used_traffic: 0,
                lifetime_used_traffic: user_obj.lifetime_used_traffic + user_obj.used_traffic + (user_obj.xray_used_traffic || 0),
                status: newStatus,
            }
        );

        // اگر xray هست، کانفیگ جدید براش بساز
        if(await isXrayAvailable())
        {
            const xinfo = await get_xray_static_info();
            if(xinfo)
            {
                // Preserve existing UUID on renewal unless missing
                const newUuid = user_obj.xray_uuid || uuidv4();
                const cfg = build_xray_client_config_from(newUuid, xinfo);
                const tempUser = { xray_last_config: cfg };
                const xraySubReal = await build_xray_subscription_url_from(tempUser, xinfo);
                const xrayApiLink = await build_xray_subscription_url({
                    username,
                    expire,
                    maximum_connections: user_obj.maximum_connections || 1
                });
                await User.updateOne(
                    { username },
                    {
                        xray_uuid: newUuid,
                        xray_last_config: cfg,
                        xray_real_subscription_url: xraySubReal,
                        xray_subscription_url: xrayApiLink,
                    }
                );
            }
            // Reset traffic in 3x-ui on renewal
            await xray_api_reset_client_traffic(username);
            await sync_xray_single_user(username);
        }

        // لینک AWG جدید بر اساس expire جدید
        const awgSub = await build_awg_subscription_url({
            username,
            expire,
            maximum_connections: user_obj.maximum_connections || 1
        });
        await User.updateOne({ username }, { subscription_url: awgSub });

        // sync با AWG (با status جدید)
        await sync_awg_single_user(username);
        return true;
    }
    
    // اگر روزها عوض نشده ولی expire یا data_limit عوض شده
    await User.updateOne(
        { username },
        {
            data_limit,
            expire,
            status: newStatus,
        }
    );

    if(await isXrayAvailable()) await sync_xray_single_user(username);
    await sync_awg_single_user(username);
    return true;
}


const delete_user = async (username) =>
{

    var interface = await get_wg0_interface();
    var clients_table = await get_amnezia_clients_table();
    const user_obj = await User.findOne({username});
    if(!user_obj) throw new Error("User not found");
    var public_key = user_obj.public_key;

    clients_table = clients_table.filter((item) => item.userData.clientName != username);

    var interface_lines = interface.split("\n");

    for(var i=0;i<interface_lines.length;i++)
    {
        if(interface_lines[i].includes(public_key))
        {
            interface_lines.splice(i-1,4);
            break;
        }
    }

    await replace_wg0_interface(interface_lines.join("\n"));

    await replace_amnezia_clients_table(JSON.stringify(clients_table,null,4));
    
    await sync_configs();

    await User.deleteOne({ username });

    if(await isXrayAvailable()) {
        await sync_xray_from_db();
    }
    
    return true;
}

const exec = async (cmd) =>
{

    if (process.platform !== 'linux') 
    {
      return '';
    }

    return new Promise((resolve, reject) => 
    {
      child_process.exec(cmd, 
      {
        shell: 'bash',
      }, 
      (err, stdout) => 
      {
        if (err) return reject(err);
        // console.log(stdout);
        return resolve(String(stdout).trim());
      });
    });
}

const exec_on_container = async (container_id, cmd) =>
{
    return await exec(`docker exec ${container_id} ${cmd}`);
}

const exec_on_container_sh = async (container_id, cmd) =>
{
    return await exec(`docker exec ${container_id} sh -c "${cmd}"`);
}

const sync_configs = async () =>
{
    var container_id = await get_amnezia_container_id();
    await exec_on_container(container_id,'bash -c "cd /opt/amnezia/awg/ && wg syncconf wg0 <(wg-quick strip ./wg0.conf)"');
}

const get_wg0_interface = async () =>
{
    var container_id = await get_amnezia_container_id();
    return await exec_on_container(container_id,"cat /opt/amnezia/awg/wg0.conf");
}

const get_interface_key = (interface, key) =>
{
    var lines = interface.split("\n");
    for(var line of lines)
    {
        if(line.includes(key + " = "))
        {
            return line.split(" = ")[1];
        }
    }
}

const get_amnezia_clients_table = async () =>
{
    var container_id = await get_amnezia_container_id();
    var clients_table_raw = await exec_on_container(container_id,"cat /opt/amnezia/awg/clientsTable");
    return JSON.parse(clients_table_raw);
}

const get_amnezia_container_id = async () =>
{
    return await exec("docker ps -qf name=amnezia-awg");
}

const replace_wg0_interface = async (new_config) =>
{
    var container_id = await get_amnezia_container_id();
    var file_id = uid()
    const data = new_config.endsWith('\n') ? new_config : new_config + '\n';
    await fs.writeFile(`./temp${file_id}`,data);
    await exec(`docker cp ./temp${file_id} ${container_id}:/opt/amnezia/awg/wg0.conf`);
    await fs.unlink(`./temp${file_id}`);
}

const ensure_listen_port = async (expectedPort) =>
{
    return true;
}

const replace_amnezia_clients_table = async (new_table) =>
{
    var container_id = await get_amnezia_container_id();
    var file_id = uid()
    await fs.writeFile(`./temp${file_id}`,new_table);
    await exec(`docker cp ./temp${file_id} ${container_id}:/opt/amnezia/awg/clientsTable`);
    await fs.unlink(`./temp${file_id}`);
}

// Docker-specific Xray functions removed (get_xray_container_id, etc.)

const isXrayAvailable = async () => {
    try {
        const inbound = await get_xui_inbound();
        return !!inbound;
    } catch(e) {
        return false;
    }
}

let cached_xray_info = null;
let last_xray_info_fetch = 0;

const get_xray_static_info = async () =>
{
    const now = Date.now();
    if (cached_xray_info && (now - last_xray_info_fetch < 60000)) {
        return cached_xray_info;
    }

    const inbound = await get_xui_inbound();
    if(!inbound) return cached_xray_info; 
    
    try {
        const streamSettings = JSON.parse(inbound.streamSettings);
        
        const info = {
            protocol: inbound.protocol,
            port: inbound.port,
            streamSettings: streamSettings,
            settings: JSON.parse(inbound.settings)
        };

        cached_xray_info = info;
        last_xray_info_fetch = now;
        return info;
    } catch(e) {
        console.log("Error parsing 3x-ui inbound settings:", e);
        return cached_xray_info;
    }
}

const uuidv4 = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = b.toString('hex');
    return `${hex.substr(0,8)}-${hex.substr(8,4)}-${hex.substr(12,4)}-${hex.substr(16,4)}-${hex.substr(20)}`;
};


const get_xray_installer_uuid = async () =>
{
    return null;
}

const build_xray_client_config_from = (xray_uuid, info) =>
{
    const XRAY_ADDR = process.env.XRAY_SERVER_ADDRESS || process.env.SERVER_ADDRESS;
    const streamSettings = info.streamSettings || {};
    const protocol = info.protocol || "vless";
    
    const obj = {
        inbounds: [
            { listen: "127.0.0.1", port: 10808, protocol: "socks", settings: { udp: true } }
        ],
        log: { loglevel: "error" },
        outbounds: [
            {
                protocol: protocol,
                settings: {
                    vnext: [
                        {
                            address: XRAY_ADDR,
                            port: info.port,
                            users: [ { encryption: "none", flow: (protocol === 'vless' && streamSettings.security === 'reality') ? "xtls-rprx-vision" : "", id: xray_uuid } ]
                        }
                    ]
                },
                streamSettings: streamSettings
            }
        ]
    };

    // Fix reality settings for client side (if it's reality)
    if (streamSettings.security === 'reality') {
        const reality = streamSettings.realitySettings || {};
        const inner = reality.settings || reality;
        obj.outbounds[0].streamSettings.realitySettings = {
            fingerprint: reality.fingerprint || inner.fingerprint || "chrome",
            publicKey: reality.publicKey || inner.publicKey || "",
            serverName: (reality.serverNames && reality.serverNames.length > 0) ? reality.serverNames[0] : (inner.serverName || ""),
            shortId: (reality.shortIds && reality.shortIds.length > 0) ? reality.shortIds[0] : (inner.shortId || ""),
            spiderX: ""
        };
        // Remove server-side only reality settings
        delete obj.outbounds[0].streamSettings.realitySettings.privateKey;
        delete obj.outbounds[0].streamSettings.realitySettings.shortIds;
        delete obj.outbounds[0].streamSettings.realitySettings.serverNames;
    }

    return JSON.stringify(obj);
}

const build_xray_subscription_url_from = async (userLike, info) =>
{
    if(!userLike || !userLike.xray_last_config) return "";
    const xinfo = info || await get_xray_static_info();
    if(!xinfo) return "";
    const XRAY_ADDR = process.env.XRAY_SERVER_ADDRESS || process.env.SERVER_ADDRESS;
    const raw = {
        containers: [
            {
                xray: {
                    last_config: userLike.xray_last_config,
                    port: String(xinfo.port),
                    transport_proto: xinfo.streamSettings?.network || "tcp",
                },
                container: "amnezia-xray",
            }
        ],
        defaultContainer: "amnezia-xray",
        description: "Xray Server",
        dns1: `${PRIMARY_DNS}`,
        dns2: `${SECONDARY_DNS}`,
        hostName: XRAY_ADDR,
    };
    const encoded = await encode_amnezia_data(JSON.stringify(raw));
    return encoded;
}

const sync_xray_from_db = async () =>
{
    if(!(await isXrayAvailable())) { console.log("Xray not found (3x-ui) → skip sync_xray_from_db()"); return; }
    
    // 1. Get current state from 3x-ui
    const inbound = await get_xui_inbound();
    if(!inbound) return false;
    
    let currentClients = [];
    try {
        const settings = JSON.parse(inbound.settings);
        if(settings && settings.clients) {
            currentClients = settings.clients;
        }
    } catch(e) {
        console.log("Error parsing inbound settings:", e);
        return false;
    }
    
    // Map of Email -> UUID for current panel clients
    const panelClientsMap = new Map();
    for(const c of currentClients) {
        if(c.email) panelClientsMap.set(c.email, c.id);
    }

    // 2. Get active users from DB
    const now = get_now();
    const allActive = await User.find({ status: "active" }).lean();
    const activeUsers = [];
    
    for(const u of allActive)
    {
        const okExpire = (u.expire || 0) > now;
        const okData = (u.data_limit || 0) === 0 || ((u.used_traffic || 0) + (u.xray_used_traffic || 0)) < (u.data_limit || 0);
        if(okExpire && okData) activeUsers.push(u);
    }
    
    const activeUsernames = activeUsers.map(u => u.username);

    // 3. Sync DB users to Panel
    const xinfo = await get_xray_static_info();
    
    for(const u of activeUsers)
    {
        // Ensure UUID
        if(!u.xray_uuid || u.xray_uuid.length === 0) {
            if(panelClientsMap.has(u.username)) {
                u.xray_uuid = panelClientsMap.get(u.username);
            } else {
                u.xray_uuid = (crypto.randomUUID ? crypto.randomUUID() : uuidv4());
            }
            await User.updateOne({ username: u.username }, { xray_uuid: u.xray_uuid });
        }

        // Update Subscription Links in DB if needed (only if xinfo exists and something changed)
        if(xinfo) {
            const cfg = build_xray_client_config_from(u.xray_uuid, xinfo);
            
            // Only update if config changed or links are missing
            if(u.xray_last_config !== cfg || !u.xray_real_subscription_url || !u.xray_subscription_url) {
                const tempUser = { xray_last_config: cfg };
                const xraySubReal = await build_xray_subscription_url_from(tempUser, xinfo);
                const xrayApiRaw = {
                    config_version: 1,
                    api_endpoint: `https://${process.env.ENDPOINT_ADDRESS}/sub`,
                    protocol: "xray",
                    name: process.env.COUNTRY_EMOJI + " " + u.username + "_xray",
                    description: generate_desc(u.expire, u.maximum_connections || 1),
                    api_key: jwt.sign({ username: u.username, proto: "xray" }, SUB_JWT_SECRET),
                };
                const xrayApiLink = await encode_amnezia_data(JSON.stringify(xrayApiRaw));
                
                await User.updateOne({ username: u.username }, { 
                    xray_last_config: cfg, 
                    xray_real_subscription_url: xraySubReal, 
                    xray_subscription_url: xrayApiLink 
                });
                
                // Update local object to reflect changes for later checks in the same loop
                u.xray_last_config = cfg;
                u.xray_real_subscription_url = xraySubReal;
                u.xray_subscription_url = xrayApiLink;
            }
        }

        // Add to Panel if missing or update if needed
        if(!panelClientsMap.has(u.username)) {
            console.log(`Adding missing user to Xray: ${u.username}`);
            await xray_api_add_client(u.xray_uuid, u.username, u.maximum_connections || 0, (u.expire || 0) * 1000, inbound);
        } else {
            const currentUuid = panelClientsMap.get(u.username);
            const clientInPanel = currentClients.find(c => c.email === u.username);
            
            // Check if needs update (uuid change or disabled but should be active)
            if(currentUuid !== u.xray_uuid) {
                console.log(`Updating UUID for user ${u.username} (Panel: ${currentUuid} -> DB: ${u.xray_uuid})`);
                
                // Use updateClient to preserve stats if possible
                if(clientInPanel) {
                    clientInPanel.id = u.xray_uuid;
                    clientInPanel.enable = true;
                    clientInPanel.limitIp = u.maximum_connections || 0;
                    clientInPanel.expiryTime = (u.expire || 0) * 1000;
                    await xray_api_update_client(currentUuid, clientInPanel, inbound);
                } else {
                    // Fallback to remove/add if something is wrong with client object
                    await xray_api_remove_client(u.username, inbound);
                    await xray_api_add_client(u.xray_uuid, u.username, u.maximum_connections || 0, (u.expire || 0) * 1000, inbound);
                }
            } else if (clientInPanel && (!clientInPanel.enable || clientInPanel.limitIp !== (u.maximum_connections || 0) || clientInPanel.expiryTime !== (u.expire || 0) * 1000)) {
                // Re-enable user or update limits
                console.log(`Updating/Re-enabling user in Xray: ${u.username}`);
                clientInPanel.enable = true;
                clientInPanel.limitIp = u.maximum_connections || 0;
                clientInPanel.expiryTime = (u.expire || 0) * 1000;
                await xray_api_update_client(clientInPanel.id, clientInPanel, inbound);
            }
        }
    }

    // 4. Update Panel clients that are not in Active Users (Disable or Remove)
    for(const [email, uuid] of panelClientsMap) {
        if(email === 'installer') continue; 
        if(!activeUsernames.includes(email)) {
             // Check if user exists in DB at all
            const userInDb = await User.findOne({username: email});
            if(userInDb) {
                 // User exists but is inactive -> Disable
                 const clientInPanel = currentClients.find(c => c.email === email);
                 if(clientInPanel && clientInPanel.enable) {
                     console.log(`Disabling inactive user in Xray: ${email}`);
                     clientInPanel.enable = false;
                     await xray_api_update_client(clientInPanel.id, clientInPanel, inbound);
                 }
            } else {
                 // User deleted from DB -> Remove
                 console.log(`Removing deleted user from Xray: ${email}`);
                 await xray_api_remove_client(email, inbound);
            }
        }
    }

    return true;
}

const sync_xray_single_user = async (username, inboundOverride = null) =>
{
    if(!(await isXrayAvailable())) return false;
    
    const user = await User.findOne({ username });
    if(!user) return false; 

    const inbound = inboundOverride || await get_xui_inbound();
    if(!inbound) return false;

    const now = get_now();
    const isActive = user.status === "active" && 
                     (user.expire || 0) > now && 
                     ((user.data_limit || 0) === 0 || ((user.used_traffic || 0) + (user.xray_used_traffic || 0)) < (user.data_limit || 0));

    let currentClient = null;
    try {
        const settings = JSON.parse(inbound.settings);
        if(settings && settings.clients) {
            currentClient = settings.clients.find(c => c.email === username);
        }
    } catch(e) {}

    if(isActive) {
        if(!user.xray_uuid) {
            user.xray_uuid = (crypto.randomUUID ? crypto.randomUUID() : uuidv4());
            await User.updateOne({ username }, { xray_uuid: user.xray_uuid });
        }

        if(!currentClient) {
            await xray_api_add_client(user.xray_uuid, username, user.maximum_connections || 0, (user.expire || 0) * 1000, inbound);
        } else {
            if(currentClient.id !== user.xray_uuid) {
                // Update client instead of remove/add to preserve stats
                const oldUuid = currentClient.id;
                currentClient.id = user.xray_uuid;
                currentClient.enable = true;
                currentClient.limitIp = user.maximum_connections || 0;
                currentClient.expiryTime = (user.expire || 0) * 1000;
                
                await xray_api_update_client(oldUuid, currentClient, inbound);
            } else if (!currentClient.enable || currentClient.limitIp !== (user.maximum_connections || 0) || currentClient.expiryTime !== (user.expire || 0) * 1000) {
                // Re-enable user or update limits
                currentClient.enable = true;
                currentClient.limitIp = user.maximum_connections || 0;
                currentClient.expiryTime = (user.expire || 0) * 1000;
                await xray_api_update_client(currentClient.id, currentClient, inbound);
            }
        }
    } else {
        if(currentClient && currentClient.enable) {
            // Disable user instead of remove
            currentClient.enable = false;
            await xray_api_update_client(currentClient.id, currentClient, inbound);
        }
    }
    
    return true;
}

const sync_awg_single_user = async (username) =>
{
    const user = await User.findOne({ username }).lean();
    if(!user) return false;

    const now = get_now();
    const shouldEnable = user.status === "active" && (user.expire || 0) > now && ((user.data_limit || 0) === 0 || (user.used_traffic || 0) < (user.data_limit || 0));

    let interfaceStr = await get_wg0_interface();
    let lines = interfaceStr.split("\n");
    const clientsTable = await get_amnezia_clients_table();

    const ctEntry = clientsTable.find(it => it.userData && it.userData.clientName === username);
    const ctKey = ctEntry ? ctEntry.clientId : "";

    const pubKey = user.public_key;
    const findPeerIndexByKey = (key) => lines.findIndex(l => l.includes("PublicKey = ") && l.includes(key));
    let peerKeyIndex = findPeerIndexByKey(pubKey);
    if(peerKeyIndex === -1 && ctKey) peerKeyIndex = findPeerIndexByKey(ctKey);

    let dedicatedIp = "";
    try {
        const m = (user.connection_string || "").split("\n").find(l=>l.trim().startsWith("Address = "));
        dedicatedIp = m ? m.split(" = ")[1].trim() : "";
    } catch(e) {}

    let psk = "";
    if(peerKeyIndex !== -1)
    {
        const pskLine = lines[peerKeyIndex+1] || "";
        if(pskLine.trim().startsWith("PresharedKey = ")) psk = pskLine.split(" = ")[1].trim();
    }
    if(!psk)
    {
        const docker_id = await get_amnezia_container_id();
        try { psk = (await exec_on_container(docker_id, "wg genpsk")).trim(); } catch(e) {}
    }

    let changedInterface = false;

    if(peerKeyIndex === -1)
    {
        const base = interfaceStr.endsWith('\n') ? interfaceStr : interfaceStr + '\n';
        const block = [
            "[Peer]",
            `PublicKey = ${pubKey}`,
            `PresharedKey = ${psk}`,
            `AllowedIPs = ${dedicatedIp}`,
            ""
        ].join("\n");
        interfaceStr = `${base}${block}`;
        changedInterface = true;
        lines = interfaceStr.split("\n");
        peerKeyIndex = findPeerIndexByKey(pubKey);
    }
    else
    {
        const currentKey = lines[peerKeyIndex].split(" = ")[1].trim();
        if(currentKey !== pubKey)
        {
            lines[peerKeyIndex] = `PublicKey = ${pubKey}`;
            changedInterface = true;
        }
        const allowedIndex = peerKeyIndex + 2;
        if(lines[allowedIndex] && lines[allowedIndex].trim().startsWith("AllowedIPs = "))
        {
            const cur = lines[allowedIndex].split(" = ")[1].trim();
            if(cur !== dedicatedIp)
            {
                lines[allowedIndex] = `AllowedIPs = ${dedicatedIp}`;
                changedInterface = true;
            }
        }
    }

    if(peerKeyIndex !== -1)
    {
        const peerStart = peerKeyIndex - 1;
        if(peerStart > 3 && lines[peerStart].includes("[Peer]"))
        {
            const isCommented = (i) => lines[i].startsWith("#");
            const commentLine = (i) => { if(!isCommented(i)) { lines[i] = "#"+lines[i]; changedInterface = true; } };
            const uncommentLine = (i) => { if(isCommented(i)) { lines[i] = lines[i].replace(/^#/,""); changedInterface = true; } };
            if(!shouldEnable)
            {
                commentLine(peerStart);
                commentLine(peerKeyIndex);
                commentLine(peerKeyIndex+1);
                commentLine(peerKeyIndex+2);
            }
            else
            {
                uncommentLine(peerStart);
                uncommentLine(peerKeyIndex);
                uncommentLine(peerKeyIndex+1);
                uncommentLine(peerKeyIndex+2);
            }
        }
    }

    if(changedInterface)
    {
        await replace_wg0_interface(lines.join("\n"));
        await sync_configs();
    }

    let changedCT = false;
    if(ctEntry)
    {
        if(ctEntry.clientId !== pubKey)
        {
            ctEntry.clientId = pubKey;
            changedCT = true;
        }
    }
    else
    {
        let creation_date = new Date((user.expire || get_now()) * 1000).toString().split(" GMT")[0];
        creation_date = creation_date.split(" ");
        const temp = creation_date[creation_date.length - 1];
        creation_date[creation_date.length - 1] = creation_date[creation_date.length - 2];
        creation_date[creation_date.length - 2] = temp;
        creation_date = creation_date.join(" ");
        clientsTable.push({ clientId: pubKey, userData: { clientName: username, creationDate: creation_date } });
        changedCT = true;
    }
    if(changedCT)
    {
        await replace_amnezia_clients_table(JSON.stringify(clientsTable, null, 4));
    }

    return true;
}

const get_real_subscription_url = async (api_key, installation_uuid) =>
{
    const decoded = jwt.verify(api_key, SUB_JWT_SECRET);
    const proto = decoded.proto || "awg";
    console.log(`===> Serving ${proto} subscription for ${decoded.username}`);
    const user = await User.findOne({ username: decoded.username });
    if(!user) throw new Error("User not found");

    const now = get_now();
    if(user.status !== "active" || (user.expire || 0) < now) throw new Error("User expired");

    if(!user.connection_uuids.includes(installation_uuid))
    {
        if((user.connection_uuids || []).length >= (user.maximum_connections || 1)) throw new Error("Maximum connections reached");
        await User.updateOne({ username: user.username }, { connection_uuids: [ ...(user.connection_uuids || []), installation_uuid ] });
    }

    let config = null;
    if(proto === "xray") config = user.xray_real_subscription_url;
    else config = user.real_subscription_url;

    if(!config) throw new Error("Config not found for this protocol");
    return { config };
}

const update_users_subscription_desc = async () =>
{
    const users = await User.find({ status: { $ne: 'disabled' } });

    console.log("===> Updating Sub Links");

    for(let user of users)
    {
        try {
            const updateObj = {};
            
            // Update Amnezia WG subscription
            updateObj.subscription_url = await build_awg_subscription_url(user);

            // Update Xray subscription if enabled
            if(user.xray_enabled)
            {
                updateObj.xray_subscription_url = await build_xray_subscription_url(user);
            }

            await User.updateOne({username: user.username}, updateObj);
        } catch (e) {
            console.log(`Failed to update subscription desc for ${user.username}:`, e);
        }
    }

    console.log("===> Sub Links Updated");
}

const unlock_user_account = async (username) =>
{
    await create_user(username,0,0,0,true);
}

const decode_base64_data = (data) =>
{
    return Buffer.from(data, 'base64').toString('ascii');
}

const encode_base64_data = (data) =>
{
    return Buffer.from(data, 'utf-8').toString('base64');
}

const decode_amnezia_data = async (data) =>
{
    return await exec("python3 decoder.py " + data);
}

const encode_amnezia_data = async (data) =>
{
    const temp_file_id = uid();
    await fs.writeFile(`./temp${temp_file_id}.json`,data);
    var result = await exec("python3 decoder.py -i ./temp"+temp_file_id+".json");
    await fs.unlink(`./temp${temp_file_id}.json`);
    return result;
}
const build_awg_subscription_url = async (user) =>
{
    const raw = {
        config_version:1,
        api_endpoint:`https://${process.env.ENDPOINT_ADDRESS}/sub`,
        protocol:"awg",
        name:process.env.COUNTRY_EMOJI + " " + user.username,
        description:generate_desc(user.expire, user.maximum_connections || 1),
        api_key:jwt.sign({username:user.username},SUB_JWT_SECRET),
    };
    return await encode_amnezia_data(JSON.stringify(raw));
}

const build_xray_subscription_url = async (user) =>
{
    const raw = {
        config_version: 1,
        api_endpoint: `https://${process.env.ENDPOINT_ADDRESS}/sub`,
        protocol: "xray",
        name: process.env.COUNTRY_EMOJI + " " + user.username + "_xray",
        description: generate_desc(user.expire, user.maximum_connections || 1),
        api_key: jwt.sign({ username: user.username, proto: "xray" }, SUB_JWT_SECRET),
    };
    return await encode_amnezia_data(JSON.stringify(raw));
}

const build_awg_subscription_raw = (cfg) =>
{
    const last = {
        H1: cfg.H1,
        H2: cfg.H2,
        H3: cfg.H3,
        H4: cfg.H4,
        Jc: cfg.Jc,
        Jmax: cfg.Jmax,
        Jmin: cfg.Jmin,
        S1: cfg.S1,
        S2: cfg.S2,
        Itime: AWG_ITIME,
        I1: AWG_I1,
        allowed_ips: ["0.0.0.0/0","::/0"],
        clientId: cfg.public_key,
        client_ip: cfg.dedicated_ip.split("/")[0],
        client_priv_key: cfg.private_key,
        client_pub_key: cfg.public_key,
        config: `[Interface]\nAddress = ${cfg.dedicated_ip}\nDNS = ${PRIMARY_DNS}, ${SECONDARY_DNS}\nPrivateKey = ${cfg.private_key}\nJc = ${cfg.Jc}\nJmin = ${cfg.Jmin}\nJmax = ${cfg.Jmax}\nS1 = ${cfg.S1}\nS2 = ${cfg.S2}\nH1 = ${cfg.H1}\nH2 = ${cfg.H2}\nH3 = ${cfg.H3}\nH4 = ${cfg.H4}\nItime = ${AWG_ITIME}\nI1 = ${AWG_I1}\n\n[Peer]\nPublicKey = ${cfg.client_public_key}\nPresharedKey = ${cfg.psk}\nAllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = ${process.env.SERVER_ADDRESS}:${cfg.amnezia_port}\nPersistentKeepalive = 25\n`,
        hostName: `${process.env.SERVER_ADDRESS}`,
        mtu: "1280",
        persistent_keep_alive: "25",
        port: cfg.amnezia_port,
        psk_key: cfg.psk,
        server_pub_key: cfg.client_public_key,
    };
    return {
        containers: [
            {
                awg: {
                    H1: cfg.H1,
                    H2: cfg.H2,
                    H3: cfg.H3,
                    H4: cfg.H4,
                    Jc: cfg.Jc,
                    Jmax: cfg.Jmax,
                    Jmin: cfg.Jmin,
                    S1: cfg.S1,
                    S2: cfg.S2,
                    last_config: JSON.stringify(last),
                    port: `${cfg.amnezia_port}`,
                    transport_proto: "udp",
                },
                container: "amnezia-awg",
            }
        ],
        defaultContainer: "amnezia-awg",
        description: "AWG Server",
        dns1: `${PRIMARY_DNS}`,
        dns2: `${SECONDARY_DNS}`,
        hostName: `${process.env.SERVER_ADDRESS}`,
    };
}

const buildAwgConfigForUser = async (cfg) =>
{
    const connection_string = `

[Interface]
Address = ${cfg.dedicated_ip}
DNS = ${PRIMARY_DNS}, ${SECONDARY_DNS}
PrivateKey = ${cfg.private_key}
Jc = ${cfg.Jc}
Jmin = ${cfg.Jmin}
Jmax = ${cfg.Jmax}
S1 = ${cfg.S1}
S2 = ${cfg.S2}
H1 = ${cfg.H1}
H2 = ${cfg.H2}
H3 = ${cfg.H3}
H4 = ${cfg.H4}
Itime = ${AWG_ITIME}
I1 = ${AWG_I1}

[Peer]
PublicKey = ${cfg.client_public_key}
PresharedKey = ${cfg.psk}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = ${process.env.SERVER_ADDRESS}:${cfg.amnezia_port}
PersistentKeepalive = 25
`;

    const raw = build_awg_subscription_raw(cfg);
    const real_subscription_url = await encode_amnezia_data(JSON.stringify(raw));
    return { connection_string, real_subscription_url };
}

const get_next_available_ip = async () => {
    const interface = await get_wg0_interface();

    // استخراج لیست IPها از خروجی اینترفیس
    const ips = interface
        .split("\n")
        .filter(line => line.includes("AllowedIPs"))
        .map(line => line.split(" = ")[1].split("/")[0]);

    // تابع تبدیل IP به عدد و بالعکس
    const ip2number = (ip) =>
        ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
    const number2ip = (num) =>
        [num >>> 24, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join(".");

    const subnetStart = ip2number("10.8.1.2");
    const subnetEnd = ip2number("10.8.255.255");

    const usedSet = new Set(ips.map(ip2number));

    for (let ip = subnetStart; ip <= subnetEnd; ip++) {
        if (usedSet.has(ip)) continue;

        const ipStr = number2ip(ip);
        const lastOctet = parseInt(ipStr.split(".")[3], 10);

        if ([0, 254, 255].includes(lastOctet)) continue;

        return `${ipStr}/32`;
    }

    throw new Error("No more available IPs");
}

const restart_awg_container = async () =>
{
    await exec("docker restart amnezia-awg");
    const container_id = await get_amnezia_container_id();
    await exec_on_container_sh(container_id,"iptables -A FORWARD -s 10.8.0.0/16 -j ACCEPT");
    await exec_on_container_sh(container_id,"iptables -t nat -A POSTROUTING -s 10.8.0.0/16 -o eth0 -j MASQUERADE"); 
    await exec_on_container_sh(container_id,"iptables -t nat -A POSTROUTING -s 10.8.0.0/16 -o eth1 -j MASQUERADE"); 
    await exec_on_container_sh(container_id,"iptables-save > /etc/iptables/rules.v4"); 
    console.log("AWG container restarted");
}

const backup_data = async () =>
{
    try { await fs.mkdir("./dbbu"); } catch(err) {} 
    
    const users = await User.find();
    const amnezia_client_table = await get_amnezia_clients_table();
    const amnezia_interface = await get_wg0_interface();

    await fs.writeFile("./dbbu/users.json",JSON.stringify(users,null,4));
    await fs.writeFile("./dbbu/amnezia_clients_table.json",JSON.stringify(amnezia_client_table,null,4));
    await fs.writeFile("./dbbu/amnezia_interface.conf",amnezia_interface);

    let xrayBackedUp = false;
    // Xray backup skipped for 3x-ui

    var zip = new AdmZip();
    var zip_id = Date.now();
    var final_file = "./dbbu/bu"+zip_id+".zip"
    
    zip.addLocalFile("./dbbu/users.json");
    zip.addLocalFile("./dbbu/amnezia_clients_table.json");
    zip.addLocalFile("./dbbu/amnezia_interface.conf");
    zip.addLocalFile("./.env");
    
    // Backup 3x-ui database if exists
    try {
        const xuiDbPath = "/etc/x-ui/x-ui.db";
        await fs.access(xuiDbPath);
        zip.addLocalFile(xuiDbPath);
        console.log("Added 3x-ui database to backup");
    } catch(e) {
        console.log("3x-ui database not found at /etc/x-ui/x-ui.db");
    }

    zip.addLocalFolder("/etc/nginx/sites-available","sites-available");
    zip.addLocalFolder("/etc/letsencrypt/live","live");

    zip.writeZip(final_file);

    await fs.unlink("./dbbu/users.json");
    await fs.unlink("./dbbu/amnezia_clients_table.json");
    await fs.unlink("./dbbu/amnezia_interface.conf");

    return final_file;
}

const ensure_xray_keys_from_backup = async () =>
{
    // Deprecated: X-UI handles its own keys/certs, or we manage them via API if needed.
    return;
}

const with_retry = async (fn, maxRetries = 2, delay = 1000) => {
    let lastError;
    for (let i = 0; i <= maxRetries; i++) {
        try {
            const result = await fn();
            if (result) return result;
        } catch (e) {
            lastError = e;
        }
        if (i < maxRetries) await sleep(delay / 1000); // sleep takes seconds
    }
    return false;
}

const xray_api_update_client = async (clientUuid, clientData, inboundOverride = null) => {
    return await with_retry(async () => {
        try {
            const inbound = inboundOverride || await get_xui_inbound();
            if(!inbound) return false;
            
            const settings = JSON.stringify({ clients: [clientData] });
            
            const res = await xui_call('post', `/panel/api/inbounds/updateClient/${clientUuid}`, {
                id: inbound.id,
                settings: settings
            });
            
            return res && res.success;
        } catch(e) {
            console.log(`Error updating client via api (${clientData.email}):`, e.message);
            return false;
        }
    });
}

const xray_api_reset_client_traffic = async (email, inboundOverride = null) => {
    return await with_retry(async () => {
        try {
            const inbound = inboundOverride || await get_xui_inbound();
            if(!inbound) return false;
            
            const res = await xui_call('post', `/panel/api/inbounds/resetClientTraffic/${inbound.id}/${email}`);
            return res && res.success;
        } catch(e) {
            console.log(`Error resetting client traffic via api (${email}):`, e.message);
            return false;
        }
    });
}

const xray_api_add_client = async (uuid, email, limitIp = 0, expiryTime = 0, inboundOverride = null) => {
    return await with_retry(async () => {
        try {
            const inbound = inboundOverride || await get_xui_inbound();
            if(!inbound) {
                console.log(`Error adding client (${email}): Inbound not found on port ${XUI_INBOUND_PORT}`);
                return false;
            }
            
            const streamSettings = JSON.parse(inbound.streamSettings);
            const isReality = streamSettings.security === 'reality';
            
            const client = {
                id: uuid,
                email: email,
                flow: (inbound.protocol === 'vless' && isReality) ? "xtls-rprx-vision" : "",
                limitIp: limitIp,
                totalGB: 0,
                expiryTime: expiryTime,
                enable: true,
                tgId: "",
                subId: ""
            };
            
            const settings = JSON.stringify({ clients: [client] });
            
            const res = await xui_call('post', '/panel/api/inbounds/addClient', {
                id: inbound.id,
                settings: settings 
            });
            
            if(res && res.success) return true;
            console.log(`Error adding client via api (${email}):`, res ? res.msg : "Unknown error");
            return false;
        } catch(e) {
            console.log(`Error adding client via api (${email}):`, e.message);
            return false;
        }
    });
}

const xray_api_remove_client = async (email, inboundOverride = null) => {
    return await with_retry(async () => {
        try {
            const inbound = inboundOverride || await get_xui_inbound();
            if(!inbound) return false;
            
            let clientUuid = "";
            try {
                const settings = JSON.parse(inbound.settings);
                const client = settings.clients.find(c => c.email === email);
                if(client) clientUuid = client.id;
            } catch(e) {}
            
            if(!clientUuid) return true;

            // Correct path found via debug: /panel/api/inbounds/{inboundId}/delClient/{clientUuid}
            const res = await xui_call('post', `/panel/api/inbounds/${inbound.id}/delClient/${clientUuid}`);
            return res && res.success;
        } catch(e) {
            console.log(`Error removing client via api (${email}):`, e.message);
            return false;
        }
    });
}

const ensure_xray_stats_config = async () =>
{
    const inbound = await get_xui_inbound();
    if(!inbound) {
        console.log("Warning: X-UI Inbound not found on port " + XUI_INBOUND_PORT);
        return false;
    }
    return true;
}

const get_xray_traffic_map = async () => {
    try {
        const inbound = await get_xui_inbound();
        if(!inbound) return new Map();
        
        const map = new Map();
        if (inbound.clientStats) {
            for (const stat of inbound.clientStats) {
                 if (stat.email) {
                     map.set(stat.email, (stat.up || 0) + (stat.down || 0));
                 }
            }
        }
        return map;
    } catch(e) {
        console.log("Error getting xray traffic:", e);
        return new Map();
    }
}

const $sync_accounting = async () =>
{
    var users = await User.find({ status: "active" });
    var interface = await get_wg0_interface();
    var interface_lines = interface.split("\n");
    var clients_table = await get_amnezia_clients_table();

    const transferMap = await get_wg_transfers_map();
    
    let inbound = null;
    if (await isXrayAvailable()) {
        inbound = await get_xui_inbound();
    }
    
    const xrayTrafficMap = new Map();
    if (inbound && inbound.clientStats) {
        for (const stat of inbound.clientStats) {
            if (stat.email) {
                xrayTrafficMap.set(stat.email, (stat.up || 0) + (stat.down || 0));
            }
        }
    }

    // اول مطمئن شویم که دو خط اول [Interface] فعال هستند
    if(interface_lines[0].startsWith("#")) {
        interface_lines[0] = interface_lines[0].replace("#", "");
    }
    if(interface_lines[1].startsWith("#")) {
        interface_lines[1] = interface_lines[1].replace("#", "");
    }

    for(let user of users)
    {


        let client_table_user_obj = clients_table.find((item) => item.userData.clientName == user.username);

        if(!client_table_user_obj)
        {
             let creation_date = new Date((user.expire || get_now()) * 1000).toString().split(" GMT")[0];
             creation_date = creation_date.split(" ");
             const temp = creation_date[creation_date.length - 1];
             creation_date[creation_date.length - 1] = creation_date[creation_date.length - 2];
             creation_date[creation_date.length - 2] = temp;
             creation_date = creation_date.join(" ");

             client_table_user_obj = { 
                 clientId: user.public_key, 
                 userData: { 
                     clientName: user.username, 
                     creationDate: creation_date 
                 } 
             };
             clients_table.push(client_table_user_obj);
             
             await replace_amnezia_clients_table(JSON.stringify(clients_table, null, 4));
             console.log(`Restored missing user ${user.username} to clients table`);
        }

        const used_traffic = transferMap.get(user.public_key) ?? false;

        if(used_traffic != false && used_traffic != user.last_captured_traffic)
        {
            if(used_traffic < user.used_traffic)
            {

                var incremental_value;
                if(used_traffic > user.last_captured_traffic) incremental_value = used_traffic - user.last_captured_traffic;
                else incremental_value = used_traffic;

                await User.updateOne({username: user.username}, {used_traffic: user.used_traffic + incremental_value, last_captured_traffic: used_traffic});
                user.used_traffic = user.used_traffic + incremental_value;
                console.log(`User ${user.username} used traffic updated to ${b2gb(used_traffic)} MB (increment)`);
            }

            else if(used_traffic > user.used_traffic)
            {
                await User.updateOne({username: user.username}, {used_traffic, last_captured_traffic: used_traffic});
                user.used_traffic = used_traffic;
                console.log(`User ${user.username} used traffic updated to ${b2gb(used_traffic)} MB (replace)`);
            }

        }

        if(xrayTrafficMap.has(user.username))
        {
            const xrayVal = xrayTrafficMap.get(user.username);
            const currentXrayUsed = user.xray_used_traffic || 0;
            const lastXrayCaptured = user.xray_last_captured_traffic || 0;
            
            if(xrayVal != lastXrayCaptured)
            {
                 let inc = 0;
                 if(xrayVal >= lastXrayCaptured) {
                     inc = xrayVal - lastXrayCaptured;
                 } else {
                     inc = xrayVal;
                 }
                 
                 if (inc > 0) {
                     const newUsed = currentXrayUsed + inc;
                     await User.updateOne({username: user.username}, { xray_used_traffic: newUsed, xray_last_captured_traffic: xrayVal });
                     user.xray_used_traffic = newUsed;
                     console.log(`User ${user.username} Xray traffic updated to ${b2gb(newUsed)} MB (increment)`);
                 } else {
                     await User.updateOne({username: user.username}, { xray_last_captured_traffic: xrayVal });
                 }
            }
        }

        if((user.used_traffic + (user.xray_used_traffic || 0)) >= user.data_limit)
        {
            if(user.status == "active") 
            {
                await User.updateOne({username: user.username}, {status: "limited"});
                user.status = "limited";
                console.log(`User ${user.username} status changed to limited`);
                if(inbound) await sync_xray_single_user(user.username, inbound);
            }
        }

        if(user.expire < get_now())
        {
            if(user.status == "active") 
            {
                await User.updateOne({username: user.username}, {status: "expired"});
                user.status = "expired";
                console.log(`User ${user.username} status changed to expired`);
                if(inbound) await sync_xray_single_user(user.username, inbound);
            }
        }

        if(user.status == "limited" && (user.used_traffic + (user.xray_used_traffic || 0)) < user.data_limit)
        {
            await User.updateOne({username: user.username}, {status: "active"});
            user.status = "active";
            console.log(`User ${user.username} status changed to active`);
            if(inbound) await sync_xray_single_user(user.username, inbound);
        }

        if(user.status == "expired" && user.expire > get_now())
        {
            await User.updateOne({username: user.username}, {status: "active"});
            user.status = "active";
            console.log(`User ${user.username} status changed to active`);
            if(inbound) await sync_xray_single_user(user.username, inbound);
        }


        // ------------------------------ //


        if(user.status != "active")
        {
            var public_key_line_index = interface_lines.findIndex((item) => item.includes(user.public_key));
            if(public_key_line_index > 0 && public_key_line_index < interface_lines.length - 2 && !interface_lines[public_key_line_index + 2].startsWith("#")) 
            {
                // اطمینان حاصل کنیم که با بخش [Interface] کار نداریم - خطوط اول باید محافظت شوند
                var peer_start_line = public_key_line_index - 1;
                if(peer_start_line > 3 && !interface_lines[peer_start_line].includes("[Interface]") && interface_lines[peer_start_line].includes("[Peer]")) {
                    interface_lines[public_key_line_index - 1] = "#"+interface_lines[public_key_line_index - 1];
                    interface_lines[public_key_line_index + 0] = "#"+interface_lines[public_key_line_index + 0];
                    interface_lines[public_key_line_index + 1] = "#"+interface_lines[public_key_line_index + 1];
                    interface_lines[public_key_line_index + 2] = "#"+interface_lines[public_key_line_index + 2];

                    await replace_wg0_interface(interface_lines.join("\n"));
                    await sync_configs();
                    console.log(`UPDATED INTERFACE FOR ${user.username}`);
                }
            }
        }

        else
        {
            var public_key_line_index = interface_lines.findIndex((item) => item.includes(user.public_key));
            if(public_key_line_index > 0 && public_key_line_index < interface_lines.length - 2 && interface_lines[public_key_line_index + 2].startsWith("#")) 
            {
                // اطمینان حاصل کنیم که با بخش [Interface] کار نداریم - خطوط اول باید محافظت شوند
                var peer_start_line = public_key_line_index - 1;
                if(peer_start_line > 3 && !interface_lines[peer_start_line].includes("[Interface]") && interface_lines[peer_start_line].includes("[Peer]")) {
                    interface_lines[public_key_line_index - 1] = interface_lines[public_key_line_index - 1].replace("#","");
                    interface_lines[public_key_line_index + 0] = interface_lines[public_key_line_index + 0].replace("#","");
                    interface_lines[public_key_line_index + 1] = interface_lines[public_key_line_index + 1].replace("#","");
                    interface_lines[public_key_line_index + 2] = interface_lines[public_key_line_index + 2].replace("#","");

                    await replace_wg0_interface(interface_lines.join("\n"));
                    await sync_configs();
                    console.log(`UPDATED INTERFACE FOR ${user.username}`);
                }
            }
        }

        // ------------------------------ //
    }
    
}

cron.schedule('0 5 * * *', () => 
{
    restart_awg_container();
}, 
{
    timezone: 'Asia/Tehran',
});

cron.schedule('0 0 * * *', () => 
{
    update_users_subscription_desc();
}, 
{
    timezone: 'Asia/Tehran',
});



const user_schema = new mongoose.Schema
({
    username: String,
    expire: Number,
    data_limit: Number,
    used_traffic: { type: Number, default: 0 },
    last_captured_traffic: { type: Number, default: 0 },
    lifetime_used_traffic: { type: Number, default: 0 },
    status: { type: String, default: "active", enum: ["active","limited","expired","disabled"] },
    created_at: { type: Number, default: get_now },
    connection_string: { type: String, default: "" },
    subscription_url: { type: String, default: "" },
    real_subscription_url: { type: String, default: "" },
    public_key: { type: String, default: "" },
    maximum_connections: { type: Number, default: 1 },
    connection_uuids: { type: Array, default: [] },
    has_been_unlocked: { type: Boolean, default: false },
    xray_uuid: { type: String, default: "" },
    xray_enabled: { type: Boolean, default: false },
    xray_last_config: { type: String, default: "" },
    xray_real_subscription_url: { type: String, default: "" },
    xray_subscription_url: { type: String, default: "" },
    xray_used_traffic: { type: Number, default: 0 },
    xray_last_captured_traffic: { type: Number, default: 0 },

},{collection: 'users',versionKey: false});

const log_schema = new mongoose.Schema
({
    msg: { type: String, required: true },
    created_at: { type: Number, default: get_now },
},{collection: 'logs',versionKey: false});

const User = mongoose.model('User', user_schema);
const Log = mongoose.model('Log', log_schema);


module.exports = 
{
    User,
    Log,
    uid,
    generate_token,
    b2gb,
    get_now,
    validate_token,
    get_days_passed,
    get_system_status,
    create_user,
    get_user_for_marzban,
    extend_expire_times,
    backup_data,
    get_all_users_for_marzban,
    reset_user_account,
    edit_user,
    delete_user,
    sleep,
    get_real_subscription_url,
    unlock_user_account,
    restart_awg_container,
    update_users_subscription_desc,
    
    // توابع مورد نیاز برای cleanup script
    get_wg0_interface,
    get_amnezia_clients_table,
    replace_wg0_interface,
    replace_amnezia_clients_table,
    sync_configs,
    get_amnezia_container_id,
    // Xray Docker functions removed

    get_xray_static_info,
    get_xui_inbound,
    build_xray_client_config_from,
    sync_xray_from_db,
    sync_xray_single_user,
    exec_on_container,
    build_xray_subscription_url_from,
    encode_amnezia_data,
    build_awg_subscription_url,
    build_xray_subscription_url,
    build_awg_subscription_raw,
    buildAwgConfigForUser,
    
    $sync_accounting,
    // er, Docker functions remod
    sync_awg_single_user,
    ensure_xray_keys_from_backup,
    get_xray_traffic_map,
    ensure_xray_stats_config,
    isXrayAvailable,
}
