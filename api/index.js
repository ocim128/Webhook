const { createApp } = require('../dist/server');

let cachedApp;

module.exports = async function handler(req, res) {
  if (!cachedApp) {
    cachedApp = await createApp();
  }

  return cachedApp(req, res);
};
