import fetch from 'node-fetch';

const base = 'http://localhost:5000/api/v1';
const email = `testflow+${Date.now()}@example.com`;
const password = 'TestPass123!';

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

(async () => {
  console.log('Registering', email);
  const r = await post('/auth/register', { email, password, firstName: 'T', lastName: 'User' });
  console.log('REGISTER', r.status, r.data);

  console.log('Logging in');
  const l = await post('/auth/login', { email, password });
  console.log('LOGIN', l.status, l.data);

  if (l.data && l.data.data && l.data.data.refreshToken) {
    const refreshBody = { refreshToken: l.data.data.refreshToken };
    console.log('Refreshing tokens');
    const rf = await post('/auth/refresh-token', refreshBody);
    console.log('REFRESH', rf.status, rf.data);

    if (rf.data && rf.data.data && rf.data.data.accessToken) {
      const profile = await fetch(`${base}/auth/me`, {
        headers: { Authorization: `Bearer ${rf.data.data.accessToken}` },
      });
      const profileData = await profile.json();
      console.log('PROFILE', profile.status, profileData);
    }
  }
})();
