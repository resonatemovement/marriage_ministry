"use client";
import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";
function Tabs(props: React.ComponentProps<typeof TabsPrimitive.Root>) { return <TabsPrimitive.Root {...props} />; }
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) { return <TabsPrimitive.List className={cn("inline-flex h-10 items-center rounded-md bg-surface-muted p-1", className)} {...props} />; }
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) { return <TabsPrimitive.Trigger className={cn("rounded-sm px-3 py-1.5 text-sm text-text-muted outline-none data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-text-primary", className)} {...props} />; }
function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) { return <TabsPrimitive.Content className={cn("mt-4 outline-none data-[state=inactive]:hidden", className)} {...props} />; }
export { Tabs, TabsContent, TabsList, TabsTrigger };
