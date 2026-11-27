import { SectionTabs } from "@/components/SectionTabs";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SectionTabs moduleId="finance" />
      {children}
    </>
  );
}
