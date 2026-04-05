// ── Admin Backend — Express App ─────────────────────────────────────────────
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const router       = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

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

module.exports = app;
