const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  const contractId = '6a25e69c66a24665f385e136';
  const managerId = '6a21eb76a5caca7f919e531c';
  
  // Get contract info
  const contract = await db.collection('contracts').findOne({_id: new ObjectId(contractId)});
  console.log('Contract:');
  console.log('  escrowPrepared:', contract.escrowPrepared);
  console.log('  escrowAmount:', contract.escrowAmount);
  console.log('  escrowWallet:', contract.escrowWallet?.toString());
  console.log('');
  
  // Get escrow wallet
  if (contract.escrowWallet) {
    const escrowWallet = await db.collection('wallets').findOne({_id: contract.escrowWallet});
    console.log('Escrow Wallet:');
    console.log('  balance:', escrowWallet.balance);
    console.log('  availableBalance:', escrowWallet.availableBalance);
    console.log('  lockedBalance:', escrowWallet.lockedBalance);
    console.log('  type:', escrowWallet.type);
    console.log('  currency:', escrowWallet.currency);
    console.log('');
  }
  
  // Get all manager wallets
  const managerWallets = await db.collection('wallets').find({owner: new ObjectId(managerId)}).toArray();
  console.log('Manager Wallets:');
  managerWallets.forEach(w => {
    console.log('  -', w.type, w.currency);
    console.log('    balance:', w.balance);
    console.log('    availableBalance:', w.availableBalance);
    console.log('    lockedBalance:', w.lockedBalance);
  });
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
