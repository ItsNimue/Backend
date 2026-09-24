
import makeWASocket, {
    Browsers,
    fetchLatestWaWebVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { useMongoAuthState } from './authState.js';

export async function createPairSocket(sessionId) {
    const { state, saveCreds } = await useMongoAuthState(sessionId);
    const { version } = await fetchLatestWaWebVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.ubuntu('Chrome')
    });

    sock.ev.on('creds.update', saveCreds);

    return { sock, state, saveCreds };
}
