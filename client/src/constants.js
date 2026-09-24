// Lists shared by many pages. Labels come from the translation files (en.json / hi.json).

export const STATUSES = ['submitted', 'under_review', 'field_verification', 'approved', 'rejected', 'disbursed'];

export const CAUSES = [
  'drought',
  'flood',
  'excess_rain',
  'hailstorm',
  'cyclone',
  'heatwave',
  'frost',
  'pest_attack',
  'fire',
  'other',
];

export const SEASONS = ['kharif', 'rabi', 'zaid'];

export const VERDICTS = ['consistent', 'inconclusive', 'inconsistent', 'not_applicable'];

// Next statuses an officer/admin can pick - must match server/src/services/claimWorkflow.js
export const NEXT_STATUSES = {
  submitted: ['under_review', 'rejected'],
  under_review: ['field_verification', 'approved', 'rejected'],
  field_verification: ['approved', 'rejected'],
  approved: ['disbursed'],
  rejected: [],
  disbursed: [],
};

export const STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];
