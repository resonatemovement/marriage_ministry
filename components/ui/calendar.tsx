"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";

import { cn } from "@/lib/utils";

function Calendar({ className, classNames, showOutsideDays = true, components, ...props }: DayPickerProps) {
  return <DayPicker showOutsideDays={showOutsideDays} className={cn("p-3", className)} classNames={{
    root: "w-full",
    months: "flex flex-col",
    month: "space-y-3",
    month_caption: "relative flex h-9 items-center justify-center",
    caption_label: "text-sm font-semibold",
    nav: "absolute inset-x-0 top-0 flex items-center justify-between",
    button_previous: "grid size-8 place-items-center rounded-sm text-text-muted hover:bg-surface-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
    button_next: "grid size-8 place-items-center rounded-sm text-text-muted hover:bg-surface-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
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
