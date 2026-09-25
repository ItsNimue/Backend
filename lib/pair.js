import crypto from 'node:crypto';
import { PairStatus } from './db.js';
import { createPairSocket } from './socket.js';
import { startRuntimeSession } from './runtimeClient.js';

function generateSessionId() {
    return `MrNobody~${crypto.randomBytes(16).toString('hex')}`;
}

export async function startCodePairing(number) {
    const sessionId = generateSessionId();
    await PairStatus.create({ sessionId, status: 'pending' });
    runCodeSession(sessionId, number).catch(async (err) => {
        console.error('Pairing Code Error:', err);
        await PairStatus.updateOne({ sessionId }, { status: 'failed', error: err.message });
    });
    return sessionId;
}

async function runCodeSession(sessionId, number, attempt = 1) {
    const cleanedNumber = String(number || '').replace(/[^0-9]/g, '');
    if (!cleanedNumber) throw new Error('Phone Number එක අවශ්‍යයි');

    const { sock, state, saveCreds } = await createPairSocket(sessionId);
    let closed = false;
    let intentionalClose = false;
    let pairingCodeRequested = false;
    let codeTimer = null;

    const requestCode = async () => {
        if (closed || pairingCodeRequested || state.creds.registered) return;
        pairingCodeRequested = true;
        try {
            const code = await sock.requestPairingCode(cleanedNumber);
            if (closed) return;
            await PairStatus.updateOne({ sessionId }, { status: 'code', code, error: null });
        } catch (err) {
            pairingCodeRequested = false;
            if (!closed) {
                await PairStatus.updateOne({ sessionId }, { status: 'failed', error: err.message });
            }
        }
    };

    codeTimer = setTimeout(() => requestCode().catch(console.error), 3000);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        try {
            if (connection === 'open') {
                clearTimeout(codeTimer);

                // Critical: flush the final credential state before runtime starts.
                await saveCreds();

                await PairStatus.updateOne(
                    { sessionId },
                    {
                        $set: { status: 'connecting', code: null, error: null },
                        $unset: { expiresAt: '' }
                    }
                );

                try {
                    await startRuntimeSession(sessionId);
                } catch (err) {
                    await PairStatus.updateOne(
                        { sessionId },
                        { status: 'failed', error: `Bot runtime start failed: ${err.message}` }
                    );
                    throw err;
                }

                // No Session ID is ever sent to the WhatsApp inbox.
                // Runtime owns the persistent session from MongoDB.
                intentionalClose = true;

                setTimeout(() => {
                    try { sock.end(undefined); } catch {}
                }, 1500);
            }

            if (connection === 'close') {
                closed = true;
                clearTimeout(codeTimer);

                if (intentionalClose) return;

                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === 401 || attempt >= 5) {
                    await PairStatus.updateOne(
                        { sessionId },
                        { status: 'failed', error: statusCode === 401 ? 'WhatsApp rejected the session.' : 'Connection retries exhausted.' }
                    );
                    return;
                }

                setTimeout(() => {
                    runCodeSession(sessionId, cleanedNumber, attempt + 1).catch(async err => {
                        await PairStatus.updateOne({ sessionId }, { status: 'failed', error: err.message });
                    });
                }, 2000);
            }
        } catch (err) {
            console.error('Pair Code Connection Error:', err);
            await PairStatus.updateOne({ sessionId }, { status: 'failed', error: err.message });
        }
    });
}
