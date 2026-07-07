import mongoose from 'mongoose';

async function run() {
  try {
    await mongoose.connect('mongodb://localhost:27017/hustlers');
    const coll = mongoose.connection.collection('users');
    const idxs = await coll.indexes();
    console.log('indexes:', JSON.stringify(idxs, null, 2));
    const hasPhone = idxs.find(i => i.key && (i.key.phone || i.key.phoneNumber));
    if (hasPhone) {
      const idxName = hasPhone.name || 'phone_1';
      console.log('Dropping index:', idxName);
      await coll.dropIndex(idxName);
      console.log('Dropped index', idxName);
    } else {
      console.log('phone index not found');
    }
  } catch (err) {
    console.error('ERROR', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
