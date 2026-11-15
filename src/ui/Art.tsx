/**
 * SI disclosure: written with assistance from Claude (Anthropic), a large language
 * model, then reviewed, edited and tested by the Junior Astronaut team. See AI_USAGE.md.
 */
import type { ReactNode } from "react";
import { artUrl } from "./artFiles";
import { isSiArt } from "./siArt";

/** The visible label on an SI picture: "SI-generated", or just "SI" on small ones like portraits. */
export function SiTag({ short = false }: { short?: boolean }) {
  return <span className={`si-tag${short ? " short" : ""}`} title="This picture was made with SI (AI) tools" aria-label="SI-generated image">{short ? "SI" : "SI-generated"}</span>;
}

/**
 * A delivered picture by key, or a drawn placeholder until the file arrives. A picture
 * marked as SI-made in credits.json carries a visible label at its bottom edge.
 */
export function Art({ k, alt, className = "", ext = "webp", children }: { k: string; alt: string; className?: string; ext?: string; children?: ReactNode }) {
  const url = artUrl(k, ext);
  if (!url) return <div className={`art ph ${className}`} role="img" aria-label={alt} data-art={k} data-placeholder="true">{children}</div>;
  const img = <img className={`art ${className}`} src={url} alt={alt} data-art={k} />;
  if (!isSiArt(k, ext)) return img;
  const small = /\bportrait\b/.test(className);
  return <span className={`si-art${small ? " small" : ""}`} data-si="true">{img}<SiTag short={small} /></span>;
}
