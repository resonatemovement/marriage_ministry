import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  id: 0,
  ref: { current: null as { formatted: string; digits: string } | null },
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return {
    ...react,
    useId: () => `time-input-${++hooks.id}`,
    useRef: () => hooks.ref,
  };
});

vi.mock("@/components/ui/input", () => ({ Input: "input" }));
vi.mock("@/components/ui/select", () => ({
  Select: "select",
  SelectContent: "select-content",
  SelectItem: "select-item",
  SelectTrigger: "select-trigger",
  SelectValue: "select-value",
}));

import { TimeInput } from "./time-input";

function inputProps(value: string, onChange: (next: string) => void, error: string | null = null) {
  const tree = TimeInput({
    value,
    period: "PM",
    onChange,
    onPeriodChange: () => undefined,
    error,
  });
  const input = tree.props.children[1].props.children[0];
  return input.props as {
    value: string;
    onChange: (event: { currentTarget: { value: string; selectionStart: number }; nativeEvent: { inputType: string } }) => void;
  };
}

function typeCharacter(value: string, character: string, onChange: (next: string) => void, inputType = "insertText") {
  const props = inputProps(value, onChange);
  const nextValue = `${value}${character}`;
  props.onChange({
    currentTarget: { value: nextValue, selectionStart: nextValue.length },
    nativeEvent: { inputType },
  });
}

function typeDigits(digits: string) {
  let value = "";
  for (const character of digits) {
    typeCharacter(value, character, (next) => { value = next; });
  }
  return { value, props: inputProps(value, () => undefined) };
}

describe("shared TimeInput live formatting", () => {
  beforeEach(() => {
    hooks.id = 0;
    hooks.ref.current = null;
  });

  it("inserts the colon as the third digit is typed", () => {
    let value = "";
    typeCharacter(value, "3", (next) => { value = next; });
    expect(value).toBe("3");
    typeCharacter(value, "0", (next) => { value = next; });
    expect(value).toBe("30");
    typeCharacter(value, "0", (next) => { value = next; });
    expect(value).toBe("3:00");
    expect(inputProps(value, () => undefined).value).toBe("3:00");
  });

  it.each([
    ["930", "9:30"],
    ["0300", "03:00"],
    ["1230", "12:30"],
  ])("formats %s as %s while typing", (digits, expected) => {
    expect(typeDigits(digits).props.value).toBe(expected);
  });

  it("recognizes four-digit continuation when the browser omits inputType", () => {
    let value = "";
    for (const character of "0300") {
      typeCharacter(value, character, (next) => { value = next; }, "");
    }
    expect(value).toBe("03:00");
  });

  it("keeps deletion and mid-field editing usable", () => {
    let value = typeDigits("300").value;
    const props = inputProps(value, (next) => { value = next; });
    props.onChange({
      currentTarget: { value: "3:0", selectionStart: 3 },
      nativeEvent: { inputType: "deleteContentBackward" },
    });
    expect(value).toBe("3:0");
    const editedProps = inputProps(value, (next) => { value = next; });
    editedProps.onChange({
      currentTarget: { value: "3:50", selectionStart: 3 },
      nativeEvent: { inputType: "insertText" },
    });
    expect(value).toBe("3:50");
    expect(inputProps(value, () => undefined).value).toBe("3:50");
  });

  it("leaves partial entry alone without displaying a validation error", () => {
    let value = "";
    const error: string | null = null;
    const update = (next: string) => { value = next; };
    typeCharacter(value, "3", update);
    expect(inputProps(value, update, error).value).toBe("3");
    typeCharacter(value, "0", update);
    expect(inputProps(value, update, error).value).toBe("30");
    expect(error).toBeNull();
  });
});
