import * as admin from 'firebase-admin';
import { Firestore } from '@google-cloud/firestore';
import dotenv from 'dotenv';
dotenv.config();
const a: any = (admin as any).default || admin;
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
if (typeof sa.private_key === 'string') sa.private_key = sa.private_key.replace(/\n/g, '\n');
(async () => {
  const { access_token } = await a.credential.cert(sa).getAccessToken();
  const r = await fetch('https://firestore.googleapis.com/v1/projects/volunteer-ny/databases', { headers: { Authorization: `Bearer ${access_token}` } });
  const dbs = ((await r.json()) as any).databases || [];
  const ids = dbs.map((d: any) => String(d.name).split('/databases/')[1]);
  console.log('databases now:', ids.length ? ids.join('  |  ') : '(none)');
  console.log('has (default)?', ids.includes('(default)') ? 'YES' : 'NO');
  console.log();
  for (const id of ids) {
    const c = new Firestore({ projectId: 'volunteer-ny', databaseId: id, credentials: { client_email: sa.client_email, private_key: sa.private_key } } as any);
    const counts: string[] = [];
    for (const col of ['users', 'opportunities', 'applications']) {
      try { const s = await c.collection(col).limit(3).get(); counts.push(`${col}=${s.size}`); }
      catch (e: any) { counts.push(`${col}=ERR(${e.code})`); }
    }
    console.log(`  ${id}\n     ${counts.join('  ')}`);
  }
})();
