// ── Admin Backend — Entry Point ────────────────────────────────────────────
// Starts the Express server. All route/middleware wiring lives in src/app.js.
require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🛠  Admin API ready on http://localhost:${PORT}  [${process.env.NODE_ENV || 'development'}]`);
});
