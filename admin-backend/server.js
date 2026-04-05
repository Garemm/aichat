// ── Admin Backend — Entry Point ────────────────────────────────────────────
// Starts the Express server. All route/middleware wiring lives in src/app.js.
require('dotenv').config();
const app        = require('./src/app');
const AdminModel = require('./src/models/adminModel');
const cron       = require('node-cron');
const db         = require('./src/config/database');

const PORT = process.env.PORT || 4000;

// ── Weekly analytics reset (every Sunday at midnight) ─────────────────────────
// Deletes all product_query_logs so the dashboard shows fresh weekly data.
cron.schedule('0 0 * * 0', async () => {
  try {
    await db.query('DELETE FROM product_query_logs');
    console.log('[Cron] product_query_logs table reset (weekly)');
  } catch (err) {
    console.error('[Cron] Error resetting product_query_logs:', err.message);
  }
}, { timezone: 'America/Mexico_City' });

// Run idempotent DB migrations before accepting connections
AdminModel.ensureMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🛠  Admin API ready on http://localhost:${PORT}  [${process.env.NODE_ENV || 'development'}]`);
    });
  })
  .catch((err) => {
    console.error('❌  Migration failed:', err.message);
    process.exit(1);
  });
