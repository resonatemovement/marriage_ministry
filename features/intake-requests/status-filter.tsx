"use client";

import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { INTAKE_STATUS_LABEL, isIntakeRequestStatus } from "./model";

const ALL_STATUSES_VALUE = "all_statuses";
const FILTER_STATUSES = ["ready_for_review", "under_review", "invited", "closed"] as const;

export function IntakeStatusFilter({ status }: { status?: string }) {
  const [selectedStatus, setSelectedStatus] = useState(isIntakeRequestStatus(status ?? "") ? status : ALL_STATUSES_VALUE);

  return <><input type="hidden" name="status" value={selectedStatus === ALL_STATUSES_VALUE ? "" : selectedStatus} /><label id="intake-status-filter-label" className="sr-only" htmlFor="intake-status-filter">Status</label><Select value={selectedStatus} onValueChange={setSelectedStatus}><SelectTrigger id="intake-status-filter" aria-labelledby="intake-status-filter-label" className="min-w-0 sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL_STATUSES_VALUE}>All statuses</SelectItem>{FILTER_STATUSES.map((value) => <SelectItem key={value} value={value}>{INTAKE_STATUS_LABEL[value]}</SelectItem>)}</SelectContent></Select></>;
}
