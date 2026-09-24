const { normalizeIndianPhone, maskPhone } = require('../../src/utils/phone');

describe('normalizeIndianPhone', () => {
  test.each([
    ['9876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['98765-43210', '+919876543210'],
    ['6000000000', '+916000000000'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });

  test.each([['12345'], ['5876543210'], ['98765432101234'], [''], [null], [{ $ne: null }]])('rejects %p', (input) => {
    expect(normalizeIndianPhone(input)).toBeNull();
  });
});

test('maskPhone hides all but the last 4 digits', () => {
  expect(maskPhone('+919876543210')).toBe('+91 ******3210');
});
