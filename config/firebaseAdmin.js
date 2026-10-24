
const {
  initializeApp,
  getApps,
  cert,
} = require("firebase-admin/app");

const { getAuth } = require("firebase-admin/auth");
const serviceAccount = require("../serviceAccountKey.json");

const app =
  getApps().length === 0
    ? initializeApp({
        credential: cert(serviceAccount),
      })
    : getApps()[0];

const adminAuth = getAuth(app);

module.exports = {
  auth: adminAuth,
};
