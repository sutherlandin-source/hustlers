const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  // Update the second milestone to submitted status
  const result = await db.collection('milestones').updateOne(
    {contract: new ObjectId('6a25e74466a24665f385e14c'), title: 'Plumbing & Electrical'},
    {
      $set: {
        status: 'submitted',
        submittedAt: new Date()
      }
    }
  );
  
  console.log('✓ Milestone submitted:', result.modifiedCount, 'updated');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
