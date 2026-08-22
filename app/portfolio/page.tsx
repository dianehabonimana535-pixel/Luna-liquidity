import PortfolioView from "@/components/PortfolioView";

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="mb-6 font-display text-2xl font-semibold text-foreground">Portfolio</h1>
      <PortfolioView />
    </div>
  );
}
