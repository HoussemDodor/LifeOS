import { SubTabs } from "@/components/SubTabs";

export default function AnalystLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubTabs
        label="Analyst views"
        items={[
          { name: "Report", href: "/finance/analyst" },
          { name: "Ask the analyst", href: "/finance/analyst/chat" },
        ]}
      />
      {children}
    </>
  );
}
