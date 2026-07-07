#!/usr/bin/env node
/*
  seedSampleApplication.js

  Creates a sample contract and optional contract application in the target DB.

  Usage:
    node seedSampleApplication.js [--userId <id>] [--withApplication]

  If no --userId is provided, the script picks the first user in `users`.
*/

import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

// load .env from repo root when possible
const tryPaths = [
  new URL("../../../.env", import.meta.url).pathname,
  new URL("../../.env", import.meta.url).pathname,
  new URL("../../../../.env", import.meta.url).pathname,
];
let loaded = false;
for (const p of tryPaths) {
  try {
    const res = dotenv.config({ path: p });
    if (!res.error) { loaded = true; break; }
  } catch (e) {}
}
if (!loaded) dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { userId: null, withApplication: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--userId") out.userId = args[++i];
    else if (a === "--withApplication") out.withApplication = true;
  }
  return out;
}

async function run() {
  const { userId, withApplication } = parseArgs();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI required in env');
  const client = new MongoClient(uri, { useUnifiedTopology: true });
  await client.connect();
  console.log('Connected to MongoDB');

  const dbName = process.env.MONGODB_DB || 'hustlers';
  const db = client.db(dbName);

  let user;
  if (userId) {
    user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) throw new Error(`User with id ${userId} not found in ${dbName}.users`);
  } else {
    user = await db.collection('users').findOne();
    if (!user) throw new Error(`No users found in ${dbName}.users — run migration first`);
  }

  console.log(`Using user: ${user._id} (${user.email || user.name || 'no-email'})`);

  const contractsColl = db.collection('contracts');
  const contractDoc = {
    title: 'Seeded Sample Contract',
    amount: 1000,
    currency: 'USD',
    description: 'This is a seeded contract for testing My Applications page.',
    jobCategory: 'testing',
    appliedBy: user._id,
    status: 'applied',
    createdAt: new Date(),
    appliedAt: new Date(),
    metadata: {},
  };

  const res = await contractsColl.insertOne(contractDoc);
  console.log('Inserted contract id:', res.insertedId.toString());

  if (withApplication) {
    const appsColl = db.collection('contractapplications');
    const appDoc = {
      contractId: res.insertedId,
      hustlerId: user._id,
      status: 'applied',
      coverLetter: 'Seeded application for testing',
      appliedAt: new Date(),
    };
    const r2 = await appsColl.insertOne(appDoc);
    console.log('Inserted application id:', r2.insertedId.toString());
  }

  await client.close();
  console.log('Done');
}

run().catch((e) => { console.error('Seed failed:', e); process.exit(1); });
