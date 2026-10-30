"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";

import { cn } from "@/lib/utils";

function Calendar({ className, classNames, showOutsideDays = true, components, ...props }: DayPickerProps) {
  return <DayPicker showOutsideDays={showOutsideDays} navLayout="around" className={cn("p-3", className)} classNames={{
    root: "w-full",
    months: "flex flex-col",
    month: "relative space-y-3",
    month_caption: "relative mx-10 flex h-9 items-center justify-center",
    caption_label: "text-sm font-semibold",
    button_previous: "absolute left-0 top-0 z-10 grid size-10 place-items-center rounded-sm text-text-muted hover:bg-surface-muted hover:text-text-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent focus-visible:bg-surface-muted focus-visible:text-text-primary",
    button_next: "absolute right-0 top-0 z-10 grid size-10 place-items-center rounded-sm text-text-muted hover:bg-surface-muted hover:text-text-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent focus-visible:bg-surface-muted focus-visible:text-text-primary",
    month_grid: "w-full border-collapse",
    weekdays: "border-b border-border",
    weekday: "h-8 w-9 text-center text-xs font-medium text-text-muted",
    week: "",
    day: "size-9 p-0 text-center",
    day_button: "grid size-9 place-items-center rounded-sm text-sm font-medium transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
    selected: "[&>button]:bg-brand-primary [&>button]:text-white [&>button:hover]:bg-brand-primary",
    today: "[&>button]:font-bold [&>button]:text-brand-primary",
    outside: "text-text-muted opacity-50",
    disabled: "text-text-muted opacity-40",
    ...classNames,
  }} components={{
    Chevron: ({ orientation, className: chevronClassName, ...chevronProps }) => orientation === "left" ? <ChevronLeft className={cn("size-4", chevronClassName)} {...chevronProps} /> : <ChevronRight className={cn("size-4", chevronClassName)} {...chevronProps} />,
    ...components,
  }} {...props} />;
}

export { Calendar };
