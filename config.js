import 'dotenv/config';

export default {
    PORT: Number(process.env.PORT || 3000),
    MONGO_URI: process.env.MONGO_URI || '',
    INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN || '',
    BOT_RUNTIME_URL: String(process.env.BOT_RUNTIME_URL || '').replace(/\/+$/, ''),
    CORS_ORIGINS: process.env.CORS_ORIGINS || '*'
};
