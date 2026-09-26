"use client";

import Link from "next/link";
import { UserPlus } from "lucide-react";
import { useAuthStore } from "@/stores/auth.store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** After a guest order: how to find it again, and an optional account. Hidden for signed-in buyers. */
export function GuestOrderNote() {
  const { user, isLoading } = useAuthStore();
  if (isLoading || user) return null;
  return (
    <Alert variant="info" className="mt-6">
      <UserPlus aria-hidden className="h-4 w-4" />
      <AlertTitle>Keep this link to track your gift</AlertTitle>
      <AlertDescription>
        <p>We&apos;ve emailed you the tracking link too.</p>
        <p className="mt-1">
          Want all your orders in one place, saved addresses and loyalty points next time?{" "}
          <Link href="/register" className="font-medium underline underline-offset-2">
            Create an account
          </Link>
          .
        </p>
      </AlertDescription>
    </Alert>
  );
}
