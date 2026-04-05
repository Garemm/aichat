// ── Admin Backend — Entry Point ────────────────────────────────────────────
// Starts the Express server. All route/middleware wiring lives in src/app.js.
require('dotenv').config();
const app        = require('./src/app');
const AdminModel = require('./src/models/adminModel');

const PORT = process.env.PORT || 4000;

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
