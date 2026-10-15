import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Verify Email" };

export default function VerifyEmailPage() {
  return (
    <Card>
      <CardContent className="pt-6">
        <Suspense>
          <VerifyEmailForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}
