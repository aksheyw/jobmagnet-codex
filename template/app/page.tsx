import { PortfolioRender } from "@/components/PortfolioRender";
import type { PortfolioContent } from "@/lib/types";
import content from "../portfolio-content.json";

export default function Page() {
  return <PortfolioRender content={content as PortfolioContent} />;
}
