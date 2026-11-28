import { appIcon } from "@/lib/app-icon";

const VARIANTS = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "maskable-512": { size: 512, maskable: true },
} as const;

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(VARIANTS).map((variant) => ({ variant }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ variant: string }> }) {
  const v = VARIANTS[(await params).variant as keyof typeof VARIANTS];
  if (!v) return new Response("Not found", { status: 404 });
  return appIcon(v.size, { maskable: v.maskable });
}
