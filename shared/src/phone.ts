/** Country code assumed for numbers saved without one (the hospital is in Lebanon). */
export const DEFAULT_COUNTRY_CODE = '961';

/** WhatsApp chat link (wa.me wants the full international number, digits only). */
export function whatsappHref(phone: string, countryCode = DEFAULT_COUNTRY_CODE): string {
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) {
    // already international
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = countryCode + digits.slice(1);
  } else if (!digits.startsWith(countryCode) || digits.length <= 8) {
    digits = countryCode + digits;
  }
  return `https://wa.me/${digits}`;
}
