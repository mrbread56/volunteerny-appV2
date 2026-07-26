const fs = require('fs');

// 1. StudentDashboard.tsx
let sdPath = 'src/pages/StudentDashboard.tsx';
let sdContent = fs.readFileSync(sdPath, 'utf8');
if (!sdContent.includes('const [errorMessage, setErrorMessage] = useState')) {
  sdContent = sdContent.replace('const [isLoading, setIsLoading] = useState(true);', 'const [isLoading, setIsLoading] = useState(true);\n  const [errorMessage, setErrorMessage] = useState<string | null>(null);');
}
sdContent = sdContent.replace(
  '} catch (error) {\n        console.error("Error fetching dashboard data:", error);\n      } finally {',
  '} catch (error: any) {\n        console.error("Error fetching dashboard data:", error);\n        setErrorMessage(error.message || "Failed to load dashboard data");\n      } finally {'
);
fs.writeFileSync(sdPath, sdContent, 'utf8');

// 2. Messages.tsx
let mPath = 'src/pages/Messages.tsx';
let mContent = fs.readFileSync(mPath, 'utf8');
mContent = mContent.replace(
  '} catch (err) {\n        console.error("Failed to open direct chat:", err);\n      }',
  '} catch (err: any) {\n        console.error("Failed to open direct chat:", err);\n        setSendError("Failed to open chat. Please try again.");\n      }'
);
fs.writeFileSync(mPath, mContent, 'utf8');

// 3. FeedbackPage.tsx
let fPath = 'src/pages/FeedbackPage.tsx';
let fContent = fs.readFileSync(fPath, 'utf8');
fContent = fContent.replace(
  '} catch (fileErr) {\n          console.error("Failed to read feedback attachment", fileErr);\n        }',
  '} catch (fileErr: any) {\n          console.error("Failed to read feedback attachment", fileErr);\n          setError("Failed to read feedback attachment");\n          setIsSubmitting(false);\n          return;\n        }'
);
fs.writeFileSync(fPath, fContent, 'utf8');

// 4. OrgOpportunityApplicants.tsx
let ooaPath = 'src/pages/OrgOpportunityApplicants.tsx';
let ooaContent = fs.readFileSync(ooaPath, 'utf8');
if (!ooaContent.includes('const [errorMessage, setErrorMessage] = useState')) {
  ooaContent = ooaContent.replace('const [isLoading, setIsLoading] = useState(true);', 'const [isLoading, setIsLoading] = useState(true);\n  const [errorMessage, setErrorMessage] = useState<string | null>(null);');
}
ooaContent = ooaContent.replace(
  '} catch (err) {\n        console.error("Error fetching applicants:", err);\n      } finally {',
  '} catch (err: any) {\n        console.error("Error fetching applicants:", err);\n        setErrorMessage(err.message || "Failed to load applicants.");\n      } finally {'
);
ooaContent = ooaContent.replace(
  '} catch (e) {\n        console.error("Failed to compile or dispatch Resend notification:", e);\n      }',
  '} catch (e: any) {\n        console.error("Failed to compile or dispatch Resend notification:", e);\n        setErrorMessage(e.message || "Failed to send notification email.");\n      }'
);
ooaContent = ooaContent.replace(
  '} catch (err) {\n      console.error(\'Failed to submit recommendation:\', err);\n      setSuccessMessage(null);\n    } finally {',
  '} catch (err: any) {\n      console.error(\'Failed to submit recommendation:\', err);\n      setSuccessMessage(null);\n      setErrorMessage(err.message || "Failed to submit recommendation.");\n    } finally {'
);
ooaContent = ooaContent.replace(
  '} catch (err) {\n      console.error("Error fetching student profile:", err);\n    }',
  '} catch (err: any) {\n      console.error("Error fetching student profile:", err);\n      setErrorMessage(err.message || "Error fetching student profile.");\n    }'
);
fs.writeFileSync(ooaPath, ooaContent, 'utf8');

console.log("Silent catch blocks updated.");
