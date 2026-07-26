import { db } from '../firebase/config';
import { sendTransactionalEmail } from './emailService';

export async function promoteWaitlistedApplicant(opportunityId: string, orgName: string) {
  try {
    let oldestApp: any = null;

    if (localStorage.getItem('demo_mode_role')) {
      const storedApps = localStorage.getItem('demo_applications');
      if (storedApps) {
        const appsList = JSON.parse(storedApps);
        const waitlistedMatched = appsList
          .filter((a: any) => a.opportunityId === opportunityId && a.status === 'waitlist')
          .sort((a: any, b: any) => new Date(a.appliedAt).getTime() - new Date(b.appliedAt).getTime());
        
        if (waitlistedMatched.length > 0) {
          oldestApp = waitlistedMatched[0];
          // Mutate the matching index in local list
          const targetIndex = appsList.findIndex((x: any) => x.id === oldestApp.id);
          if (targetIndex !== -1) {
            appsList[targetIndex].status = 'accepted';
            localStorage.setItem('demo_applications', JSON.stringify(appsList));
          }
        }
      }
    } else {
      const { query, collection, where, getDocs, orderBy, doc, updateDoc } = await import('firebase/firestore');
      const q = query(
        collection(db, 'applications'),
        where('opportunityId', '==', opportunityId),
        where('status', '==', 'waitlist'),
        orderBy('appliedAt', 'asc')
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const oldestDoc = snap.docs[0];
        oldestApp = { id: oldestDoc.id, ...oldestDoc.data() };
        await updateDoc(doc(db, 'applications', oldestApp.id), { status: 'accepted' });
      }
    }

    if (oldestApp) {
      
      // Get student email
      let studentEmail = oldestApp.studentEmail || oldestApp.email || null;
      if (!studentEmail && oldestApp.studentId && oldestApp.studentId !== 'demo-student-1') {
        const { getDoc, doc } = await import('firebase/firestore');
        const userDocSnap = await getDoc(doc(db, 'users', oldestApp.studentId));
        if (userDocSnap.exists()) {
          studentEmail = userDocSnap.data().email;
        }
      }
      
      // Default fallback student email for safety
      if (!studentEmail) {
        studentEmail = "student@example.com";
      }

      // Send email notification of automatic waitlist matching
      await sendTransactionalEmail({
        to: studentEmail,
        subject: `🎉 [Waitlist Matched!] You've been accepted for "${oldestApp.opportunityTitle || 'Volunteer Opportunity'}"`,
        templateName: 'application_status',
        templateData: {
          studentName: oldestApp.studentName || 'Student',
          oppTitle: oldestApp.opportunityTitle || 'Volunteer Opportunity',
          orgName: orgName || 'Verified Organization',
          status: 'accepted',
          note: `A spot has opened up! The waitlist engine has automatically matched you and approved your application. Welcome aboard.`
        }
      });
      return oldestApp;
    }
  } catch (err) {
    console.error('[Waitlist Promotion Error]:', err);
  }
  return null;
}
