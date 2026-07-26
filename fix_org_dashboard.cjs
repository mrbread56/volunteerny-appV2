const fs = require('fs');
const path = 'src/pages/OrgDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace('import { handleFirestoreError, OperationType } from "../firebase/utils";\n', '');

content = content.replace(
  'id: "log-req-" + Date.now(),\n            activity: req.activity + ` (${orgProfile?.organizationName || "Verified Partner"})`,', 
  'id: `log-req-${req.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,\n            activity: req.activity + ` (${orgProfile?.organizationName || "Verified Partner"})`,'
);

content = content.replace(
  'id: "log-req-" + Date.now(),\n            activity: req.activity + ` (${orgProfile?.organizationName || req.organization})`,', 
  'id: `log-req-${req.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,\n            activity: req.activity + ` (${orgProfile?.organizationName || req.organization})`,'
);

const targetCatch = `    } catch (err: any) {
      console.error("Error updating status:", err);
      setErrorMessage(err.message || "Operation failed");
      if (!isDemoMode) {
        const formattedErr = handleFirestoreError(err, OperationType.UPDATE, "applications");
        return { success: false, emailSent: false, receiptGenerated: false, error: formattedErr.error };
      }
      return { success: false, emailSent: false, receiptGenerated: false, error: err.message || "Operation failed" };
    }`;

const newCatch = `    } catch (err: any) {
      console.error("Error updating status:", err);
      setErrorMessage(err.message || "Operation failed");
      return { success: false, emailSent: false, receiptGenerated: false, error: err.message || "Operation failed" };
    }`;
content = content.replace(targetCatch, newCatch);

content = content.replace(
  'id: "log-org-" + Date.now(),', 
  'id: `log-org-${user?.uid || "org"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,'
);

const oldLog = `          setLogDate("");
          setLogHours("");
          setLogActivity("");
          setSelectedStudentId("");
          setSuccessMessage("Successfully logged and authorized hours!");

          // Send confirmation email
          const studentName = studentSnap.data().name || "Student";
          const emailData = {
            to: studentSnap.data().email,
            subject: "Volunteer Hours Logged & Verified",
            template: "hours_logged",
            data: {
              studentName: studentName,
              hours: parsedHours,
              activity: logActivity,
              orgName: orgProfile?.organizationName || "Verified Organization"
            }
          }`;

const newLog = `          const currentActivity = logActivity;
          setLogDate("");
          setLogHours("");
          setLogActivity("");
          setSelectedStudentId("");
          setSuccessMessage("Successfully logged and authorized hours!");

          // Send confirmation email
          const studentName = studentSnap.data().name || "Student";
          const emailData = {
            to: studentSnap.data().email,
            subject: "Volunteer Hours Logged & Verified",
            template: "hours_logged",
            data: {
              studentName: studentName,
              hours: parsedHours,
              activity: currentActivity,
              orgName: orgProfile?.organizationName || "Verified Organization"
            }
          }`;
content = content.replace(oldLog, newLog);

fs.writeFileSync(path, content, 'utf8');
console.log("OrgDashboard updated successfully.");
