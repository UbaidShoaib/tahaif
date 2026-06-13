import { Card, CardContent } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reset Password" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardContent className="pt-6">
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
