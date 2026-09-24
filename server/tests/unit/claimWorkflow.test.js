const mongoose = require('mongoose');
const { STATUS, canTransition, assertTransition, applyTransition } = require('../../src/services/claimWorkflow');

const officerId = new mongoose.Types.ObjectId();
const officer = { _id: officerId, role: 'officer', name: 'Officer' };
const otherOfficer = { _id: new mongoose.Types.ObjectId(), role: 'officer', name: 'Other' };
const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin', name: 'Admin' };
const farmer = { _id: new mongoose.Types.ObjectId(), role: 'farmer', name: 'Farmer' };

function makeClaim(status = STATUS.SUBMITTED) {
  return { status, amountClaimed: 10000, assignedOfficer: officerId, statusHistory: [] };
}

describe('canTransition', () => {
  test('allows the normal happy path', () => {
    expect(canTransition('submitted', 'under_review')).toBe(true);
    expect(canTransition('under_review', 'field_verification')).toBe(true);
    expect(canTransition('field_verification', 'approved')).toBe(true);
    expect(canTransition('approved', 'disbursed')).toBe(true);
  });

  test('blocks skipping steps and leaving final states', () => {
    expect(canTransition('submitted', 'approved')).toBe(false);
    expect(canTransition('submitted', 'disbursed')).toBe(false);
    expect(canTransition('rejected', 'approved')).toBe(false);
    expect(canTransition('disbursed', 'rejected')).toBe(false);
  });
});

describe('assertTransition', () => {
  test('farmers cannot change status', () => {
    expect(() => assertTransition(makeClaim(), 'under_review', farmer)).toThrow(/Only officer or admin/);
  });

  test('officers can only act on claims assigned to them', () => {
    expect(() => assertTransition(makeClaim(), 'under_review', otherOfficer)).toThrow(/not assigned to you/);
    expect(() => assertTransition(makeClaim(), 'under_review', officer)).not.toThrow();
  });

  test('only admins can disburse', () => {
    expect(() => assertTransition(makeClaim('approved'), 'disbursed', officer)).toThrow(/Only admin/);
    expect(() => assertTransition(makeClaim('approved'), 'disbursed', admin)).not.toThrow();
  });

  test('approval needs a valid amount no higher than the claim', () => {
    const claim = makeClaim('under_review');
    expect(() => assertTransition(claim, 'approved', officer, {})).toThrow(/approved amount/);
    expect(() => assertTransition(claim, 'approved', officer, { amountApproved: 20000 })).toThrow(/cannot be more/);
    expect(() => assertTransition(claim, 'approved', officer, { amountApproved: 8000 })).not.toThrow();
  });

  test('rejection needs a reason', () => {
    expect(() => assertTransition(makeClaim(), 'rejected', officer, {})).toThrow(/reason is required/);
    expect(() => assertTransition(makeClaim(), 'rejected', officer, { remark: 'Duplicate claim' })).not.toThrow();
  });

  test('unknown status is rejected', () => {
    expect(() => assertTransition(makeClaim(), 'paid', admin)).toThrow(/Unknown status/);
  });
});

describe('applyTransition', () => {
  test('updates status, timestamps and history', () => {
    const claim = makeClaim('under_review');
    applyTransition(claim, 'approved', officer, { amountApproved: 9000, remark: ' Verified ' });

    expect(claim.status).toBe('approved');
    expect(claim.amountApproved).toBe(9000);
    expect(claim.decidedAt).toBeInstanceOf(Date);
    expect(claim.statusHistory).toHaveLength(1);
    expect(claim.statusHistory[0]).toMatchObject({ from: 'under_review', to: 'approved', byRole: 'officer', remark: 'Verified' });
  });

  test('does not change the claim when the move is invalid', () => {
    const claim = makeClaim('submitted');
    expect(() => applyTransition(claim, 'disbursed', admin)).toThrow();
    expect(claim.status).toBe('submitted');
    expect(claim.statusHistory).toHaveLength(0);
  });
});
