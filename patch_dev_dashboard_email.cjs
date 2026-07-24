const fs = require('fs');
let content = fs.readFileSync('src/pages/DeveloperDashboard.tsx', 'utf8');

const emailLogsState = `
  const [emailLogs, setEmailLogs] = useState<any[]>([]);
  const fetchEmailLogs = async () => {
    try {
      const res = await fetch('/api/email/history');
      if (res.ok) {
        const data = await res.json();
        setEmailLogs(data);
      }
    } catch (e) {}
  };
  useEffect(() => {
    fetchEmailLogs();
    const interval = setInterval(fetchEmailLogs, 5000);
    return () => clearInterval(interval);
  }, []);
`;

// Insert after other state variables
content = content.replace('const [emailSystemOn, setEmailSystemOn] = useState', emailLogsState + '\n  const [emailSystemOn, setEmailSystemOn] = useState');

const emailLogsSection = `
        <Card className="rounded-[2rem] border-0 bg-white shadow-2xl shadow-blue-900/5 overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-indigo-50 to-white border-b border-indigo-100 p-8">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200">
                <Mail className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Email System Sandbox</h2>
                <p className="text-xs text-slate-600 font-semibold mt-1">Live streaming logs of simulated and production transactional emails.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            {emailLogs.length === 0 ? (
              <div className="text-center p-8 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-xs text-slate-600 font-semibold">No emails recorded in the sandbox yet.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {emailLogs.map((log: any, i: number) => (
                  <div key={i} className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm text-xs font-mono space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                      <span className="font-bold text-slate-900">{log.subject}</span>
                      <span className="text-slate-500">{new Date(log.timestamp || log.sentAt || Date.now()).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-slate-600 space-y-1">
                      <p><strong>To:</strong> {log.to?.join(', ')}</p>
                      <p><strong>Mode:</strong> {log.mode}</p>
                      <p><strong>Status:</strong> {log.status || 'delivered'}</p>
                    </div>
                    {log.templateData && log.templateData.code && (
                      <div className="mt-2 p-2 bg-indigo-50 rounded text-indigo-800 font-bold">
                        OTP CODE: {log.templateData.code}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
`;

content = content.replace('<div className="pt-8 space-y-6">', '<div className="pt-8 space-y-6">\n' + emailLogsSection);

fs.writeFileSync('src/pages/DeveloperDashboard.tsx', content);
