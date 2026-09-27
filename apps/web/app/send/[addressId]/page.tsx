"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { useDeliveryStore } from "@/stores/delivery.store";
import { accountApi } from "@/lib/account";

// Occasion pages a reminder may open; anything else goes to the home page.
const OCCASIONS = new Set(["birthday", "anniversary", "eid-ul-fitr", "eid-ul-azha", "mothers-day"]);

/**
 * "Send again" from an occasion reminder: deliver to that person's city,
 * preselect them at checkout, and open the occasion's gifts.
 */
function SendTo() {
  const { addressId } = useParams<{ addressId: string }>();
  const occasion = useSearchParams().get("occasion") ?? "";
  const router = useRouter();
  const { accessToken, isLoading } = useAuthStore();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const here = `/send/${addressId}${occasion ? `?occasion=${occasion}` : ""}`;
    if (!accessToken) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(here)}`);
      return;
    }
    const delivery = useDeliveryStore.getState();
    void Promise.all([accountApi.listAddresses(accessToken), delivery.loadCities()])
      .then(([addresses]) => {
        const person = addresses.find((a) => a.id === addressId);
        if (!person) {
          setMissing(true);
          return;
        }
        const city = useDeliveryStore
          .getState()
          .cities.find((c) => c.name.toLowerCase() === person.city_name.toLowerCase());
        if (city) delivery.setCity(city.id);
        delivery.setSendTo(person.id);
        router.replace(OCCASIONS.has(occasion) ? `/occasion/${occasion}` : "/");
      })
      .catch(() => setMissing(true));
  }, [accessToken, isLoading, addressId, occasion, router]);

  if (missing) {
    return (
      <div className="container mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4 text-muted-foreground">We couldn&apos;t find that person in your family &amp; friends.</p>
        <Link href="/" className="text-link hover:underline">Browse gifts</Link>
      </div>
    );
  }
  return <p className="container mx-auto px-4 py-16 text-center text-muted-foreground">Getting things ready…</p>;
}

// useSearchParams needs a Suspense boundary in the App Router.
export default function SendToPage() {
  return (
    <Suspense>
      <SendTo />
    </Suspense>
  );
}
