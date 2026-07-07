const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  const hustlerId = new ObjectId('6a21e6cd7da475ccf43368a0');
  
  // Get hustler's KSH USER wallet
  const hustlerWallet = await db.collection('wallets').findOne({
    owner: hustlerId,
    type: 'USER',
    currency: 'KSH'
  });
  
  if (hustlerWallet) {
    console.log('Hustler KSH Wallet:');
    console.log('  balance:', hustlerWallet.balance);
    console.log('  availableBalance:', hustlerWallet.availableBalance);
    console.log('  lockedBalance:', hustlerWallet.lockedBalance);
    console.log('');
    
    // Get credit transactions for this wallet
    const credits = await db.collection('transactions')
      .find({wallet: hustlerWallet._id, type: 'credit'})
      .toArray();
    
    console.log('Credit Transactions:');
    let totalCredits = 0;
    credits.forEach(t => {
      console.log('  - Amount:', t.amount, '| Contract:', t.contract?.toString() || 'N/A');
      totalCredits += t.amount;
    });
    console.log('Total credits:', totalCredits, 'KSH');
  } else {
    console.log('No KSH wallet found for hustler');
  }
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
