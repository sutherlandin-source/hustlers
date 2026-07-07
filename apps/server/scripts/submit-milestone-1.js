const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  const contractId = new ObjectId('6a25e74466a24665f385e14c');
  
  // Submit the first milestone
  await db.collection('milestones').updateOne(
    {contract: contractId, title: 'Foundation & Walls'},
    {$set: {status: 'submitted', submittedAt: new Date()}}
  );
  
  console.log('✓ First milestone submitted: Foundation & Walls (8000 KSH)');
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
