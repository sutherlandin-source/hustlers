const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  const contractId = '6a25e74466a24665f385e14c';
  
  // Get contract
  const contract = await db.collection('contracts').findOne({_id: new ObjectId(contractId)});
  console.log('Contract:', {
    title: contract.title,
    amount: contract.amount,
    currency: contract.currency,
    escrowPrepared: contract.escrowPrepared,
    escrowAmount: contract.escrowAmount
  });
  console.log('');
  
  // Get all milestones for this contract
  const milestones = await db.collection('milestones').find({contract: new ObjectId(contractId)}).toArray();
  console.log('Milestones:');
  milestones.forEach(m => {
    console.log('  -', m.title);
    console.log('    Status:', m.status);
    console.log('    PaymentStatus:', m.paymentStatus);
    console.log('    Amount:', m.amount);
    console.log('');
  });
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
