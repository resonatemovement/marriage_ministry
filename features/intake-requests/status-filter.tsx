"use client";

import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { INTAKE_STATUS_LABEL, intakeStatusesForView, isIntakeRequestStatus, type IntakeRequestView } from "./model";

const ALL_STATUSES_VALUE = "all_statuses";
export function IntakeStatusFilter({ status, view }: { status?: string; view: IntakeRequestView }) {
  const statuses = intakeStatusesForView(view);
  const [selectedStatus, setSelectedStatus] = useState(isIntakeRequestStatus(status ?? "") && statuses.includes(status as typeof statuses[number]) ? status : ALL_STATUSES_VALUE);

  return <><input type="hidden" name="status" value={selectedStatus === ALL_STATUSES_VALUE ? "" : selectedStatus} /><label id="intake-status-filter-label" className="sr-only" htmlFor="intake-status-filter">Status</label><Select value={selectedStatus} onValueChange={setSelectedStatus}><SelectTrigger id="intake-status-filter" aria-labelledby="intake-status-filter-label" className="min-w-0 sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL_STATUSES_VALUE}>All statuses</SelectItem>{statuses.map((value) => <SelectItem key={value} value={value}>{INTAKE_STATUS_LABEL[value]}</SelectItem>)}</SelectContent></Select></>;
}
