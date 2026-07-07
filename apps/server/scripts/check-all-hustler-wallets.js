const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  const hustlerId = new ObjectId('6a21e6cd7da475ccf43368a0');
  
  // Get all wallets for hustler
  const wallets = await db.collection('wallets').find({owner: hustlerId}).toArray();
  
  console.log('Hustler Wallets:');
  wallets.forEach(w => {
    console.log(`  ${w.type} ${w.currency}:`);
    console.log(`    id: ${w._id}`);
    console.log(`    balance: ${w.balance}`);
    console.log(`    availableBalance: ${w.availableBalance}`);
    console.log(`    lockedBalance: ${w.lockedBalance}`);
  });
  
  // Get all transactions for any hustler wallet
  console.log('');
  console.log('All Transactions for Hustler:');
  const walletIds = wallets.map(w => w._id);
  const transactions = await db.collection('transactions')
    .find({wallet: {$in: walletIds}})
    .toArray();
  
  transactions.forEach(t => {
    console.log(`  ${t.type.toUpperCase()}: ${t.amount} ${wallets.find(w => w._id.toString() === t.wallet.toString())?.currency} | Contract: ${t.contract?.toString() || 'N/A'}`);
  });
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
