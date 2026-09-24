import { BufferJSON, initAuthCreds, proto } from '@whiskeysockets/baileys';
import { AuthKey } from './db.js';

// Session Id එකක් අනුව MongoDB එකේ Baileys Auth State එක Store කරන Helper එක
async function useMongoAuthState(sessionId) {
    const writeData = async (key, data) => {
        const value = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
        await AuthKey.updateOne(
            { sessionId, key },
            { sessionId, key, value },
            { upsert: true }
        );
    };

    const readData = async (key) => {
        try {
            const doc = await AuthKey.findOne({ sessionId, key });
            if (!doc) return null;
            return JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver);
        } catch {
            return null;
        }
    };

    const removeData = async (key) => {
        try { await AuthKey.deleteOne({ sessionId, key }); } catch {}
    };

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(key, value) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData('creds', creds)
    };
}

export { useMongoAuthState }
