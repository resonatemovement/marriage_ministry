import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dialogSource = readFileSync(join(process.cwd(), "features/session-builder/move-to-session-dialog.tsx"), "utf8");
const homeworkSource = readFileSync(join(process.cwd(), "features/homework/homework-builder-content.tsx"), "utf8");
const materialSource = readFileSync(join(process.cwd(), "features/session-builder/session-material-editor.tsx"), "utf8");

function menuContent(source: string, startAt: number) {
  const start = source.indexOf("<DropdownMenuContent align=\"end\">", startAt);
  const end = source.indexOf("</DropdownMenuContent>", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Move to Session dialog mounting", () => {
  it("keeps the menu action small and mounts the dialog outside the dismissing dropdown", () => {
    expect(dialogSource).toContain("export function MoveToSessionMenuItem({ onOpen }");
    expect(dialogSource).toContain("<DropdownMenuItem onSelect={onOpen}>Move to Session</DropdownMenuItem>");
    expect(dialogSource).not.toMatch(/function MoveToSessionMenuItem[\s\S]*?<MoveToSessionDialog/);

    const homeworkMenu = menuContent(homeworkSource, homeworkSource.indexOf("Homework page actions"));
    expect(homeworkMenu).toContain("<MoveToSessionMenuItem onOpen={() =>");
    expect(homeworkMenu).not.toContain("<MoveToSessionDialog");
    expect(homeworkSource.indexOf("<MoveToSessionDialog key={movePageDialogKey}")).toBeGreaterThan(
      homeworkSource.indexOf("</DropdownMenuContent></DropdownMenu>", homeworkSource.indexOf("Homework page actions")),
    );

    const materialMenu = menuContent(materialSource, materialSource.indexOf("Material actions"));
    expect(materialMenu).toContain("<MoveToSessionMenuItem onOpen={() =>");
    expect(materialMenu).not.toContain("<MoveToSessionDialog");
    expect(materialSource.indexOf("<MoveToSessionDialog key={moveDialogKey}")).toBeGreaterThan(
      materialSource.indexOf("</DropdownMenuContent></DropdownMenu>", materialSource.indexOf("Material actions")),
    );
  });

  it("shows the Homework Page context and only moves after the explicit confirmation action", () => {
    expect(dialogSource).toContain('"Move Homework Page"');
    expect(dialogSource).toContain("All questions and content blocks move together.");
    expect(dialogSource).toContain("<span className=\"font-semibold\">From:</span> Session");
    expect(dialogSource).toContain('{isHomeworkPage ? "Homework Page" : "Item"}');
    expect(dialogSource).toContain("Destination Session");
    expect(dialogSource).toContain("session.id !== sourceSession.id");
    expect(dialogSource).toContain("disabled={!canMove}");
    expect(dialogSource).toContain("isHomeworkPage ? \"Move Page\" : \"Move\"");
    expect(dialogSource).toContain("onClick={move}");
    expect(dialogSource).toContain("Cancel</Dialog.Close>");
    expect(dialogSource).toContain("moveStarted.current || success");
  });

  it("retains visible feedback for unsaved state and Sessions without an eligible destination", () => {
    expect(dialogSource).toContain("Save or discard source edits before moving this item.");
    expect(dialogSource).toContain("No other eligible Sessions are available.");
    expect(dialogSource).toContain("No other Draft Sessions are available.");
    expect(dialogSource).toContain("sourceIsReady");
  });
});
