export type PersonDetailData = {
  id: string;
  name: string;
  type: string;
  externalId: string | null;
  description: string | null;
  attrs: Record<string, string>;
  relations: Array<{
    type: string;
    strength: number | null;
    targetId: string;
    targetName: string;
    targetType: string;
  }>;
  interactions: Array<{
    channel: string;
    direction: string;
    summary: string | null;
    occurredAt: string;
  }>;
};

export type Interaction = PersonDetailData["interactions"][number];

export function parseAliases(raw: string): string[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [raw];
  }
}

// "relationship_to_team" → "Relationship to team"
export function formatKey(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Strip storage format prefixes from channel values: "e164:+41790000000" → "+41790000000"
export function formatChannelValue(value: string): string {
  return value.replace(/^e164:/, "");
}
