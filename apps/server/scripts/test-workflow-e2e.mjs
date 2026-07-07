#!/usr/bin/env node

const API_BASE = 'http://localhost:5000/api/v1';
let managerToken, hustlerToken, managerId, hustlerId, contractId, milestoneId;

async function post(path, body, token) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  return res.json().catch(() => null);
}

async function get(path, token) {
  const res = await fetch(API_BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  return res.json().catch(() => null);
}

(async () => {
  try {
    console.log('1. Getting existing users...');
    // Skip registration, use existing users
    
    console.log('\n2. Logging in as manager...');
    let result = await post('/auth/login', { 
      email: 'manager@hustlers.com', 
      password: 'password123' 
    });
    if (result?.data?.accessToken) {
      managerToken = result.data.accessToken;
      managerId = result.data.user._id;
      console.log('✓ Manager logged in:', managerId);
    } else {
      throw new Error('Manager login failed');
    }

    console.log('\n3. Logging in as hustler...');
    result = await post('/auth/login', { 
      email: 'john@hustlers.com', 
      password: 'password123' 
    });
    if (result?.data?.accessToken) {
      hustlerToken = result.data.accessToken;
      hustlerId = result.data.user._id;
      console.log('✓ Hustler logged in:', hustlerId);
    } else {
      throw new Error('Hustler login failed');
    }

    console.log('\n4. Funding manager wallet with KSH 10000...');
    result = await post('/wallets/fund', {
      amount: 10000,
      currency: 'KSH',
      description: 'Test funding for escrow'
    }, managerToken);
    if (result?.success) {
      console.log('✓ Manager wallet funded with KSH 10000');
    } else {
      console.log('Fund wallet response:', result);
      throw new Error('Wallet funding failed');
    }

    console.log('\n5. Creating contract...');
    result = await post('/contracts', {
      title: 'Test Project',
      description: 'A project to test the milestone workflow',
      amount: 5000,
      currency: 'KSH',
      paymentMethod: 'escrow',
      seller: hustlerId,
      milestones: []
    }, managerToken);
    if (result?.data?.contract?._id) {
      contractId = result.data.contract._id;
      console.log('✓ Contract created:', contractId);
      console.log('  - Seller assigned:', hustlerId);
    } else {
      console.log('Contract creation response:', result);
      throw new Error('Contract creation failed');
    }

    console.log('\n6. Creating milestone...');
    result = await post(`/contracts/${contractId}/milestones`, {
      title: 'Phase 1 - Design',
      description: 'Create design mockups',
      amount: 2500,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }, managerToken);
    if (result?.data?.milestone?._id) {
      milestoneId = result.data.milestone._id;
      console.log('✓ Milestone created:', milestoneId);
    } else {
      console.log('Milestone creation response:', result);
      throw new Error('Milestone creation failed');
    }

    console.log('\n7 Preparing escrow for contract...');
    result = await post(`/contracts/${contractId}/escrow`, {
      amount: 2500
    }, managerToken);
    if (result?.data?.contract?.escrowPrepared) {
      console.log('✓ Escrow prepared, amount:', 2500);
    } else {
      console.log('Escrow prepare response:', result);
      throw new Error('Escrow preparation failed');
    }

    console.log('\n8. Hustler submitting milestone...');
    result = await post(`/milestones/${milestoneId}/submit`, {
      submissionData: {
        notes: 'Design mockups are ready for review',
        workSampleUrl: 'https://example.com/designs'
      }
    }, hustlerToken);
    if (result?.data?.milestone?.status === 'submitted') {
      console.log('✓ Milestone submitted, status:', result.data.milestone.status);
    } else {
      console.log('Submission response:', result);
      throw new Error('Milestone submission failed');
    }

    console.log('\n9. Manager approving milestone (releases escrow payment)...');
    result = await post(`/milestones/${milestoneId}/approve`, {}, managerToken);
    if (result?.data?.milestone?.status === 'approved') {
      console.log('✓ Milestone approved, status:', result.data.milestone.status);
      console.log('✓ Payment status:', result.data.milestone.paymentStatus);
    } else {
      console.log('Approval response:', result);
      throw new Error('Milestone approval failed');
    }

    console.log('\n✅ WORKFLOW TEST COMPLETE!\n');
    console.log('Summary:');
    console.log('- Contract created:', contractId);
    console.log('- Milestone created:', milestoneId);
    console.log('- Hustler submitted work');
    console.log('- Manager approved and released payment');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    process.exit(1);
  }
})();
