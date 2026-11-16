export type SideBySideResponseSide = "left" | "right";

export type SideBySideResponseConfig = {
  groupId: string;
  side: SideBySideResponseSide;
  instructions: string;
  leftHeading: string;
  rightHeading: string;
  bothRequired: boolean;
};

export type SideBySideResponseIds = {
  left: { snapshotId: string; homeworkBlockId: string };
  right: { snapshotId: string; homeworkBlockId: string };
};

export type SideBySideRow = { id: string; type: string; position: number; description?: string | null };
export type GroupedSideBySideRows<T extends SideBySideRow> =
  | { kind: "single"; row: T }
  | { kind: "pair"; config: Omit<SideBySideResponseConfig, "side">; left: T; right: T };

export function parseSideBySideResponseMetadata(value: string | null | undefined): SideBySideResponseConfig | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const metadata = parsed as Record<string, unknown>;
    if (metadata.kind !== "side_by_side_response"
      || typeof metadata.groupId !== "string" || !metadata.groupId
      || (metadata.side !== "left" && metadata.side !== "right")
      || typeof metadata.instructions !== "string"
      || typeof metadata.leftHeading !== "string"
      || typeof metadata.rightHeading !== "string"
      || typeof metadata.bothRequired !== "boolean") return null;
    return {
      groupId: metadata.groupId,
      side: metadata.side,
      instructions: metadata.instructions,
      leftHeading: metadata.leftHeading,
      rightHeading: metadata.rightHeading,
      bothRequired: metadata.bothRequired,
    };
  } catch {
    return null;
  }
}

export function sideBySideResponseMetadata(config: SideBySideResponseConfig) {
  return JSON.stringify({ kind: "side_by_side_response", ...config });
}

export function sideBySideColumnHeading(config: SideBySideResponseConfig, side: SideBySideResponseSide) {
  return side === "left" ? config.leftHeading : config.rightHeading;
}

export function groupSideBySideRows<T extends SideBySideRow>(rows: T[]): GroupedSideBySideRows<T>[] {
  const consumed = new Set<string>();
  const groups: GroupedSideBySideRows<T>[] = [];
  for (const row of rows) {
    if (consumed.has(row.id)) continue;
    const metadata = parseSideBySideResponseMetadata(row.description);
    if (row.type !== "long_answer" || !metadata) {
      consumed.add(row.id);
      groups.push({ kind: "single", row });
      continue;
    }
    const matching = rows.flatMap((candidate) => {
      const candidateMetadata = parseSideBySideResponseMetadata(candidate.description);
      return candidate.type === "long_answer" && candidateMetadata?.groupId === metadata.groupId
        ? [{ row: candidate, metadata: candidateMetadata }]
        : [];
    });
    const left = matching.find(({ metadata: candidate }) => candidate.side === "left");
    const right = matching.find(({ metadata: candidate }) => candidate.side === "right");
    const sameConfig = left && right
      && left.metadata.instructions === right.metadata.instructions
      && left.metadata.leftHeading === right.metadata.leftHeading
      && left.metadata.rightHeading === right.metadata.rightHeading
      && left.metadata.bothRequired === right.metadata.bothRequired;
    if (!left || !right || !sameConfig) {
      consumed.add(row.id);
      groups.push({ kind: "single", row });
      continue;
    }
    consumed.add(left.row.id);
    consumed.add(right.row.id);
    groups.push({ kind: "pair", config: {
      groupId: metadata.groupId,
      instructions: metadata.instructions,
      leftHeading: metadata.leftHeading,
      rightHeading: metadata.rightHeading,
      bothRequired: metadata.bothRequired,
    }, left: left.row, right: right.row });
  }
  return groups;
}
