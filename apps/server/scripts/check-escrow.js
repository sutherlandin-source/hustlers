const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  const contractId = '6a25e74466a24665f385e14c';
  
  // Get contract
  const contract = await db.collection('contracts').findOne({_id: new ObjectId(contractId)});
  console.log('Contract:', {
    escrowPrepared: contract.escrowPrepared,
    escrowAmount: contract.escrowAmount,
    escrowWallet: contract.escrowWallet?.toString(),
    escrowReleasedAmount: contract.escrowReleasedAmount
  });
  console.log('');
  
  // Get escrow wallet
  if (contract.escrowWallet) {
    const escrowWallet = await db.collection('wallets').findOne({_id: contract.escrowWallet});
    console.log('Escrow Wallet:');
    console.log('  balance:', escrowWallet.balance);
    console.log('  availableBalance:', escrowWallet.availableBalance);
    console.log('  lockedBalance:', escrowWallet.lockedBalance);
    console.log('');
  }
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
