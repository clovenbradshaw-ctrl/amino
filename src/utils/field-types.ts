/** Airtable field types and their display/edit properties */

export type FieldType =
  | 'singleLineText'
  | 'multilineText'
  | 'richText'
  | 'number'
  | 'percent'
  | 'currency'
  | 'email'
  | 'url'
  | 'phoneNumber'
  | 'singleSelect'
  | 'multipleSelects'
  | 'checkbox'
  | 'date'
  | 'dateTime'
  | 'duration'
  | 'rating'
  | 'barcode'
  | 'multipleRecordLinks'
  | 'multipleAttachments'
  | 'multipleLookupValues'
  | 'rollup'
  | 'formula'
  | 'count'
  | 'autoNumber'
  | 'createdTime'
  | 'lastModifiedTime'
  | 'createdBy'
  | 'lastModifiedBy'
  | 'button'
  | 'externalSyncSource';

export interface FieldDef {
  fieldId: string;
  tableId: string;
  fieldName: string;
  fieldType: FieldType;
  isComputed: boolean;
  isExcluded: boolean;
  options: Record<string, any>;
}

export interface SelectOption {
  id: string;
  name: string;
  color?: string;
}

export const COMPUTED_TYPES: FieldType[] = [
  'formula', 'rollup', 'multipleLookupValues', 'count',
  'autoNumber', 'createdTime', 'lastModifiedTime',
  'createdBy', 'lastModifiedBy',
];

export const TEXT_TYPES: FieldType[] = [
  'singleLineText', 'multilineText', 'richText',
  'email', 'url', 'phoneNumber', 'barcode',
];

export const NUMERIC_TYPES: FieldType[] = [
  'number', 'percent', 'currency', 'rating', 'duration', 'count', 'autoNumber',
];

export const DATE_TYPES: FieldType[] = [
  'date', 'dateTime', 'createdTime', 'lastModifiedTime',
];

export function isComputed(type: FieldType): boolean {
  return COMPUTED_TYPES.includes(type);
}

export function isEditable(type: FieldType): boolean {
  return !isComputed(type) && type !== 'multipleAttachments' && type !== 'button';
}

export function getFieldIcon(type: FieldType): string {
  const icons: Record<string, string> = {
    singleLineText: 'Aa',
    multilineText: '¶',
    richText: '¶*',
    number: '#',
    percent: '%',
    currency: '$',
    email: '@',
    url: '🔗',
    phoneNumber: '☎',
    singleSelect: '▾',
    multipleSelects: '▾▾',
    checkbox: '☑',
    date: '📅',
    dateTime: '📅⏰',
    duration: '⏱',
    rating: '★',
    barcode: '|||',
    multipleRecordLinks: '↗',
    multipleAttachments: '📎',
    multipleLookupValues: '↗?',
    rollup: 'Σ',
    formula: 'ƒx',
    count: '#N',
    autoNumber: '#A',
    createdTime: '🕐+',
    lastModifiedTime: '🕐~',
    createdBy: '👤+',
    lastModifiedBy: '👤~',
    button: '▶',
    externalSyncSource: '⟳',
  };
  return icons[type] || '?';
}

export function formatCellValue(value: any, type: FieldType): string {
  if (value === null || value === undefined) return '';

  switch (type) {
    case 'checkbox':
      return value ? '✓' : '';
    case 'percent':
      return typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : String(value);
    case 'currency':
      return typeof value === 'number' ? `$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : String(value);
    case 'rating':
      return typeof value === 'number' ? '★'.repeat(value) : String(value);
    case 'date':
    case 'dateTime':
    case 'createdTime':
    case 'lastModifiedTime':
      if (typeof value === 'string') {
        try {
          const d = new Date(value);
          return type === 'date' ? d.toLocaleDateString() : d.toLocaleString();
        } catch { return value; }
      }
      return String(value);
    case 'multipleSelects':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'multipleRecordLinks':
      if (Array.isArray(value)) return `${value.length} linked record${value.length !== 1 ? 's' : ''}`;
      return String(value);
    case 'multipleAttachments':
      if (Array.isArray(value)) return `${value.length} attachment${value.length !== 1 ? 's' : ''}`;
      return String(value);
    default:
      if (Array.isArray(value)) return value.join(', ');
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
  }
}
