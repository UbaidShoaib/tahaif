import Link from "next/link";
import { Gift } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Link href="/" className="flex items-center gap-2 font-bold text-2xl text-primary-600">
            <Gift className="h-7 w-7" />
            <span>Tahaif</span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
