# Multi-Worker Contract & Applications — Full System Analysis

**Date**: 2026-07-22  
**Scope**: Contracts, Applications, Escrow, Mobile Apply Flow

---

## System Overview

The HUSTLERS platform supports **multi-worker contracts**, where:
- A **Manager** creates a contract and specifies `numWorkers` (default: 1)
- Multiple **Hustlers** can apply for the same contract
- The Manager reviews applications and accepts up to `numWorkers` hustlers
- Each accepted hustler gets their own milestone copies
- Payment is split equally between accepted workers after commission

---

## Database Schema

### Contract Model (`apps/server/src/modules/contracts/model.js`)

```js
{
  title: String,
  description: String,
  buyer: ObjectId → User (manager),
  seller: ObjectId → User (legacy: first accepted hustler),
  numWorkers: Number (default: 1, min: 1),
  amount: Number,
  currency: String,
  escrowWallet: ObjectId → Wallet,
  escrowAmount: Number,
  escrowPrepared: Boolean,
  escrowStatus: String (enum),
  escrowReleasedAmount: Number,
  milestones: [ObjectId → Milestone],
  status: String (enum),
  metadata: Mixed,
  ...
}
```

### ContractApplication Model (`apps/server/src/modules/applications/model.js`)

```js
{
  contractId: ObjectId → Contract,
  hustlerId: ObjectId → User,
  status: String (enum: pending, accepted, rejected, cancelled),
  coverLetter: String,
  proposedRate: Number,
  estimatedDuration: String,
  attachments: [String],
  appliedAt: Date,
  reviewedAt: Date,
  reviewedBy: ObjectId → User,
  rejectionReason: String,
}

// Unique compound index: { contractId: 1, hustlerId: 1 }
```

**Application Statuses**:
- `pending` — submitted, awaiting manager review
- `accepted` — manager approved this application
- `rejected` — manager declined this application
- `cancelled` — hustler withdrew application

---

## Application Flow

### 1. Hustler applies for contract

**Client**: `POST /api/applications/:contractId`

**Request body**:
```json
{
  "coverLetter": "Application for {job title}",
  "proposedRate": 5000,
  "estimatedDuration": ""
}
```

**Server validations** (`apps/server/src/modules/applications/service.js::createApplication`):

1. Valid `contractId` and `hustlerId`
2. User exists
3. Hustler has saved identity details (`idNumber`, `mpesaNumber`)
4. Hustler's verification status is **approved** by admin
5. No duplicate application (except `cancelled` or `rejected` — reapply allowed)
6. Contract exists
7. Contract status is `pending` or `active`
8. Not all worker slots filled yet:
   ```js
   const acceptedCount = await ContractApplication.countDocuments({
     contractId,
     status: APPLICATION_STATUSES.ACCEPTED
   });
   if (acceptedCount >= maxWorkers) throw conflict
   ```

**On success**:
- Creates `ContractApplication` document with status `pending`
- Emits `application.created` notification
- Contract status **stays as-is** (not changed to `applied`)

**On duplicate**:
- If existing status is `cancelled` or `rejected` → **update** existing record, reset fields, set status back to `pending`
- Otherwise throw `409 Conflict`

---

### 2. Manager accepts application

**Client**: `POST /api/applications/:applicationId/accept`

**Server logic** (`apps/server/src/modules/applications/service.js::acceptApplication`):

1. Application status must be `pending`
2. Contract must exist
3. Check if worker slots already full:
   ```js
   const acceptedBefore = await ContractApplication.countDocuments({
     contractId,
     status: APPLICATION_STATUSES.ACCEPTED
   });
   if (acceptedBefore >= maxWorkers) throw conflict
   ```
4. Update application:
   - `status = 'accepted'`
   - `reviewedAt = now`
   - `reviewedBy = managerId`
5. Update contract:
   - `status = 'assigned'`
   - If `seller` is null → assign first accepted hustler as `seller` (legacy field)
   - Create milestone copies for this hustler via `ensureMilestonesForHustler()`
   - If not escrow-funded yet → set `escrowStatus = 'waiting_for_funding'`
6. If all slots filled after this accept → **auto-reject remaining pending applications**:
   ```js
   await ContractApplication.updateMany(
     {
       contractId,
       status: APPLICATION_STATUSES.PENDING
     },
     {
       status: APPLICATION_STATUSES.REJECTED,
       rejectionReason: "All worker slots have been filled for this contract"
     }
   );
   ```
7. Try to auto-fund escrow via `escrowService.reserveEscrow()` (silent fail if manager wallet insufficient)
8. Emit `application.accepted` notification

---

### 3. Manager rejects application

**Client**: `POST /api/applications/:applicationId/reject`

**Server logic**:
- Application status must be `pending`
- Update:
  - `status = 'rejected'`
  - `rejectionReason = reason`
  - `reviewedAt = now`
  - `reviewedBy = managerId`
- If contract status was `applied` → revert to `pending`
- Emit `application.rejected` notification

---

## Milestone Cloning for Multi-Worker

When a manager accepts an application, the system calls:

```js
ContractApplicationService.ensureMilestonesForHustler(contract, hustlerId)
```

**Logic**:
1. Check if hustler already has milestones → if yes, skip
2. Calculate per-worker amount:
   ```js
   const maxWorkers = Math.max(1, Number(contract.numWorkers) || 1);
   const workerAmount = (amount) => Number((amount / maxWorkers).toFixed(2));
   ```
3. Find existing milestones for this contract
4. If unassigned milestones exist → assign them to this hustler + update amounts
5. Otherwise → clone template milestones for this hustler with new amounts

**Milestone structure**:
```js
{
  contract: contractId,
  title: "Stage 1",
  description: "...",
  amount: workerAmount(originalAmount),  // Split per worker
  assignedTo: hustlerId,
  status: "pending",
  workStatus: "not_started",
  paymentStatus: "pending",
  metadata: {
    sourceMilestoneId: templateMilestoneId,  // For traceability
    clonedForHustler: hustlerId,
    originalAmount: 5000  // Full contract amount before split
  }
}
```

---

## Escrow & Payment Flow

### Reserve Escrow

**Endpoint**: `POST /api/contracts/:id/escrow`

**Logic** (`apps/server/src/modules/escrow/service.js::reserveEscrow`):

1. Manager must be contract buyer
2. Contract must have assigned hustler(s)
3. Contract status must be `assigned` or `active`
4. Escrow amount ≤ contract amount
5. Manager wallet must have sufficient **available balance**
6. If insufficient in contract currency wallet:
   - Try **ESCROW wallet** in same currency
   - Try **USER wallet** in different currency (with conversion)
   - Try **ESCROW wallet** in different currency (cross-conversion)
   - USD → KSH conversion rate: **130:1**
7. Deduct from manager wallet (available balance)
8. Credit to escrow wallet (increase locked balance)
9. Contract updates:
   ```js
   contract.escrowWallet = escrowWallet._id
   contract.escrowAmount = amount
   contract.escrowPrepared = true
   contract.escrowStatus = 'funded'
   ```
10. Create HOLD transaction on manager wallet + CREDIT transaction on escrow wallet

---

### Release Payment (Final Approval)

**Endpoint**: `POST /api/contracts/:id/final-approval`

**Logic** (`apps/server/src/modules/escrow/service.js::releaseFundedContractEscrow`):

1. Manager must be contract buyer
2. Escrow must be funded
3. Contract must have assigned hustler(s)
4. Not already released
5. Find all accepted applications:
   ```js
   const acceptedApplications = await ContractApplication.find({
     contractId,
     status: APPLICATION_STATUSES.ACCEPTED
   });
   ```
6. If no accepted apps → fall back to `contract.seller`
7. Check if all slots filled:
   ```js
   if (payeeIds.length < maxWorkers) throw conflict
   ```
8. For each accepted hustler:
   - Create hustler wallet (user type)
   - Calculate split:
     ```js
     const grossShares = splitAmount(escrowAmount, payeeIds.length)
     const commissionShares = splitAmount(hustlerCommission, payeeIds.length)
     const netAmount = grossAmount - commissionAmount
     ```
   - Credit net amount to hustler wallet (available balance)
9. Credit commission to platform wallet
10. Deduct from escrow wallet (reduce locked balance)
11. Update contract:
    ```js
    contract.escrowReleasedAmount += amount
    contract.escrowStatus = 'released'
    contract.status = 'completed'
    contract.completedAt = now
    contract.finalApprovedBy = managerId
    contract.finalApprovedAt = now
    ```
12. Update all approved milestones:
    ```js
    Milestone.updateMany(
      { contract, status: 'approved' },
      { paymentStatus: 'released', paymentReleasedAt: now }
    )
    ```
13. Increment `completedContracts` for buyer + all hustlers
14. Emit `contract.paymentReleased` notification

---

## Multi-Worker Enrichment

**Server** (`apps/server/src/modules/contracts/service.js::attachMultiWorkerInfo`):

For every contract returned, the system:

1. Queries accepted applications:
   ```js
   const acceptedApplications = await ContractApplication.find({
     contractId: { $in: contractIds },
     status: { $in: ['accepted', 'approved', 'active', 'in_progress'] }
   }).populate('hustlerId');
   ```
2. Maps to `acceptedHustlers` array
3. If no accepted apps → falls back to `contract.seller`
4. Calculates payout summary:
   ```js
   const workerSlots = Math.max(1, contract.numWorkers || 1);
   const payoutCount = acceptedHustlers.length || (contract.seller ? 1 : 0);
   const splitCount = Math.max(workerSlots, payoutCount, 1);
   const grossPerHustler = amount / splitCount;
   const commissionPerHustler = grossPerHustler * 0.025;
   const netPerHustler = grossPerHustler - commissionPerHustler;
   ```
5. Adds to contract payload:
   ```js
   {
     acceptedHustlers: [{ _id, name, email, avatar, acceptedAt }],
     assignedHustlers: [...],  // Combines accepted + seller
     workerSlots: 3,
     payoutSummary: {
       workerSlots: 3,
       acceptedCount: 2,
       pendingSlots: 1,
       splitCount: 3,
       grossPerHustler: 1666.67,
       commissionRate: 0.025,
       commissionPerHustler: 41.67,
       netPerHustler: 1625.00,
       currency: "KSH",
       isMultiWorker: true
     }
   }
   ```

---

## Mobile Apply Flow

### Before Changes (Issues)

**File**: `apps/mobile/src/screens/contracts/ContractDetailsScreen.js`

**Problems**:
1. ❌ Apply errors shown in muted grey (`rejectionText` style) — hard to notice
2. ❌ Terms checkbox stayed interactive during loading → users could toggle mid-submission
3. ❌ Button text "Applying..." → no visual spinner
4. ❌ Success message shown inside `{canApply}` block → disappeared immediately after apply (when `canApply` flipped false)
5. ❌ No hint text when terms unchecked + KYC approved

### After Changes (Fixed)

**File**: `apps/mobile/src/screens/contracts/ContractDetailsScreen.js`

**Improvements**:
1. ✅ Apply errors now red & bold (`applyErrorText` style: `#B91C1C`, `fontWeight: 600`)
2. ✅ Terms row disabled during loading:
   ```jsx
   <Pressable
     style={[styles.termsRow, (applyLoading || !hasApprovedKyc) && styles.termsRowDisabled]}
     onPress={() => {
       if (!applyLoading && hasApprovedKyc) {
         setHasAgreedToTerms((value) => !value);
       }
     }}
   >
   ```
3. ✅ Button shows `ActivityIndicator` spinner while loading:
   ```jsx
   {applyLoading ? (
     <ActivityIndicator color="#fff" size="small" />
   ) : (
     <Text style={styles.primaryButtonText}>Apply Now</Text>
   )}
   ```
4. ✅ Success message persists after `canApply` flips false:
   ```jsx
   {!isManager && !canApply && applySuccess ? (
     <Section title="Application Submitted">
       <Text style={styles.successText}>{applySuccess}</Text>
     </Section>
   ) : null}
   ```
5. ✅ Hint text when terms unchecked:
   ```jsx
   {!hasAgreedToTerms && !applyLoading && hasApprovedKyc ? (
     <Text style={styles.termsHint}>
       Please agree to the terms to enable the apply button.
     </Text>
   ) : null}
   ```

---

## Security & Authorization

### Application Endpoints

| Endpoint | Auth | Role Restriction | Owner Check |
|----------|------|------------------|-------------|
| `POST /applications/:contractId` | ✅ | Hustler only | N/A |
| `GET /applications/hustler/my` | ✅ | No | Filters by `req.user.userId` |
| `GET /applications/contract/:contractId` | ✅ | **None** ❌ | No |
| `GET /applications/:applicationId` | ✅ | No | No |
| `PUT /applications/:applicationId` | ✅ | No | ✅ (hustlerId match) |
| `POST /applications/:applicationId/cancel` | ✅ | No | ✅ (hustlerId match) |
| `POST /applications/:applicationId/accept` | ✅ | No | No (should check buyer) |
| `POST /applications/:applicationId/reject` | ✅ | No | No (should check buyer) |

**Security Issues**:

1. ❌ **`GET /applications/contract/:contractId`** — No role check or ownership validation. Any authenticated user can see all applications for any contract.

   **Recommendation**: Add manager role check OR verify `req.user.userId === contract.buyer`.

2. ❌ **`POST /applications/:applicationId/accept`** and **`POST /applications/:applicationId/reject`** — No role or buyer check in route. Authorization logic is inside service, but route should validate.

   **Recommendation**: Add `authorizeRoles(USER_ROLES.MANAGER)` middleware + verify `contract.buyer === req.user.userId` in controller.

---

## Data Integrity Issues

### 1. Milestone Amount Inconsistency

When a manager edits a contract and changes `numWorkers` or `amount`, existing milestone copies for already-accepted hustlers **are not updated**.

**Risk**: Accepted hustlers might have stale amounts that don't match the new split ratio.

**Recommendation**: Block editing `numWorkers` or `amount` after any application has been accepted.

---

### 2. Escrow Slot Validation Gap

`reserveEscrow()` checks if `contract.seller` exists but **does not check if all `numWorkers` slots are filled**.

**Scenario**:
- Contract requires 3 workers
- Manager accepts 1 hustler
- Manager funds escrow → succeeds
- Manager later accepts 2 more hustlers
- Payment release tries to split among 3 hustlers but escrow was calculated for 1

**Risk**: Payment distribution mismatch.

**Recommendation**: Add validation in `reserveEscrow()`:
```js
const acceptedCount = await ContractApplication.countDocuments({
  contractId,
  status: APPLICATION_STATUSES.ACCEPTED
});
if (acceptedCount < maxWorkers) {
  throw new ApiError(409, `All ${maxWorkers} worker slots must be filled before funding escrow`);
}
```

---

### 3. Application Race Condition

Multiple applications could be accepted simultaneously if requests arrive before `acceptedBefore` count increments.

**Risk**: Over-accepting applications.

**Recommendation**: Use MongoDB transaction + unique partial index or distributed lock.

---

### 4. Cross-Currency Escrow Edge Case

If manager wallet is in USD but contract is in KSH, the system converts at 130:1 and deducts from USD wallet.

**Issue**: The `escrowAmount` stored in contract is in KSH, but the deduction was in USD.

**Risk**: If the manager later disputes or refunds, the refund currency might not match the original deduction.

**Recommendation**: Store `escrowSourceCurrency` and `escrowConversionRate` in `contract.metadata` for traceability.

---

## Testing Checklist

### Multi-Worker Application Flow

- [ ] Manager creates contract with `numWorkers: 3`
- [ ] Hustler A applies → pending
- [ ] Hustler B applies → pending
- [ ] Hustler C applies → pending
- [ ] Hustler D applies → pending
- [ ] Manager accepts A → status `accepted`, contract status `assigned`, A gets milestone copies
- [ ] Manager accepts B → status `accepted`, B gets milestone copies
- [ ] Manager accepts C → status `accepted`, C gets milestone copies, **D automatically rejected**
- [ ] Manager tries to accept D → should fail (slots full)
- [ ] Check milestone amounts:
  - A, B, C each have milestones with `amount = contract.amount / 3`
- [ ] Manager funds escrow (amount = contract.amount)
- [ ] All 3 hustlers submit work
- [ ] Manager approves all milestones
- [ ] Manager releases payment → each hustler gets `(contract.amount / 3) * 0.975` (after 2.5% commission)
- [ ] Platform wallet gets total commission = `contract.amount * 0.025`
- [ ] Contract status → `completed`
- [ ] Escrow status → `released`

### Edge Cases

- [ ] Hustler applies twice → second attempt fails with `409 Conflict`
- [ ] Hustler applies, gets rejected, reapplies → succeeds, resets to `pending`
- [ ] Hustler applies, cancels, reapplies → succeeds, resets to `pending`
- [ ] Manager tries to fund escrow before all slots filled → fails
- [ ] Manager tries to release payment before all milestones approved → fails
- [ ] Manager edits contract after application accepted → fails
- [ ] Hustler without KYC approval applies → fails
- [ ] Cross-currency escrow (USD manager, KSH contract) → succeeds with conversion
- [ ] Manager wallet insufficient (but has USD wallet with enough) → falls back to USD, converts

---

## Recommendations Summary

### High Priority

1. **Add authorization checks** to `GET /applications/contract/:contractId` and accept/reject routes
2. **Block escrow funding until all worker slots filled** in multi-worker contracts
3. **Store escrow source currency and conversion metadata** for traceability

### Medium Priority

4. **Block editing `numWorkers` or `amount`** after any application accepted
5. **Add transaction safety** to application acceptance (prevent race conditions)
6. **Mobile apply flow improvements** — ✅ COMPLETED

### Low Priority

7. Add admin endpoint to manually adjust milestone amounts if contract edited
8. Add contract event log for audit trail (who applied, who accepted, who rejected, when)
9. Consider milestone status sync job (detect stale milestone states and auto-heal)

---

## Files Modified

- ✅ `apps/mobile/src/screens/contracts/ContractDetailsScreen.js`
  - Apply button now shows spinner during loading
  - Errors displayed in red bold text
  - Success message persists after apply
  - Terms checkbox disabled during loading
  - Hint text added when terms not agreed

---

## Files to Review (No Changes Yet)

- `apps/server/src/modules/applications/routes.js` — Add auth guards
- `apps/server/src/modules/applications/controller.js` — Add buyer ownership checks
- `apps/server/src/modules/escrow/service.js` — Add slot-fill validation before escrow funding
- `apps/server/src/modules/contracts/service.js` — Block editing after applications accepted

---

**End of Analysis**
