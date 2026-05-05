import { Sidebar } from "@/components/sidebar";

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="px-6 py-6 max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
