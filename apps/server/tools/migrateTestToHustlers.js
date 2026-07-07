#!/usr/bin/env node
/*
  migrateTestToHustlers.js

  Copy collections and indexes from source DB to target DB on the same cluster.

  Usage:
    node migrateTestToHustlers.js --source=test --target=hustlers [--force]

  Notes:
  - Requires `mongodb` and `dotenv` packages. Install with:
      npm install mongodb dotenv
  - Script preserves `_id` values and copies indexes (excluding the default _id index).
  - By default will skip collections that already exist with documents in the target DB.
    Use `--force` to insert anyway (may cause duplicate key errors if documents already exist).
*/

import dotenv from "dotenv";
import { MongoClient } from "mongodb";

// Try multiple likely .env locations (repo root when running from different cwd)
const tryPaths = [
  new URL("../../../.env", import.meta.url).pathname, // apps/server/tools -> ../../.. -> repo root
  new URL("../../.env", import.meta.url).pathname, // apps/server/tools -> ../.. -> apps/server/.env
  new URL("../../../../.env", import.meta.url).pathname, // previous fallback
];

let loaded = false;
for (const p of tryPaths) {
  try {
    const res = dotenv.config({ path: p });
    if (!res.error) {
      console.log(`Loaded env from ${p}`);
      loaded = true;
      break;
    }
  } catch (e) {
    // ignore and try next
  }
}
if (!loaded) {
  // final fallback: default dotenv resolution (cwd)
  dotenv.config();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { source: "test", target: "hustlers", force: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--source") out.source = args[++i];
    else if (a === "--target") out.target = args[++i];
    else if (a === "--force") out.force = true;
  }
  return out;
}

async function migrate({ uri, sourceDbName, targetDbName, force = false }) {
  if (!uri) throw new Error("MONGODB_URI is required in env or as parameter");
  const client = new MongoClient(uri, { useUnifiedTopology: true });
  await client.connect();
  console.log(`Connected to MongoDB cluster`);

  const srcDb = client.db(sourceDbName);
  const tgtDb = client.db(targetDbName);

  const collections = await srcDb.listCollections().toArray();
  if (!collections || collections.length === 0) {
    console.log(`No collections found in source DB '${sourceDbName}'.`);
    await client.close();
    return;
  }

  for (const collInfo of collections) {
    const name = collInfo.name;
    console.log(`\n--- Processing collection: ${name}`);

    const srcColl = srcDb.collection(name);
    const tgtColl = tgtDb.collection(name);

    const srcCount = await srcColl.countDocuments();
    const tgtCount = await tgtColl.countDocuments().catch(() => 0);

    console.log(`source count: ${srcCount}, target count: ${tgtCount}`);
    if (tgtCount > 0 && !force) {
      console.log(`Skipping ${name} (target non-empty). Use --force to override.`);
      continue;
    }

    if (srcCount === 0) {
      console.log(`Skipping ${name} (no documents in source)`);
    } else {
      // copy documents in batches
      const batchSize = 1000;
      let written = 0;
      const cursor = srcColl.find();
      let buffer = [];
      try {
        for await (const doc of cursor) {
          buffer.push(doc);
          if (buffer.length >= batchSize) {
            await tgtColl.insertMany(buffer, { ordered: false }).catch((e) => {
              console.error(`Warning inserting batch into ${name}:`, e.message);
            });
            written += buffer.length;
            buffer = [];
          }
        }
        if (buffer.length) {
          await tgtColl.insertMany(buffer, { ordered: false }).catch((e) => {
            console.error(`Warning inserting final batch into ${name}:`, e.message);
          });
          written += buffer.length;
        }
      } catch (err) {
        console.error(`Error while copying documents for ${name}:`, err.message);
      }
      console.log(`Inserted ~${written} documents into ${targetDbName}.${name}`);
    }

    // copy indexes (exclude default _id_)
    try {
      const indexes = await srcColl.indexes();
      for (const idx of indexes) {
        if (idx.name === "_id_") continue;
        const key = idx.key;
        const opts = { ...idx };
        delete opts.key;
        delete opts.ns;
        delete opts.v;
        delete opts.name;
        try {
          await tgtColl.createIndex(key, { name: idx.name, ...opts });
          console.log(`Created index ${idx.name} on ${name}`);
        } catch (e) {
          console.error(`Failed to create index ${idx.name} on ${name}:`, e.message);
        }
      }
    } catch (err) {
      console.error(`Failed to copy indexes for ${name}:`, err.message);
    }
  }

  await client.close();
  console.log(`\nMigration completed from '${sourceDbName}' -> '${targetDbName}'`);
}

async function main() {
  const { source, target, force } = parseArgs();
  const uri = process.env.MONGODB_URI;
  console.log(`Migrate from '${source}' to '${target}' (force=${force})`);
  try {
    await migrate({ uri, sourceDbName: source, targetDbName: target, force });
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

main();
