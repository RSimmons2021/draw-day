/**
 * Money in $K, with the sign outside the currency symbol.
 *
 * Capital preserved goes negative when the facility is overdrawn, and `$-65K` reads
 * like a typo where `-$65K` reads like an overdraw.
 */
export function money(thousands: number): string {
  const rounded = Math.round(thousands);
  const sign = rounded < 0 ? '-' : '';
  const magnitude = Math.abs(rounded);
  return magnitude >= 1000
    ? `${sign}$${(magnitude / 1000).toFixed(2)}M`
    : `${sign}$${magnitude}K`;
}
