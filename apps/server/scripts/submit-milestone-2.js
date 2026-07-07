const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  const contractId = new ObjectId('6a25e74466a24665f385e14c');
  
  // Submit the second milestone
  await db.collection('milestones').updateOne(
    {contract: contractId, title: 'Plumbing & Electrical'},
    {$set: {status: 'submitted', submittedAt: new Date()}}
  );
  
  console.log('✓ Second milestone submitted: Plumbing & Electrical (12000 KSH)');
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
