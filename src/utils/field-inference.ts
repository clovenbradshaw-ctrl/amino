import type { FieldType } from './field-types';

/**
 * Infer an Airtable field type from a field name and sample value.
 * Used as a fallback when the /amino-fields endpoint is unavailable,
 * matching the prototype behavior of treating fields as opaque JSON.
 */
export function inferFieldType(fieldName: string, value: any): FieldType {
  if (value == null) return 'singleLineText';

  const nameLower = fieldName.toLowerCase();

  // Check name-based hints first
  if (nameLower === 'email' || nameLower.endsWith('_email') || nameLower.endsWith('email'))
    if (typeof value === 'string' && value.includes('@')) return 'email';

  if (nameLower === 'url' || nameLower === 'website' || nameLower === 'link')
    if (typeof value === 'string' && /^https?:\/\//.test(value)) return 'url';

  if (nameLower === 'phone' || nameLower.includes('phone'))
    if (typeof value === 'string') return 'phoneNumber';

  // Value-based inference
  if (typeof value === 'boolean') return 'checkbox';

  if (typeof value === 'number') {
    if (Number.isInteger(value) && nameLower.includes('rating') && value >= 0 && value <= 5)
      return 'rating';
    if (nameLower.includes('percent'))
      return 'percent';
    if (nameLower.includes('price') || nameLower.includes('cost') || nameLower.includes('amount'))
      return 'currency';
    return 'number';
  }

  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'string' && value[0].startsWith('rec'))
      return 'multipleRecordLinks';
    if (value.length > 0 && typeof value[0] === 'object' && value[0]?.url)
      return 'multipleAttachments';
    return 'multipleSelects';
  }

  if (typeof value === 'string') {
    // ISO date detection
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      if (nameLower.includes('created')) return 'createdTime';
      if (nameLower.includes('modified') || nameLower.includes('updated')) return 'lastModifiedTime';
      return 'dateTime';
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';

    if (value.includes('\n')) return 'multilineText';

    return 'singleLineText';
  }

  return 'singleLineText';
}
