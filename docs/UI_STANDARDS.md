# UI Action Standards

Use these standards for new or materially changed application UI. They do not require a broad restyling pass; application-wide remediation is deferred to UI-02.

## Action hierarchy

- Use primary filled buttons to advance a workflow, such as Begin/Continue Assessment, Open current Session, or Save Changes.
- Use a secondary outlined button for supporting actions.
- Use styled text links to navigate to existing information, such as View Results, View History, View Intake Request, or View completed Session.
- Informational text links do not have trailing arrows. Forward workflow actions may use an arrow to indicate progression.
- Use icon buttons for compact utilities, with an accessible name and visible keyboard focus.
- Put contextual secondary actions in an ellipsis menu when a compact action group is appropriate.
- Use destructive styling only for destructive operations and make the consequence clear.
- Prefer one primary action per card; make additional actions secondary or navigational.
- Buttons should be content-width by default. Use full width only when the layout or task benefits from it.

## Card spacing

- Use `p-5` (20px) at mobile and desktop widths for comparable summary cards, matching the Couple Workspace Homework, Next Meeting, and Counseling Progress cards.
- Keep spacing between content within a card and gaps between cards appropriate to the content; card padding does not replace either.
- Avoid duplicate padding on a card and a nested wrapper. Split headers, tiles, detailed result panels, dialogs, and specialized forms may retain their own layout spacing.

## Consistency and semantics

- Reuse existing Resonate components, tokens, and established classes for sizing, padding, typography, border radius, hover, disabled, and focus states.
- Keep focus visible without decorative button outlines/rings; preserve form-field focus treatment.
- Use semantic links for navigation and buttons for operations. Do not use clickable non-interactive elements as substitutes.
- Preserve accessible labels, keyboard behavior, validation feedback, and responsive behavior.
- Keep existing validation and authorization authoritative; visual action state does not replace server-side checks.
