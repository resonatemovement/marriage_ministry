export type SideBySideResponseSide = "left" | "right";

export type SideBySideResponseConfig = {
  groupId: string;
  side: SideBySideResponseSide;
  instructions: string;
  leftHeading: string;
  rightHeading: string;
  bothRequired: boolean;
  responseMode?: "paired_rows_v1";
};

export type SideBySideAnswerRow = { id: string; left: string; right: string };
export type SideBySideAnswerColumn = { id: string; value: string };

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
    const metadataKeys = Object.keys(metadata);
    if ((metadataKeys.length !== 7 && metadataKeys.length !== 8)
      || metadataKeys.some((key) => !["kind", "groupId", "side", "instructions", "leftHeading", "rightHeading", "bothRequired", "responseMode"].includes(key))
      || metadata.kind !== "side_by_side_response"
      || typeof metadata.groupId !== "string" || !metadata.groupId
      || (metadata.side !== "left" && metadata.side !== "right")
      || typeof metadata.instructions !== "string"
      || typeof metadata.leftHeading !== "string"
      || typeof metadata.rightHeading !== "string"
      || typeof metadata.bothRequired !== "boolean") return null;
    if (metadata.responseMode !== undefined && metadata.responseMode !== "paired_rows_v1") return null;
    return {
      groupId: metadata.groupId,
      side: metadata.side,
      instructions: metadata.instructions,
      leftHeading: metadata.leftHeading,
      rightHeading: metadata.rightHeading,
      bothRequired: metadata.bothRequired,
      ...(metadata.responseMode === "paired_rows_v1" ? { responseMode: "paired_rows_v1" as const } : {}),
    };
  } catch {
    return null;
  }
}

export function sideBySideResponseMetadata(config: SideBySideResponseConfig) {
  return JSON.stringify({ kind: "side_by_side_response", ...config });
}

export function parseSideBySideAnswerColumn(value: string | null | undefined): SideBySideAnswerColumn[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || Object.keys(record).some((key) => key !== "version" && key !== "rows")
      || record.version !== 1 || !Array.isArray(record.rows)) return null;
    const rows: SideBySideAnswerColumn[] = [];
    const ids = new Set<string>();
    for (const candidate of record.rows) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
      const row = candidate as Record<string, unknown>;
      if (Object.keys(row).length !== 2 || Object.keys(row).some((key) => key !== "id" && key !== "value")
        || typeof row.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id)
        || typeof row.value !== "string" || ids.has(row.id)) return null;
      ids.add(row.id);
      rows.push({ id: row.id, value: row.value });
    }
    return rows;
  } catch {
    return null;
  }
}

export function sideBySideAnswerColumn(rows: SideBySideAnswerRow[], side: SideBySideResponseSide) {
  return JSON.stringify({ version: 1, rows: rows.map(({ id, left, right }) => ({ id, value: side === "left" ? left : right })) });
}

export function sideBySideAnswerRows(leftValue: string | null | undefined, rightValue: string | null | undefined, legacyId: string): SideBySideAnswerRow[] {
  const left = parseSideBySideAnswerColumn(leftValue);
  const right = parseSideBySideAnswerColumn(rightValue);
  const leftIsMalformedPayload = Boolean(leftValue?.trim().startsWith("{") && !left);
  const rightIsMalformedPayload = Boolean(rightValue?.trim().startsWith("{") && !right);
  if (leftIsMalformedPayload || rightIsMalformedPayload) {
    return [{ id: legacyId, left: leftValue ?? "", right: rightValue ?? "" }];
  }
  if (!left && !right) return [{ id: legacyId, left: leftValue ?? "", right: rightValue ?? "" }];
  const ids = [...new Set([...(left ?? []).map(({ id }) => id), ...(right ?? []).map(({ id }) => id)])];
  return ids.map((id) => ({ id, left: left?.find((row) => row.id === id)?.value ?? "", right: right?.find((row) => row.id === id)?.value ?? "" }));
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
      && left.metadata.bothRequired === right.metadata.bothRequired
      && left.metadata.responseMode === right.metadata.responseMode;
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
      ...(metadata.responseMode ? { responseMode: metadata.responseMode } : {}),
    }, left: left.row, right: right.row });
  }
  return groups;
}
