import { AppShell } from "@/components/AppShell";

// One page for every address: the phone answers each screen's path with it.
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ slug: [""] }];
}

export default function Page() {
  return <AppShell />;
}
