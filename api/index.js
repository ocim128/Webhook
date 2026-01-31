const { createApp } = require('../dist/server');

let cachedApp;

module.exports = async function handler(req, res) {
  try {
    if (!cachedApp) {
      console.log('Initializing application...');
      cachedApp = await createApp();
      console.log('Application initialized successfully.');
    }

    return cachedApp(req, res);
  } catch (err) {
    console.error('CRITICAL: Failed to initialize application handler:', err);
    res.status(500).json({
      error: 'Initialization Error',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
};
