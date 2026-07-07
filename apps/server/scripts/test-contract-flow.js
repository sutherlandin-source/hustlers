(async () => {
  const base = 'http://localhost:5000/api/v1';
  const fetch = global.fetch;
  if (!fetch) {
    console.error('fetch not available in this Node runtime');
    process.exit(1);
  }

  async function post(path, body, token) {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }

  try {
    console.log('Register buyer');
    const buyerEmail = `buyer+${Date.now()}@example.com`;
    let r = await post('/auth/register', { email: buyerEmail, password: 'TestPass123!', firstName: 'Buyer', lastName: 'One' });
    console.log('BUYER REGISTER', r.status, r.data?.data?.user?._id);

    console.log('Register seller');
    const sellerEmail = `seller+${Date.now()}@example.com`;
    let s = await post('/auth/register', { email: sellerEmail, password: 'TestPass123!', firstName: 'Seller', lastName: 'One' });
    console.log('SELLER REGISTER', s.status, s.data?.data?.user?._id);

    const buyerToken = r.data?.data?.accessToken;
    const sellerToken = s.data?.data?.accessToken;
    const buyerId = r.data?.data?.user?._id;
    const sellerId = s.data?.data?.user?._id;

    if (!buyerToken || !sellerToken) {
      console.error('Failed to obtain tokens');
      process.exit(1);
    }

    // Create contract
    console.log('Create contract');
    const contractResp = await post('/contracts', { title: 'Test Contract', description: 'Desc', amount: 500, currency: 'KSH', buyer: buyerId, seller: sellerId, paymentMethod: 'escrow' }, buyerToken);
    console.log('CONTRACT CREATE', contractResp.status, contractResp.data?.data?.contract?._id);
    const contractId = contractResp.data?.data?.contract?._id;

    // Create milestone
    console.log('Create milestone');
    const milestoneResp = await post(`/contracts/${contractId}/milestones`, { title: 'Milestone 1', description: 'Do work', amount: 250, dueDate: null }, buyerToken);
    console.log('MILESTONE CREATE', milestoneResp.status, milestoneResp.data?.data?.milestone?._id);
    const milestoneId = milestoneResp.data?.data?.milestone?._id;

    // Submit milestone as seller
    console.log('Submit milestone');
    const submitResp = await post(`/milestones/${milestoneId}/submit`, { submissionData: { link: 'http://example.com/deliverable' } }, sellerToken);
    console.log('SUBMIT', submitResp.status, submitResp.data?.data?.milestone?.status);

    // Approve milestone as buyer
    console.log('Approve milestone');
    const approveResp = await post(`/milestones/${milestoneId}/approve`, {}, buyerToken);
    console.log('APPROVE', approveResp.status, approveResp.data?.data?.milestone?.status);

    if (approveResp.status === 200) {
      console.log('Contract & milestone flow OK');
      process.exit(0);
    } else {
      console.error('Flow failed', approveResp);
      process.exit(2);
    }
  } catch (err) {
    console.error('ERROR', err);
    process.exit(1);
  }
})();
