#!/usr/bin/env node
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';

// Load .env from repo root when possible
const tryPaths = [
  new URL('../../../.env', import.meta.url).pathname,
  new URL('../../.env', import.meta.url).pathname,
  new URL('../../../../.env', import.meta.url).pathname,
];
let loaded = false;
for (const p of tryPaths) {
  try {
    const res = dotenv.config({ path: p });
    if (!res.error) { loaded = true; break; }
  } catch (e) {}
}
if (!loaded) dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI required in env');
  const client = new MongoClient(uri, { useUnifiedTopology: true });
  await client.connect();
  const dbName = process.env.MONGODB_DB || 'hustlers';
  const db = client.db(dbName);

  const userId = new ObjectId('6a29c3b949169cf100f92bec');
  const email = 'janedoe@gmail.com';
  const password = 'password123';

  const hashed = await bcrypt.hash(password, 10);

  const userDoc = {
    _id: userId,
    email,
    password: hashed,
    firstName: 'jane',
    lastName: 'doe',
    phone: 'seed-janedoe-1',
    phoneNumber: 'seed-janedoe-1',
    role: 'hustler',
    isActive: true,
    createdAt: new Date(),
  };

  // Upsert the user so script can be re-run
  const res = await db.collection('users').replaceOne({ _id: userId }, userDoc, { upsert: true });
  console.log('Upserted user janedoe:', res.upsertedId ? res.upsertedId._id || res.upsertedId : 'updated');

  await client.close();
}

run().catch((e) => { console.error('Failed creating user:', e); process.exit(1); });
