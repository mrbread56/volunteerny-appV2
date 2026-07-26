const fs = require('fs');
let content = fs.readFileSync('src/pages/Login.tsx', 'utf8');

const returnStatementRegex = /return \([\s\S]*\);\s*\}/m;
const renderFunction = `
  return (
    <div className="min-h-[100vh] flex flex-col items-center justify-center p-4 bg-slate-50 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-orange-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>

      <AnimatePresence mode="wait">
        {step === "login" ? (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="w-full max-w-md"
          >
            <Card className="w-full border-blue-100 shadow-2xl overflow-hidden rounded-[2.5rem]">
              <CardHeader className="text-center pb-2 pt-10">
                <div className="mx-auto w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200">
                  <ShieldCheck className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-3xl font-extrabold tracking-tight text-slate-900">Volunteer NY</CardTitle>
                <p className="text-slate-600 font-medium mt-3">Welcome back. Let's get to work.</p>
              </CardHeader>
              <CardContent className="space-y-6 pt-6 pb-10">
                {error && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs border border-red-100 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="font-semibold leading-relaxed">{error}</p>
                  </div>
                )}
                
                <form onSubmit={handleLogin} className="space-y-4">
                  <Input
                    id="login-email"
                    name="email"
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="student@example.com"
                    autoComplete="username"
                  />
                  <Button type="submit" variant="primary" className="w-full h-12 text-sm" isLoading={isLoading}>
                    Send Verification Code
                  </Button>
                </form>

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-slate-200"></div>
                  <span className="flex-shrink-0 mx-4 text-xs font-bold uppercase tracking-wider text-slate-400">or sign in with</span>
                  <div className="flex-grow border-t border-slate-200"></div>
                </div>

                <Button type="button" variant="outline" onClick={handleGoogleLogin} isLoading={isGoogleLoading} className="w-full h-12 text-sm font-bold bg-white text-slate-700">
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-3" />
                  Google Identity
                </Button>

                <p className="text-center text-sm font-medium text-slate-600 pt-4">
                  Don't have an account?{" "}
                  <Link to="/signup" className="text-blue-600 hover:text-blue-700 hover:underline font-bold">
                    Create account
                  </Link>
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="mfa"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="w-full max-w-md"
          >
            <Card className="w-full border-blue-100 shadow-2xl overflow-hidden rounded-[2.5rem]">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4 border border-blue-100">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight">Security Check</CardTitle>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mt-4 text-center">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-1.5">Verification Code Dispatched to</p>
                  <p className="text-sm font-black text-slate-800 font-mono tracking-wider">{email}</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-4">
                {error && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs border border-red-100 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="font-semibold leading-relaxed">{error}</p>
                  </div>
                )}
                <form onSubmit={handleVerifyMfa} className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-widest text-center block">
                      Enter 6-Digit PIN
                    </label>
                    <div className="flex justify-center gap-2.5">
                      {otpDigits.map((digit, index) => (
                        <input
                          key={index}
                          ref={(el) => { inputRefs.current[index] = el; }}
                          type="text"
                          maxLength={1}
                          inputMode="numeric"
                          value={digit}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleOtpChange(index, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(index, e)}
                          className="w-11 h-12 text-center text-xl font-black border border-slate-200 rounded-xl focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none shadow-sm bg-white"
                        />
                      ))}
                    </div>
                  </div>
                  <Button type="submit" variant="primary" className="w-full h-11 bg-blue-600 text-white font-bold" isLoading={isLoading}>
                    Confirm and Authorize
                  </Button>
                  <div className="flex flex-col gap-3 pt-2">
                    <button type="button" onClick={handleResendCode} disabled={cooldown > 0} className="text-xs text-blue-600 font-bold hover:underline flex items-center justify-center gap-1.5 disabled:text-slate-600 disabled:no-underline">
                      <RefreshCw className={\`w-3 h-3 \${cooldown > 0 ? "opacity-50" : "animate-spin"}\`} />
                      {cooldown > 0 ? \`Resend security PIN (\${cooldown}s)\` : "Resend Security PIN"}
                    </button>
                    <button type="button" onClick={handleCancelMfa} className="text-xs text-slate-600 font-bold hover:text-slate-800 hover:underline text-center">
                      Cancel and back to Login
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}`;

content = content.replace(returnStatementRegex, renderFunction);
fs.writeFileSync('src/pages/Login.tsx', content);
