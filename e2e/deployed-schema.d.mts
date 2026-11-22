export const DEPLOYED: Record<string, Record<string, string>>;
export function schemaRefusal(record: { recordType?: string; fields?: Record<string, { value: unknown; type?: string }> }): string | null;
