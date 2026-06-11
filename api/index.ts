// NOTE: the project is an ES module ("type": "module"), so the runtime import
// on Vercel must include the .js extension. Without it the compiled
// api/index.js fails with ERR_MODULE_NOT_FOUND for '/var/task/server'.
import app from '../server.js';

export default app;
