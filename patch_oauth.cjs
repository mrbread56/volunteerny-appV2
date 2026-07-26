const fs = require('fs');
let serverContent = fs.readFileSync('server.ts', 'utf8');

const oauthCode = `
  // --- GOOGLE OAUTH RELAY ---
  app.get('/api/auth/google/url', (req, res) => {
    const redirectUri = req.query.redirect_uri;
    if (!redirectUri) return res.status(400).json({ error: 'redirect_uri is required' });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID is not configured in the server environment.' });

    const state = Buffer.from(JSON.stringify({ redirectUri })).toString('base64');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state: state
    });

    const authUrl = \`https://accounts.google.com/o/oauth2/v2/auth?\${params.toString()}\`;
    res.json({ url: authUrl });
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.send(\`<script>window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: '\${error}' }, '*'); window.close();</script>\`);
    }

    if (!code || !state) {
      return res.send('Invalid request: Missing code or state');
    }

    try {
      const { redirectUri } = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('Google OAuth credentials not configured on server.');
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange token');
      }

      // We have the id_token! Pass it back to the opener window securely.
      res.send(\`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'GOOGLE_OAUTH_SUCCESS', 
                  idToken: '\${tokenData.id_token}'
                }, '*');
                window.close();
              } else {
                document.body.innerText = 'Authentication successful! Please close this window.';
              }
            </script>
            <p>Authentication successful. Redirecting...</p>
          </body>
        </html>
      \`);
    } catch (err) {
      console.error('OAuth Callback Error:', err);
      res.send(\`<script>window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: '\${err.message}' }, '*'); window.close();</script>\`);
    }
  });
  // --- END GOOGLE OAUTH RELAY ---
`;

serverContent = serverContent.replace('// Vite middleware for development', oauthCode + '\n  // Vite middleware for development');
fs.writeFileSync('server.ts', serverContent);
