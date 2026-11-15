/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import type { ReactNode } from "react";
import { artUrl } from "./artFiles";

/** A delivered picture by key, or a drawn placeholder until the file arrives. */
export function Art({ k, alt, className = "", ext = "webp", children }: { k: string; alt: string; className?: string; ext?: string; children?: ReactNode }) {
  const url = artUrl(k, ext);
  return url
    ? <img className={`art ${className}`} src={url} alt={alt} data-art={k} />
    : <div className={`art ph ${className}`} role="img" aria-label={alt} data-art={k} data-placeholder="true">{children}</div>;
}
