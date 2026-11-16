import type { Metadata } from "next";
import { routeMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = routeMetadata(
  "Data trust",
  "Test results, known issues, source freshness and lineage behind every number on the site.",
);

export default function Layout({ children }: LayoutProps<"/trust">) {
  return children;
}
