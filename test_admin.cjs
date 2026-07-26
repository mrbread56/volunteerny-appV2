const admin = require('firebase-admin');
const config = require('./firebase-applet-config.json');
admin.initializeApp({ projectId: config.projectId });
admin.auth().createCustomToken('test-uid').then(token => console.log('TOKEN:', token)).catch(err => console.error('ERROR:', err.message));
