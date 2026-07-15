import { AppShell } from "@/components/AppShell";
import { MobilePrefsProvider } from "@/lib/ui-prefs/mobile-visibility";

export default function Home() {
  return (
    <MobilePrefsProvider>
      <AppShell />
    </MobilePrefsProvider>
  );
}
