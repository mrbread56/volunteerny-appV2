const { beforeAll, afterAll, beforeEach, describe, it } = require('vitest');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'volunteer-ny',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('Volunteer NY - Firestore Rules Adversarial Tests', () => {
  
  describe('Global Feed & Opportunities', () => {
    it('should allow unauthenticated users to read opportunities (public feed)', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      await assertSucceeds(unauthedDb.collection('opportunities').get());
    });

    it('should block unauthenticated users from creating opportunities', async () => {
      const unauthedDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(unauthedDb.collection('opportunities').add({ title: 'Hack' }));
    });
  });

  describe('Privilege Escalation & Students', () => {
    it('should block a student from writing to another student\'s profile', async () => {
      const aliceDb = testEnv.authenticatedContext('alice').firestore();
      await assertFails(aliceDb.collection('students').doc('bob').set({ fullName: 'Hacked' }));
    });

    it('should block a student from manually updating their loggedHours array', async () => {
      const aliceContext = testEnv.authenticatedContext('alice');
      
      // Setup the initial doc
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('students').doc('alice').set({
          uid: 'alice',
          fullName: 'Alice',
          loggedHours: []
        });
      });

      const aliceDb = aliceContext.firestore();
      
      // Alice tries to add fake hours
      await assertFails(aliceDb.collection('students').doc('alice').update({
        loggedHours: [{ hours: 1000 }]
      }));
    });
  });

  describe('Feedback & Privacy', () => {
    it('should block users from reading other users feedbacks', async () => {
      const aliceDb = testEnv.authenticatedContext('alice').firestore();
      
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('feedbacks').doc('fb1').set({
          userId: 'bob',
          type: 'bug'
        });
      });

      await assertFails(aliceDb.collection('feedbacks').doc('fb1').get());
    });
  });
});
