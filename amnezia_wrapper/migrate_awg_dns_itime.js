require('dotenv').config();

const {
  User,
  encode_amnezia_data,
  build_awg_subscription_raw,
} = require('./utils.js');

const PRIMARY_DNS = process.env.PRIMARY_DNS || '8.8.8.8';
const SECONDARY_DNS = process.env.SECONDARY_DNS || '8.8.4.4';
const AWG_ITIME = process.env.AWG_ITIME || '';
const AWG_I1 = process.env.AWG_I1 || '';

function parseKey(lines, key) {
  const line = lines.find(l => l.trim().startsWith(key + ' = '));
  return line ? line.split(' = ')[1].trim() : '';
}

function rewriteConnectionString(cs) {
  if (!cs || typeof cs !== 'string') return cs;
  const lines = cs.split('\n');

  const interfaceStart = lines.findIndex(l => l.trim() === '[Interface]');
  const peerStart = lines.findIndex(l => l.trim() === '[Peer]');
  if (interfaceStart === -1 || peerStart === -1) return cs;

  for (let i = interfaceStart + 1; i < peerStart; i++) {
    if (lines[i].trim().startsWith('DNS =')) {
      lines[i] = `DNS = ${PRIMARY_DNS}, ${SECONDARY_DNS}`;
      break;
    }
  }

  const hasItime = lines.slice(interfaceStart + 1, peerStart).some(l => l.trim().startsWith('Itime ='));
  const hasI1 = lines.slice(interfaceStart + 1, peerStart).some(l => l.trim().startsWith('I1 ='));

  if (!hasItime || !hasI1) {
    const insertPos = peerStart; // درست قبل از [Peer]
    if (!hasItime) lines.splice(insertPos, 0, `Itime = ${AWG_ITIME}`);
    if (!hasI1) lines.splice(insertPos + (hasItime ? 0 : 1), 0, `I1 = ${AWG_I1}`);
  } else {
    for (let i = interfaceStart + 1; i < peerStart; i++) {
      if (lines[i].trim().startsWith('Itime =')) lines[i] = `Itime = ${AWG_ITIME}`;
      if (lines[i].trim().startsWith('I1 =')) lines[i] = `I1 = ${AWG_I1}`;
    }
  }

  return lines.join('\n');
}

function buildFromConnectionString(user, cs) {
  const lines = cs.split('\n');
  const interfaceStart = lines.findIndex(l => l.trim() === '[Interface]');
  const peerStart = lines.findIndex(l => l.trim() === '[Peer]');
  if (interfaceStart === -1 || peerStart === -1) throw new Error('Invalid config format');

  const iface = lines.slice(interfaceStart + 1, peerStart);
  const peer = lines.slice(peerStart + 1);

  const dedicated_ip = parseKey(iface, 'Address');
  const private_key = parseKey(iface, 'PrivateKey');
  const Jc = parseKey(iface, 'Jc');
  const Jmin = parseKey(iface, 'Jmin');
  const Jmax = parseKey(iface, 'Jmax');
  const S1 = parseKey(iface, 'S1');
  const S2 = parseKey(iface, 'S2');
  const H1 = parseKey(iface, 'H1');
  const H2 = parseKey(iface, 'H2');
  const H3 = parseKey(iface, 'H3');
  const H4 = parseKey(iface, 'H4');

  const client_public_key = parseKey(peer, 'PublicKey');
  const psk = parseKey(peer, 'PresharedKey');
  const endpoint = parseKey(peer, 'Endpoint');
  const amnezia_port = endpoint && endpoint.includes(':') ? endpoint.split(':')[1] : '';

  return {
    H1,
    H2,
    H3,
    H4,
    Jc,
    Jmin,
    Jmax,
    S1,
    S2,
    public_key: user.public_key,
    dedicated_ip,
    private_key,
    client_public_key,
    psk,
    amnezia_port,
  };
}

async function migrate() {
  const users = await User.find({}).lean();
  let ok = 0, fail = 0, skip = 0;
  for (const user of users) {
    try {
      if (user.status === 'disabled') { skip++; continue; }
      if (!user.connection_string || typeof user.connection_string !== 'string' || user.connection_string.trim() === '') { fail++; continue; }

      const newConn = rewriteConnectionString(user.connection_string);

      const cfg = buildFromConnectionString(user, newConn);
      const raw = build_awg_subscription_raw(cfg);
      const real_subscription_url = await encode_amnezia_data(JSON.stringify(raw));

      await User.updateOne({ _id: user._id }, {
        $set: {
          connection_string: newConn,
          real_subscription_url,
        }
      });
      ok++;
    } catch (e) {
      console.error(`migrate error for user ${user.username}:`, e.message || e);
      fail++;
      continue;
    }
  }
  console.log(`migrate done. ok=${ok} fail=${fail} skip=${skip}`);
  process.exit(0);
}

migrate();