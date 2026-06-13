import { Card, CardContent } from "@/components/ui/card";
import { RegisterForm } from "@/components/auth/RegisterForm";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create Account" };

export default function RegisterPage() {
  return (
    <Card>
      <CardContent className="pt-6">
        <RegisterForm />
      </CardContent>
    </Card>
  );
}
