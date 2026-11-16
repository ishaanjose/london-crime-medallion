import type { Metadata } from "next";
import { routeMetadata } from "@/lib/siteMetadata";

export const metadata: Metadata = routeMetadata(
  "Area",
  "Enter a postcode to see crime in the surrounding neighbourhood compared with the London average.",
);

export default function Layout({ children }: LayoutProps<"/area">) {
  return children;
}
