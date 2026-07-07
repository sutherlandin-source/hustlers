const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  // Reset the contract
  const contractId = new ObjectId('6a25e69c66a24665f385e136');
  await db.collection('contracts').updateOne(
    {_id: contractId},
    {
      $set: {
        escrowPrepared: false,
        escrowAmount: 0,
        escrowWallet: null
      }
    }
  );
  
  // Restore KES ESCROW wallet to 32000
  await db.collection('wallets').updateOne(
    {_id: new ObjectId('6a25f5dc779cdc2bce2a1628')},
    {
      $set: {
        balance: 32000,
        availableBalance: 32000,
        lockedBalance: 0
      }
    }
  );
  
  // Delete the old escrow transactions for this contract
  const delResult = await db.collection('transactions').deleteMany({contract: contractId});
  console.log('✓ Reset complete:', delResult.deletedCount, 'transactions deleted');
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
