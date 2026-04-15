// ── Admin Backend — Express App ─────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import router from './routes/index.js';
import errorHandler from './middlewares/errorHandler.js';

const app = express();

const ALLOWED_ORIGINS = (process.env.CLIENT_URL || 'http://localhost:5174')
  .split(',')
  .map((u) => u.trim());

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(cookieParser()); // parse HTTP-only refresh-token cookie

// Mount all admin routes under /admin
app.use('/admin', router);

app.use(errorHandler);

export default app;
