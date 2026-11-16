import type { Metadata } from "next";
import { routeMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = routeMetadata(
  "Concentration",
  "How much of London's crime falls in a small share of its neighbourhoods.",
);

export default function Layout({ children }: LayoutProps<"/concentration">) {
  return children;
}
