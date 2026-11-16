import type { Metadata } from "next";

export const SITE_NAME = "London Crime Medallion";

export const SITE_DESCRIPTION =
  "Crime rates for every London neighbourhood from police-recorded data, with the data checks behind them.";

const PREVIEW_ALT =
  "Map of London neighbourhoods shaded by crimes per 1,000 residents";

// The root gets its preview image from app/opengraph-image.png and
// app/twitter-image.png. A route that sets openGraph or twitter replaces the
// whole object and loses that image, so routes name it explicitly.
const OG_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: PREVIEW_ALT };
const TWITTER_IMAGE = { url: "/twitter-image.png", width: 1200, height: 630, alt: PREVIEW_ALT };

const OPEN_GRAPH_BASE = {
  type: "website",
  siteName: SITE_NAME,
  locale: "en_GB",
} as const;

const TWITTER_BASE = { card: "summary_large_image" } as const;

export function routeMetadata(title: string, description: string): Metadata {
  const fullTitle = `${title} | ${SITE_NAME}`;
  return {
    title,
    description,
    openGraph: { ...OPEN_GRAPH_BASE, title: fullTitle, description, images: [OG_IMAGE] },
    twitter: { ...TWITTER_BASE, title: fullTitle, description, images: [TWITTER_IMAGE] },
  };
}

export const rootMetadata: Metadata = {
  // Change this when the site moves to its own domain
  metadataBase: new URL("https://london-crime-medallion.pages.dev"),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: { ...OPEN_GRAPH_BASE, title: SITE_NAME, description: SITE_DESCRIPTION },
  twitter: { ...TWITTER_BASE, title: SITE_NAME, description: SITE_DESCRIPTION },
};
