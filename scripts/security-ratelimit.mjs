const BASE = 'http://localhost:3000';
const statuses = [];
for (let i = 0; i < 70; i++) {
  try {
    const res = await fetch(`${BASE}/api/auth/callback/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'csrfToken=bogus&nickname=test&callbackUrl=http%3A%2F%2Flocalhost%3A3000%2Fforest&json=true',
    });
    statuses.push(res.status);
  } catch (err) {
    statuses.push(`ERR:${err?.cause?.code ?? err?.message ?? 'unknown'}`);
  }
}
const counts = new Map();
for (const s of statuses) counts.set(s, (counts.get(s) ?? 0) + 1);
console.log('statuses:', JSON.stringify(Object.fromEntries(counts)));
const first429 = statuses.findIndex((s) => s === 429);
console.log('first429 at request #', first429 === -1 ? '없음' : first429 + 1);
process.exit(0);
