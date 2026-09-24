// The claim lifecycle as a "state machine": a fixed list of statuses and the only
// moves allowed between them. Every status change in the app goes through this file,
// so a claim can never jump from "submitted" straight to "disbursed", for example.
//
//   submitted -> under_review -> field_verification -> approved -> disbursed
//        \              \                 \
//         \-> rejected   \-> approved      \-> rejected
//                         \-> rejected
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../constants');

const STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  FIELD_VERIFICATION: 'field_verification',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DISBURSED: 'disbursed',
});

const ALL_STATUSES = Object.values(STATUS);

const TRANSITIONS = Object.freeze({
  [STATUS.SUBMITTED]: [STATUS.UNDER_REVIEW, STATUS.REJECTED],
  [STATUS.UNDER_REVIEW]: [STATUS.FIELD_VERIFICATION, STATUS.APPROVED, STATUS.REJECTED],
  [STATUS.FIELD_VERIFICATION]: [STATUS.APPROVED, STATUS.REJECTED],
  [STATUS.APPROVED]: [STATUS.DISBURSED],
  [STATUS.REJECTED]: [],
  [STATUS.DISBURSED]: [],
});

// Claims still waiting for someone to act on them (used for "overdue" checks and officer workload)
const OPEN_STATUSES = [STATUS.SUBMITTED, STATUS.UNDER_REVIEW, STATUS.FIELD_VERIFICATION, STATUS.APPROVED];

// Only admins can mark money as paid out; officers and admins can do everything else.
function rolesAllowedFor(toStatus) {
  if (toStatus === STATUS.DISBURSED) return [ROLES.ADMIN];
  return [ROLES.OFFICER, ROLES.ADMIN];
}

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/**
 * Checks whether `user` may move `claim` to `to`. Throws an ApiError explaining why not.
 * Does not change the claim.
 */
function assertTransition(claim, to, user, { remark, amountApproved } = {}) {
  if (!ALL_STATUSES.includes(to)) {
    throw ApiError.badRequest(`Unknown status "${to}"`, 'INVALID_STATUS');
  }
  if (!canTransition(claim.status, to)) {
    throw ApiError.badRequest(`A claim that is "${claim.status}" cannot be moved to "${to}"`, 'INVALID_TRANSITION', {
      allowed: TRANSITIONS[claim.status],
    });
  }
  if (!rolesAllowedFor(to).includes(user.role)) {
    throw ApiError.forbidden(`Only ${rolesAllowedFor(to).join(' or ')} can move a claim to "${to}"`);
  }
  if (user.role === ROLES.OFFICER && !(claim.assignedOfficer && claim.assignedOfficer.equals(user._id))) {
    throw ApiError.forbidden('This claim is not assigned to you');
  }
  if (to === STATUS.APPROVED) {
    const amount = Number(amountApproved);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw ApiError.badRequest('Enter the approved amount', 'AMOUNT_REQUIRED');
    }
    if (amount > claim.amountClaimed) {
      throw ApiError.badRequest('Approved amount cannot be more than the amount claimed', 'AMOUNT_TOO_HIGH');
    }
  }
  if (to === STATUS.REJECTED && !(remark && remark.trim())) {
    throw ApiError.badRequest('A reason is required when rejecting a claim', 'REMARK_REQUIRED');
  }
}

/** Validates and then applies the change to the claim document (caller saves it). */
function applyTransition(claim, to, user, { remark, amountApproved } = {}) {
  assertTransition(claim, to, user, { remark, amountApproved });
  const now = new Date();

  claim.statusHistory.push({
    from: claim.status,
    to,
    by: user._id,
    byName: user.name,
    byRole: user.role,
    remark: remark ? remark.trim() : undefined,
    at: now,
  });
  claim.status = to;
  claim.statusChangedAt = now;

  if (to === STATUS.APPROVED) {
    claim.amountApproved = Number(amountApproved);
    claim.decidedAt = now;
  } else if (to === STATUS.REJECTED) {
    claim.decidedAt = now;
  } else if (to === STATUS.DISBURSED) {
    claim.disbursedAt = now;
  }
  return claim;
}

module.exports = {
  STATUS,
  ALL_STATUSES,
  TRANSITIONS,
  OPEN_STATUSES,
  canTransition,
  assertTransition,
  applyTransition,
  rolesAllowedFor,
};
