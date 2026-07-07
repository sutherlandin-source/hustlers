const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

mongoose.connect('mongodb://localhost:27017/hustlers').then(async () => {
  const db = mongoose.connection;
  
  // Reset the House Renovation contract
  const contractId = new ObjectId('6a25e74466a24665f385e14c');
  await db.collection('contracts').updateOne(
    {_id: contractId},
    {
      $set: {
        escrowPrepared: false,
        escrowAmount: 0,
        escrowWallet: null,
        escrowReleasedAmount: 0
      }
    }
  );
  
  // Reset all milestones for this contract to pending status
  await db.collection('milestones').updateMany(
    {contract: contractId},
    {
      $set: {
        status: 'pending',
        paymentStatus: 'pending'
      },
      $unset: {
        submittedAt: true,
        approvedAt: true,
        approvedBy: true
      }
    }
  );
  
  // Update the escrow wallet back to its original state
  const walletId = new ObjectId('6a25f5dc779cdc2bce2a1628');
  
  // Current state from the Professional Office Cleaning: balance=35500, available=28500, locked=3500
  // We need to remove the House Renovation impact manually
  // Original state before both: balance=32000, available=32000, locked=0
  // After only Professional Office Cleaning: balance=35500, available=28500, locked=3500 (current state is correct)
  // So we don't need to modify the wallet
  
  console.log('✓ House Renovation contract reset');
  console.log('  - Escrow status cleared');
  console.log('  - All milestones reset to pending');
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
