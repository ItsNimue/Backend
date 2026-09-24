import axios from 'axios';
import config from '../config.js';

export async function startRuntimeSession(sessionId) {
    if (!config.BOT_RUNTIME_URL) {
        throw new Error('BOT_RUNTIME_URL is not configured.');
    }
    const res = await axios.post(
        `${config.BOT_RUNTIME_URL}/internal/sessions/start`,
        { sessionId },
        {
            headers: { 'x-internal-token': config.INTERNAL_API_TOKEN },
            timeout: 20000
        }
    );
    return res.data;
}
