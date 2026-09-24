import mongoose from 'mongoose';
import config from '../config.js';

async function connectDB() {
    if (!config.MONGO_URI) {
        console.log('⚠️ MONGO_URI Environment Variable එක සොයාගත නොහැකි විය!');
        process.exit(1);
    }
    try {
        await mongoose.connect(config.MONGO_URI);
        console.log('✅ MongoDB සාර්ථකව සම්බන්ධ විය!');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        process.exit(1);
    }
}

// Baileys Auth Keys (Session Id එක අනුව වෙන් කර ගබඩා කරයි)
const AuthKeySchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed }
});
AuthKeySchema.index({ sessionId: 1, key: 1 }, { unique: true });

// Bot Feature Settings (Session Id එක අනුව වෙන් කර ගබඩා කරයි)
const SettingsSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    data: { type: Object, default: {} }
});

// Pairing Process එකේ Status Track කිරීමට (විනාඩි 10කින් Auto-Expire වේ)
const PairStatusSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    status: { type: String, default: 'pending' }, // pending | code | connecting | online | failed | logged_out
    code: String,
    error: String,
    runtime: { status: String, lastHeartbeatAt: Date, lastError: String },
    createdAt: { type: Date, default: Date.now, expires: 600 }
});

const AuthKey = mongoose.model('AuthKey', AuthKeySchema);
const SessionSettings = mongoose.model('SessionSettings', SettingsSchema);
const PairStatus = mongoose.model('PairStatus', PairStatusSchema);

export { connectDB, AuthKey, SessionSettings, PairStatus }
