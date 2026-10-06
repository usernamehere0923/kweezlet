import type { CSSProperties } from "react";

/**
 * A glyph from the "Anthropic Icons" variable font (the @font-face is in
 * index.css; the file is the one ../rongo and ../loom ship).
 *
 * The codepoints sit in the private-use area and the font carries no names
 * for them, so this map IS the name. Copied from ../loom's map: carry a
 * codepoint over from there when a glyph is needed, never guess one.
 *
 *   <Icon name="search" />
 *   <Icon name="settings" size="1.5rem" label="Settings" />
 */
const CODEPOINTS = {
  plus: 0xe001,
  addCircle: 0xe032,
  check: 0xe03b,
  checkCircle: 0xe03c,
  close: 0xe10f,
  closeCircle: 0xe110,
  chevronDown: 0xe027,
  chevronLeft: 0xe029,
  chevronRight: 0xe02a,
  search: 0xe0d3,
  settings: 0xe0d6,
  sliders: 0xe070,
  edit: 0xe064,
  trash: 0xe101,
  copy: 0xe056,
  upload: 0xe06d,
  archive: 0xe0c9,
  folder: 0xe072,
  folderPlus: 0xe074,
  learn: 0xe083,
  bulb: 0xe097,
  star: 0xe0e7,
  starFilled: 0xe0e8,
  user: 0xe104,
  users: 0xe106,
  lock: 0xe0a1,
  eye: 0xe069,
  eyeOff: 0xe06a,
  globe: 0xe082,
  clock: 0xe068,
  bell: 0xe0b5,
  play: 0xe0c4,
  pause: 0xe0bb,
  stop: 0xe0ec,
  retry: 0xe11d,
  undo: 0xe11e,
  volume: 0xe0e4,
  mic: 0xe0ab,
  warning: 0xe109,
  alertCircle: 0xe10a,
  thumbsUp: 0xe0fb,
  thumbsDown: 0xe0f9,
  moreHorizontal: 0xe061,
  moreVertical: 0xe062,
  externalLink: 0xe00e,
  sortUp: 0xe013,
  sortDown: 0xe009,
  code: 0xe048,
  message: 0xe037,
  feather: 0xe0ed,
  artifact: 0xe017,
  project: 0xe0cb,
  sun: 0xe0ee,
} as const;

export type IconName = keyof typeof CODEPOINTS;
export const ICON_NAMES = Object.keys(CODEPOINTS) as IconName[];

export function Icon({
  name,
  className = "",
  size = "1.25rem",
  label,
}: {
  name: IconName;
  className?: string;
  /** The glyph's font-size, which is what controls its size. */
  size?: string;
  /** Only when the icon means something on its own. Next to a text label it is decoration. */
  label?: string;
}) {
  const style: CSSProperties = {
    fontFamily: '"Anthropic Icons"',
    fontSize: size,
    lineHeight: 1,
    fontStyle: "normal",
    fontWeight: 400,
    display: "inline-block",
    flexShrink: 0,
  };
  return (
    <span
      className={className}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {String.fromCodePoint(CODEPOINTS[name])}
    </span>
  );
}
