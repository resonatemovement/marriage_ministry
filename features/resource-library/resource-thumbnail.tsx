import type { ReactNode } from "react";
import Image from "next/image";
import { FileAudio, FileImage, FileText, FileVideo } from "lucide-react";

import type { ResourceLibraryItem } from "./presentation";

export function ResourceTypeIcon({ category, className = "size-8" }: { category: ResourceLibraryItem["category"]; className?: string }) {
  const iconProps = { className, "aria-hidden": true as const };
  if (category === "image") return <FileImage {...iconProps} />;
  if (category === "audio") return <FileAudio {...iconProps} />;
  if (category === "video") return <FileVideo {...iconProps} />;
  return <FileText {...iconProps} />;
}

export function ResourceThumbnail({ item, alt = item.title, className = "", children }: {
  item: ResourceLibraryItem;
  alt?: string;
  className?: string;
  children?: ReactNode;
}) {
  return <div className={`relative grid aspect-[4/3] place-items-center overflow-hidden bg-surface-muted text-brand-secondary ${className}`}>
    {item.category === "image" && item.previewUrl
      ? <Image src={item.previewUrl} alt={alt} width={520} height={390} unoptimized className="size-full object-cover" />
      : <ResourceTypeIcon category={item.category} className="size-10" />}
    {children}
  </div>;
}
