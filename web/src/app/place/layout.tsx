import type { Metadata } from "next";
import { routeMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = routeMetadata(
  "Place",
  "How neighbourhood crime rates vary with deprivation, transport access and green space.",
);

export default function Layout({ children }: LayoutProps<"/place">) {
  return children;
}
