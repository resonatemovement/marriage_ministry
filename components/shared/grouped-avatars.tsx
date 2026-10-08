import Image from "next/image";
import { UserRound } from "lucide-react";

import { cn } from "@/lib/utils";

export type GroupedAvatarPerson = {
  id: string;
  name: string;
  photoUrl: string | null;
};

export function GroupedAvatars({
  people,
  label,
  className,
}: {
  people: readonly (GroupedAvatarPerson | null)[];
  label: string;
  className?: string;
}) {
  const grouped = people.length > 1;

  return <div className={cn("flex", grouped && "-space-x-3", className)} aria-label={label}>
    {people.map((person, index) => <span
      key={person?.id ?? `missing-${index}`}
      className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white bg-sidebar-accent text-sidebar-active"
      style={{ zIndex: index + 1 }}
    >
      {person?.photoUrl
        ? <Image src={person.photoUrl} alt={`${person.name} profile`} width={64} height={64} unoptimized className="size-full object-cover" />
        : <span aria-label={person ? `${person.name} profile placeholder` : `Person ${index + 1} profile placeholder`}><UserRound className="size-7" aria-hidden="true" /></span>}
    </span>)}
  </div>;
}
