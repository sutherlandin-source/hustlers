# HUSTLERS Milestone Approval & Escrow Release - Testing Guide

## Quick Start: Complete Workflow Test

This guide walks through the entire milestone approval and payment release workflow from start to finish.

---

## Part 1: Manager Setup (Contract & Escrow Funding)

### Step 1: Manager Login
1. Open http://localhost:5173/
2. Click "Manager" on auth page
3. Login with:
   - Email: `manager@hustlers.com`
   - Password: `password123`
4. Verify you see "Manager Dashboard"

### Step 2: Create a Test Contract
1. Navigate to **Create New Job** (or `/manager/create-contract`)
2. Fill in contract details:
   - Title: "Logo Design Task"
   - Description: "Design a modern logo for our startup"
   - Location: "Remote"
   - Category: "Design"
   - Amount: 5000 KSH
   - Start Date: Today
   - Completion Date: 7 days from now
3. Under "Work Stages", create 2 milestones:
   - **Milestone 1**: 
     - Title: "Initial Concepts"
     - Amount: 2000 KSH
     - Due Date: 3 days from now
   - **Milestone 2**: 
     - Title: "Final Design & Revisions"
     - Amount: 3000 KSH
     - Due Date: 7 days from now
4. Click "Create Contract"
5. Note the Contract ID from the success message or URL

### Step 3: Fund Escrow Wallet
1. Navigate to **Manager Overview** or **Wallet**
2. Scroll to escrow section or funding area
3. Enter amount: **5000** (total contract amount)
4. Click "Fund Escrow"
5. Verify balance updated:
   - Escrow Holding: KSH 5000.00
   - Total Wallet: KSH 5000.00

**✅ Manager Setup Complete**

---

## Part 2: Hustler Workflow (Submit Milestones)

### Step 1: Hustler Login
1. Sign out from current session
2. Login as hustler:
   - Email: `hustler@hustlers.com`
   - Password: `password123`
3. Verify you see "Hustler Dashboard"

### Step 2: Find & View Contract
1. Navigate to **Dashboard → Contracts**
2. Find the "Logo Design Task" contract created by manager
3. Verify status is "pending" (available jobs)
4. Click "View Details"
5. Scroll down to "Work Stages" section
6. Verify both milestones are listed:
   - "Initial Concepts" - 2000 KSH - pending
   - "Final Design & Revisions" - 3000 KSH - pending

### Step 3: Apply/Accept Contract
1. On contract details page, click "Apply for Job"
2. Verify contract now shows "Assigned Worker: [Your Name]"
3. Refresh page to confirm assignment persisted

### Step 4: Submit First Milestone
1. Navigate to **Dashboard → Milestones** (or click milestone link)
2. Find "Initial Concepts" milestone
3. Click on it (or navigate to milestone details)
4. In "Mark Work Complete" section:
   - **Completion Notes**: "I've created 5 initial logo concepts exploring different design directions. All files are ready for review."
   - **Work Sample Link**: `https://dribbble.com/example` (or any portfolio URL)
   - **Proof File**: Upload a test image/file (optional)
5. Click "Mark Work Complete"
6. Verify success message: "Milestone submitted for approval"
7. Verify status changed from "pending" to "submitted"

### Step 5: Submit Second Milestone (Optional - to show multiple submissions)
1. Go back to milestones list
2. Find "Final Design & Revisions"
3. Click on it
4. Fill submission form:
   - **Completion Notes**: "All revisions completed based on feedback. Final files with all requested changes are attached."
   - **Work Sample Link**: Another portfolio link
5. Click "Mark Work Complete"
6. Verify success message and status change

**✅ Hustler Submission Complete**

---

## Part 3: Manager Approval & Payment Release

### Step 1: Manager Login
1. Sign out from hustler
2. Login as manager again (email: `manager@hustlers.com`)
3. Navigate to **Manager → Work Stage Reviews** (or `/manager/milestones`)

### Step 2: Review Pending Milestones
1. Verify "Pending Review" section shows the submitted milestones
2. Click on "Initial Concepts" milestone card
3. Expand submission details and verify:
   - **Completion Notes**: Shows the hustler's submission notes
   - **Work Sample**: Shows clickable link
   - **Submitted by**: Shows hustler name
   - **Status**: shows "submitted"

### Step 3: Approve First Milestone (Payment Release)
1. Click **"Approve"** button on the milestone card
2. Verify loading state: "Processing..."
3. Wait for response
4. Verify success message: "Milestone approved successfully!"
5. **IMPORTANT - Verify in background:**
   - Milestone moves from "Pending Review" to "✓ Approved" section
   - Status badge changes to green "approved"
6. Check wallet to verify escrow release:
   - Navigate to **Manager → Wallet**
   - Escrow Holding should decrease by 2000 → now 3000 KSH
   - Total Wallet should decrease by 2000 → now 3000 KSH (released from escrow)

### Step 4: Approve Second Milestone (Optional)
1. Back to Work Stage Reviews
2. Click **"Approve"** on "Final Design & Revisions"
3. Verify success and movement to Approved section
4. Check wallet again:
   - Escrow Holding: 1000 KSH (3000 - 2000)
   - OR: 0 KSH if both approved (5000 - 2000 - 3000)

### Step 5: Test Rejection Workflow (Optional)
1. If you created more milestones, try rejecting one
2. Click **"Reject"** button
3. Enter rejection reason: "Concepts don't match brand guidelines. Please revise and resubmit."
4. Click "Confirm Rejection"
5. Verify success message and move to "✗ Rejected" section
6. Escrow funds should NOT be released for rejected milestones

**✅ Manager Approval Complete**

---

## Part 4: Verify Payment in Hustler Wallet

### Step 1: Check Hustler Wallet
1. Sign out from manager
2. Login as hustler again
3. Navigate to **Dashboard → Wallet**
4. Verify wallet shows:
   - **Available Balance**: Shows approved milestone amount (e.g., KSH 2000.00)
   - **Escrow Holding**: Shows remaining locked funds (if any)
   - **Total Wallet**: Sum of available + escrow
5. Scroll to "Recent Transactions"
6. Verify transactions showing:
   - Type: "CREDIT"
   - Amount: Milestone amounts (2000, 3000, etc.)
   - Status: "COMPLETED"
   - Timestamp: With approval time

### Step 2: Check Transaction Details
1. Click on transaction (if available)
2. Verify details:
   - Reference ID: Unique ID for audit trail
   - Description: "Milestone payment credited to seller wallet"
   - Balance After: Showing account balance after credit

**✅ Payment Verification Complete**

---

## Part 5: Data Verification (Database Check)

Optional: Use MongoDB Compass or MongoDB CLI to verify:

```javascript
// Check Milestone
db.milestones.findOne({_id: ObjectId("...")})
// Should show:
// - status: "approved"
// - paymentStatus: "released"
// - submittedBy: [Hustler ID]
// - approvedBy: [Manager ID]
// - approvedAt: [Date]
// - paymentReleasedAt: [Date]
// - paymentTransaction: [Transaction ID]

// Check Escrow Wallet
db.wallets.findOne({type: "escrow"})
// Should show:
// - lockedBalance: [Reduced by milestone amounts]
// - balance: [Reduced by milestone amounts]

// Check Hustler Wallet
db.wallets.findOne({type: "user", user: [Hustler ID]})
// Should show:
// - availableBalance: [Increased by approved amounts]
// - balance: [Increased by approved amounts]

// Check Transactions
db.transactions.find({contract: ObjectId("...")})
// Should show:
// - Escrow DEBIT transaction
// - Hustler CREDIT transaction
// - Both with matching amounts
```

---

## Troubleshooting Guide

### Issue: Escrow wallet not shown on Manager Wallet page
**Solution**: 
- Ensure contract was created successfully
- Fund the escrow through the correct page
- Check browser console for errors
- Refresh page (Ctrl+Shift+R)

### Issue: "Insufficient locked funds in escrow" error when approving
**Solution**:
- Manager must fund escrow with at least the contract amount
- Escrow amount should be ≥ sum of all milestones
- If multiple milestones, ensure funds cover all

### Issue: Status not changing to "submitted" after clicking submit
**Solution**:
- Check browser console for API errors
- Verify milestone exists
- Check that you're clicking the correct button
- Verify API endpoint responds (check Network tab)

### Issue: Payment not showing in hustler wallet after approval
**Solution**:
- Refresh wallet page (it auto-fetches on load)
- Check Manager Wallet page first - verify escrow funds decreased
- If escrow decreased but hustler wallet didn't increase, check API response
- Look for error messages in browser console

### Issue: Can't find submitted milestone in Manager Milestones page
**Solution**:
- Manager must be logged in with same account that created contract
- Milestones filter by contract owner (buyer)
- Check if filters are hiding the milestone (e.g., status filter)
- Refresh page to sync

---

## Expected Results Summary

### After Hustler Submission:
✅ Milestone status: **pending → submitted**
✅ Manager can see milestone in "Pending Review" section
✅ Submission notes visible in Manager Milestones page
✅ Work sample link clickable
✅ Submission timestamp recorded

### After Manager Approval:
✅ Milestone status: **submitted → approved**
✅ Payment status: **pending → released**
✅ Milestone moves to "✓ Approved" section
✅ Escrow wallet locked balance decreased by milestone amount
✅ Hustler wallet available balance increased by milestone amount
✅ Two transaction records created (escrow debit + hustler credit)
✅ Both transactions show in wallet transaction history

### After Rejection:
✅ Milestone status: **submitted → rejected**
✅ Rejection reason recorded
✅ Milestone moves to "✗ Rejected" section
✅ No funds released
✅ Escrow balance unchanged
✅ Hustler can resubmit (status returns to pending option)

---

## Performance Notes

- **Submission**: ~500ms (API call + state update)
- **Approval with Payment Release**: ~1-2s (includes transaction creation)
- **Page Refresh**: ~2-3s (includes data fetching from server)
- **Transaction Creation**: MongoDB transaction ensures atomicity

---

## Security Notes

✅ **Implemented Security:**
- All endpoints require authentication
- Only contract owner (manager) can approve milestones
- Only assigned hustler can submit milestones
- Escrow funds validated before release
- MongoDB transactions ensure no partial payments
- Audit logs created for all approvals

---

## Next Steps After Testing

If all tests pass:
1. ✅ Workflow is production-ready
2. Deploy to staging for user acceptance testing
3. Create user documentation
4. Set up monitoring for payment transactions
5. Consider adding email notifications

---

## Support & Questions

If you encounter issues:
1. Check this troubleshooting guide
2. Review MILESTONE_WORKFLOW_IMPLEMENTATION.md for architecture
3. Check browser console for error messages
4. Check server logs for backend errors
5. Verify MongoDB is running and connected
6. Ensure both backend and frontend are running

---

**Last Updated:** June 10, 2026
**Version:** 1.0
**Status:** Ready for Testing ✅
