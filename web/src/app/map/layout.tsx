import type { Metadata } from "next";
import { routeMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = routeMetadata(
  "Map",
  "Crime rates for every London neighbourhood on a map, by crime type and period, with deprivation and other context layers.",
);

export default function Layout({ children }: LayoutProps<"/map">) {
  return children;
}
