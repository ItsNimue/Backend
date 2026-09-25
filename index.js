import express from 'express';
import cors from 'cors';
import config from './config.js';
import { connectDB, AuthKey, SessionSettings, PairStatus } from './lib/db.js';
import { startCodePairing } from './lib/pair.js';

const app = express();

const origins = config.CORS_ORIGINS === '*'
    ? true
    : config.CORS_ORIGINS.split(',').map(v => v.trim()).filter(Boolean);

app.use(cors({ origin: origins }));
app.use(express.json({ limit: '1mb' }));

function requireInternal(req, res, next) {
    if (!config.INTERNAL_API_TOKEN) {
        return res.status(503).json({ error: 'Internal API is not configured.' });
    }
    if (req.get('x-internal-token') !== config.INTERNAL_API_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }
    next();
}

app.get('/', (_req, res) => {
    res.json({ ok: true, service: 'MrNobody PairBackend' });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/pair/start', async (req, res) => {
    try {
        const { number } = req.body || {};
        if (!number) {
            return res.status(400).json({ error: 'Phone Number is required.' });
        }

        const sessionId = await startCodePairing(number);
        res.json({ sessionId });
    } catch (err) {
        console.error('Pair Start Error:', err);
        res.status(500).json({ error: err.message || 'Unable to start pairing.' });
    }
});

app.get('/api/pair/status/:sessionId', async (req, res) => {
    try {
        const doc = await PairStatus.findOne({ sessionId: req.params.sessionId }).lean();
        if (!doc) return res.status(404).json({ error: 'Session not found.' });

        res.json({
            status: doc.status,
            code: doc.code || null,
            error: doc.error || null
        });
    } catch (err) {
        res.status(500).json({ error: 'Unable to get status.' });
    }
});

// Bot runtime asks this on every boot to know which sessions to resume.
app.get('/internal/sessions/active', requireInternal, async (req, res) => {
    try {
        const docs = await AuthKey.find({ key: 'creds' }).lean();

        const sessionIds = docs
            .filter(d => d.value && d.value.registered === true)
            .map(d => d.sessionId);

        res.json({ sessionIds });
    } catch (err) {
        res.status(500).json({ error: 'Unable to list active sessions.' });
    }
});

// Runtime -> PairBackend heartbeat/status.
app.post('/internal/runtime/status', requireInternal, async (req, res) => {
    try {
        const { sessionId, status, error } = req.body || {};
        const allowed = ['starting', 'online', 'offline', 'logged_out', 'failed'];

        if (!sessionId || !allowed.includes(status)) {
            return res.status(400).json({ error: 'Invalid runtime status.' });
        }

        const now = new Date();
        const publicStatus =
            status === 'online' ? 'online' :
            status === 'logged_out' ? 'logged_out' :
            status === 'failed' ? 'failed' :
            'connecting';

        await PairStatus.updateOne(
            { sessionId },
            {
                $set: {
                    status: publicStatus,
                    error: error || null,
                    'runtime.status': status,
                    'runtime.lastHeartbeatAt': now,
                    'runtime.lastError': error || null
                }
            }
        );

        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Unable to update runtime status.' });
    }
});

// Internal auth/settings API.
// These endpoints are never exposed to the browser.
app.get('/internal/session/:sessionId/auth/:key', requireInternal, async (req, res) => {
    try {
        const doc = await AuthKey.findOne({
            sessionId: req.params.sessionId,
            key: req.params.key
        }).lean();

        res.json({ value: doc?.value ?? null });
    } catch {
        res.status(500).json({ error: 'Unable to read auth state.' });
    }
});

app.put('/internal/session/:sessionId/auth/:key', requireInternal, async (req, res) => {
    try {
        const { sessionId, key } = req.params;

        await AuthKey.updateOne(
            { sessionId, key },
            { sessionId, key, value: req.body?.value },
            { upsert: true }
        );

        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Unable to save auth state.' });
    }
});

app.delete('/internal/session/:sessionId/auth/:key', requireInternal, async (req, res) => {
    try {
        await AuthKey.deleteOne({
            sessionId: req.params.sessionId,
            key: req.params.key
        });

        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Unable to delete auth state.' });
    }
});

app.get('/internal/session/:sessionId/settings', requireInternal, async (req, res) => {
    try {
        let doc = await SessionSettings.findOne({ sessionId: req.params.sessionId });

        if (!doc) {
            doc = await SessionSettings.create({
                sessionId: req.params.sessionId,
                data: {}
            });
        }

        res.json({ data: doc.data });
    } catch {
        res.status(500).json({ error: 'Unable to read settings.' });
    }
});

app.put('/internal/session/:sessionId/settings', requireInternal, async (req, res) => {
    try {
        const { sessionId } = req.params;

        await SessionSettings.updateOne(
            { sessionId },
            { $set: { sessionId, data: req.body?.data || {} } },
            { upsert: true }
        );

        res.json({ ok: true });
    } catch {
        res.status(500).json({ error: 'Unable to save settings.' });
    }
});

async function start() {
    await connectDB();

    app.listen(config.PORT, () => {
        console.log(`🚀 MrNobody PairBackend Server Running on Port ${config.PORT}`);
    });
}

start().catch(err => {
    console.error('❌ PairBackend startup failed:', err);
    process.exit(1);
});
