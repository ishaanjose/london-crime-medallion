import type { Metadata } from "next";
import { routeMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = {
  ...routeMetadata(
    "Outcomes",
    "How often recorded crimes lead to a charge, and what happens to the rest.",
  ),
  robots: { index: false, follow: false },
};

export default function Layout({ children }: LayoutProps<"/outcomes">) {
  return children;
}
