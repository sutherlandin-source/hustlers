const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  const walletId = new ObjectId('6a25f5dc779cdc2bce2a1628');
  
  // Get all transactions for this wallet
  const transactions = await db.collection('transactions').find({wallet: walletId}).toArray();
  
  console.log('Transactions for escrow wallet:');
  transactions.forEach(t => {
    console.log('  - Type:', t.type, '| Amount:', t.amount, '| Contract:', t.contract?.toString() || 'N/A');
  });
  console.log('');
  
  // Get all contracts using this wallet
  const contracts = await db.collection('contracts').find({escrowWallet: walletId}).toArray();
  
  console.log('Contracts using this wallet:');
  contracts.forEach(c => {
    console.log('  - Title:', c.title);
    console.log('    Amount:', c.amount, 'KSH');
    console.log('    Escrow Amount:', c.escrowAmount);
    console.log('    Escrow Prepared:', c.escrowPrepared);
    console.log('');
  });
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
