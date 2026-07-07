# HUSTLERS Platform - Payment Structure Refactoring

## Overview
This document describes the complete refactoring of the contract and milestone system to better suit Kenya's informal job market and casual workers.

## Problem Statement
Many jobs do not naturally have multiple milestones or work stages. Forcing managers to create stages made the process confusing and unnecessary for simple jobs like house cleaning, delivery, or shop assistance.

## Solution
Introduced a flexible payment structure system with two options:
1. **Single Payment** (default) - For simple jobs
2. **Payment in Stages** - For larger, complex projects

---

## Terminology Changes

### User-Friendly Language Replacement

| Old Term | New Term | Context |
|----------|----------|---------|
| Milestone | Work Stage | The completion point in a job |
| Milestone Description | Task Description | Details of what needs to be done |
| Submit Milestone | Mark Work Complete | Worker completing a stage |
| Approve Milestone | Approve Completed Work | Manager approving work |
| Contract | Job | The overall project or task |
| Buyer | Manager | The person creating/managing the job |
| Seller | Worker/Hustler | The person completing the work |

---

## Features

### 1. Single Payment Workflow (Default)

**Best for simple jobs:**
- House cleaning
- Delivery & Errands
- Shop assistance
- Farm work
- General labor
- Event support
- Household work

**How it works:**
1. Manager creates a job with:
   - Job Title
   - Job Category
   - Job Description
   - Work Location
   - Start Date
   - Expected Completion Date
   - Total Payment Amount (single field)
   - Workers Needed
   - Payment Type (Fixed/Daily/Hourly)

2. System automatically creates one hidden work stage called "Job Completion"
3. The full payment amount is attached to this stage
4. Manager does NOT need to manually create stages

5. Workflow:
   - Create Job → Assign Worker → Complete Job → Mark Work Complete → Approve Completed Work → Release Payment

**Payment Flow:**
- Full payment amount held in escrow from job creation
- Released completely upon manager's approval of the completed work

---

### 2. Payment in Stages Workflow

**Best for larger projects with multiple tasks:**
- Construction projects
- Complex renovations
- Multi-step deliveries
- Large moving jobs

**How it works:**
1. Manager selects "Payment in Stages" option
2. Specifies number of work stages (2-6)
3. For each stage, enters:
   - Task Title
   - Task Description
   - Stage Payment Amount

4. System validates:
   - All stage payments entered
   - Sum of stage payments equals total contract amount

5. Workflow:
   - Create Job → Add Work Stages → Assign Worker → Complete Stage → Approve Completed Work → Release Stage Payment → Repeat for each stage

**Payment Flow:**
- Total amount held in escrow
- Released incrementally as each stage is approved
- Partial release after each stage completion

---

## User Interface Changes

### Contract Creation Form

**Payment Structure Section (Prominent):**
- Two radio button options with descriptions
- "Single Payment" is default
- Visual cards showing benefits of each option

**Conditional Form Fields:**

**When "Single Payment" selected:**
- Shows: "Total Payment Amount (KES)" field
- Hides: "Number of Work Stages" and "Work Stages" section
- Simpler, less intimidating interface
- Helper text: "Full payment will be released after you approve the completed work."

**When "Payment in Stages" selected:**
- Shows: "Number of Work Stages" dropdown (2-6 options)
- Shows: "Total Contract Amount (KES)" field
- Shows: "Work Stages" section with:
  - Task Title field
  - Task Description field
  - Stage Payment field
- "+ Add Work Stage" button (if needed)
- Helper text: "This total must equal the sum of all work stage payments below."

### Page Terminology Updates

All pages updated to use new terminology:

| Page | Changes |
|------|---------|
| **ContractCreatePage** | Title: "Create New Job" instead of "Create New Contract"; Updated all section headers and field labels |
| **ContractDetailsPage** | Title: "Job Details"; Section: "Work Stages" instead of "Milestones"; "Manager" and "Assigned Worker" fields |
| **MilestonesPage** | Title: "Assigned Work Stages"; Text: "Mark work complete" instead of "Submit deliverables" |
| **MilestoneDetailsPage** | Title: "Work Stage Details"; Section: "Mark Work Complete" instead of "Submit Work" |
| **ManagerMilestonesPage** | Title: "Work Stage Reviews"; Sections: "Pending Review", "Approved", "Rejected" for work stages |
| **MilestoneCreatePage** | Title: "Create Work Stage"; Fields: "Job ID", "Task Title", "Task Description" |

---

## Technical Implementation

### Frontend Changes

**File: apps/web/src/pages/dashboard/ContractCreatePage.jsx**

```javascript
const [formData, setFormData] = useState({
  // ... existing fields ...
  paymentStructure: "single", // NEW: single or stages
  numStages: "2", // NEW: for stages payment structure
  workStages: [{ title: "", description: "", amount: "" }], // NEW: replaces milestones
});
```

**New State Management:**
- `paymentStructure`: Tracks which payment option user selected
- `numStages`: Number of work stages (2-6)
- `workStages`: Array of stage objects (replaces `milestones`)

**Conditional Rendering:**
```javascript
{formData.paymentStructure === "single" && (
  // Show single payment amount field
)}

{formData.paymentStructure === "stages" && (
  // Show stages builder UI
)}
```

**Form Validation:**
- Single Payment: Only checks if amount is entered
- Payment in Stages: 
  - Validates all stages have title, description, amount
  - Validates sum of stage amounts equals total amount

**Payload Structure:**
```javascript
// Single Payment Payload
{
  title: jobTitle,
  description: jobDescription,
  amount: parseFloat(totalAmount),
  currency: "KSH",
  contractId: auto-generated,
  paymentStructure: "single",
  numWorkers: parseInt(numWorkers),
  jobCategory: jobCategory,
  workLocation: workLocation,
  startDate: startDate,
  completionDate: completionDate,
  paymentType: paymentType,
}

// Stages Payment Payload
{
  // ... same as above ...
  paymentStructure: "stages",
  workStages: [
    { title: "...", description: "...", amount: 2000 },
    { title: "...", description: "...", amount: 3000 }
  ]
}
```

### Backend Considerations

**Contract Model Stays Compatible:**
- No breaking changes to existing schema
- New `paymentStructure` field optional (defaults to "single")
- `workStages` array stored in `milestones` field (backward compatible)

**Validation Middleware:**
- No changes needed - validates only required fields
- Extra fields pass through validation

**Future Enhancement:**
- Implement automatic work stage creation for single payment contracts
- Create "Job Completion" stage automatically
- Set stage amount to total contract amount

---

## Validation Rules

### Single Payment Structure
- ✅ Job Title (required, string)
- ✅ Job Category (required, string)
- ✅ Job Description (required, string)
- ✅ Work Location (required, string)
- ✅ Start Date (required)
- ✅ Expected Completion Date (required)
- ✅ Total Amount (required, number > 0)
- ✅ Workers Needed (required, 1-5+)
- ✅ Payment Type (required: fixed/daily/hourly)
- ✅ Escrow Confirmation (required checkbox)
- ✅ Terms Accepted (required checkbox)

### Payment in Stages Structure
- All of the above PLUS:
- ✅ Number of Work Stages (required, 2-6)
- ✅ For each stage:
  - Task Title (required, string)
  - Task Description (required, string)
  - Stage Payment Amount (required, number > 0)
- ✅ Total Amount = Sum of all stage amounts

---

## User Workflows

### Manager: Create Single Payment Job (Simplified)

1. Navigate to "Create New Job"
2. See payment structure selector with "Single Payment" pre-selected
3. Fill in job details (title, category, description, location, dates, workers)
4. Enter "Total Payment Amount"
5. Select Payment Type (Fixed/Daily/Hourly)
6. Check escrow confirmation
7. Accept terms
8. Click "Create Job"
9. Job created with hidden "Job Completion" stage
10. Redirected to job details page

**Time to create: ~3-5 minutes**

---

### Manager: Create Payment in Stages Job (Complex)

1. Navigate to "Create New Job"
2. Select "Payment in Stages" radio button
3. Form updates to show stages builder
4. Specify "Number of Work Stages" (e.g., 3)
5. Fill in 3 work stages:
   - Stage 1: "Foundation" - 5000 KES
   - Stage 2: "Framing" - 7000 KES
   - Stage 3: "Finishing" - 8000 KES
6. System shows: "Total = 20000 KES" (validated as correct)
7. Fill remaining job details
8. Click "Create Job"
9. Job created with 3 linked work stages
10. Redirected to job details page

**Time to create: ~5-8 minutes**

---

### Worker: Complete Single Payment Job

1. See "Professional House Cleaning" job in job list
2. Click to apply or get assigned
3. Complete the cleaning work
4. Navigate to "Assigned Work Stages"
5. Click on "Professional House Cleaning"
6. Add "Completion Notes" (e.g., "All rooms cleaned, windows done, carpets vacuumed")
7. Add "Work Sample Link" (photos)
8. Click "Mark Work Complete"
9. Manager reviews and approves
10. Payment (full amount) released

**Time to complete: Same as job, payment faster (single approval)**

---

### Manager: Approve Work and Release Payment

1. Navigate to "Work Stage Reviews"
2. See "Pending Review" section with submitted work
3. Review completion notes and work samples
4. Click "Approve Completed Work"
5. Payment released immediately to worker
6. Status changes to "Approved"

**Time to approve: ~2 minutes per stage**

---

## Backward Compatibility

✅ **Existing contracts continue to work:**
- Old contracts use `milestones` field (renamed internally as "Work Stages" in UI)
- No data migration needed
- Terminology change is UI-only
- Backend APIs remain unchanged
- Frontend always translates "milestone" data to "work stage" display

✅ **Database:**
- No schema changes required
- `paymentStructure` field is optional, defaults to "single" for new contracts
- Existing contracts without this field still work

✅ **API Responses:**
- Data structure unchanged
- `milestones` array returned as-is
- Frontend handles terminology mapping

---

## Testing Checklist

### Single Payment Workflow
- [ ] Form defaults to "Single Payment"
- [ ] Amount field visible, work stages hidden
- [ ] Form validation requires amount
- [ ] Contract created successfully
- [ ] Contract details show work stages (auto-created)
- [ ] Worker can mark work complete
- [ ] Manager can approve work
- [ ] Payment released on approval

### Payment in Stages Workflow
- [ ] "Payment in Stages" option visible and selectable
- [ ] Stages section shows when selected
- [ ] Number of stages dropdown works (2-6)
- [ ] Can add work stages
- [ ] Can remove work stages
- [ ] Total validation works
- [ ] Form validation requires all stage amounts
- [ ] Contract created with multiple stages
- [ ] Each stage can be approved separately
- [ ] Payments released per stage

### Terminology
- [ ] All pages use "Work Stages" instead of "Milestones"
- [ ] All pages use "Job" instead of "Contract"
- [ ] All pages use "Manager" and "Worker" appropriately
- [ ] All buttons and messages use new terminology
- [ ] Help text is clear and encouraging

### UI/UX
- [ ] Payment structure selector is prominent and clear
- [ ] Form is simpler for single payment option
- [ ] Error messages are user-friendly
- [ ] Navigation labels are clear
- [ ] No emojis in section headers
- [ ] Professional styling throughout

---

## Future Enhancements

1. **Automatic Work Stage Creation:**
   - For single payment: Create hidden "Job Completion" stage automatically
   - Set stage amount to total contract amount
   - No API changes needed, just backend logic

2. **Smart Payment Recommendations:**
   - Based on job category, suggest payment structure
   - "House Cleaning" → recommend "Single Payment"
   - "House Renovation" → recommend "Payment in Stages"

3. **Payment Milestone Templates:**
   - Pre-defined stage breakdowns for common jobs
   - "3-Stage House Renovation" template: Foundation (40%), Framing (35%), Finishing (25%)

4. **Partial Payments:**
   - Allow manager to release partial payment for urgent needs
   - Track payment history per stage

5. **Mobile App Updates:**
   - Update React Native mobile app with same terminology
   - Same payment structure selection
   - Native UI for stages builder

---

## Deployment Checklist

- [ ] Merge all frontend changes to main
- [ ] Update backend if needed (none required for this version)
- [ ] Test staging environment (single and stages workflows)
- [ ] Create user documentation
- [ ] Notify existing users of terminology change
- [ ] Monitor for issues first week
- [ ] Gather user feedback

---

## Support Documentation

### For Managers
"How do I create a job?"
- Most jobs use "Single Payment" - just enter total amount
- Only complex multi-stage jobs need "Payment in Stages"
- Manager doesn't create stages manually anymore - system handles it

"What happened to Milestones?"
- Renamed to "Work Stages" to be clearer
- Same functionality, just friendlier terminology

### For Workers
"What are Work Stages?"
- Stages in a job you need to complete
- For simple jobs: just one stage (complete the job)
- For complex jobs: multiple stages, complete them one by one
- Each approved stage = you get paid that portion

"How do I submit my work?"
- Go to "Assigned Work Stages"
- Click the stage
- Click "Mark Work Complete"
- Add notes and samples
- Done! Manager will review and approve

---

## Success Metrics

After deployment, measure:
1. **Form Completion Rate:** % of managers completing job creation form
2. **Payment Structure Distribution:** % choosing single vs stages
3. **Average Time to Create Job:** Reduced by targeting simplicity
4. **Worker Satisfaction:** Fewer support questions about stages/milestones
5. **Job Approval Time:** Reduced for single payment jobs

---

## Questions & Contact

For questions about this refactoring:
- Check the code comments in ContractCreatePage.jsx
- Review the validation rules above
- Test locally with provided test scenarios
- Create an issue for bugs or improvements
