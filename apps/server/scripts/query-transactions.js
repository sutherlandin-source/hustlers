const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  const contractId = '6a25e69c66a24665f385e136';
  
  // Get all transactions for this contract
  const transactions = await db.collection('transactions').find({contract: new ObjectId(contractId)}).toArray();
  console.log('Transactions for contract:');
  transactions.forEach(t => {
    console.log('  - Type:', t.type);
    console.log('    Amount:', t.amount);
    console.log('    Currency:', t.currency);
    console.log('    Description:', t.description);
    console.log('    WalletId:', t.wallet?.toString());
    console.log('');
  });
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
