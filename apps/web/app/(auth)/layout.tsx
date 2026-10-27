import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";

/** Layout decision (sign in A, centred card): a small card on a quiet page, nothing else to distract. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-background-alt px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Link href="/" className="flex items-center gap-2 font-bold text-2xl text-link">
            <BrandLogo markClassName="h-7 w-7" />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
