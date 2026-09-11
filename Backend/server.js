const http = require('http');
const app = require('./src/app');
const runMigration = require('./src/config/migrate');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // Run idempotent schema alignment in background
  runMigration().catch(err => console.error('[Startup Migration Error]:', err.message));
});
