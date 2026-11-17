import type { HTMLAttributes } from "react";

/**
 * Sections render as H2 on the homepage and as the page's H1 on their own
 * route. Sub-headings pass `level + 1` so the outline never skips a level.
 */
export type HeadingLevel = 1 | 2;

export function Heading({ level, ...props }: { level: number } & HTMLAttributes<HTMLHeadingElement>) {
  switch (Math.min(Math.max(level, 1), 4)) {
    case 1:
      return <h1 {...props} />;
    case 2:
      return <h2 {...props} />;
    case 3:
      return <h3 {...props} />;
    default:
      return <h4 {...props} />;
  }
}
