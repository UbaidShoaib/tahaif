import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SellApplication, type VendorApplication } from "@/components/vendor/SellApplication";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const CITIES = [{ id: "c1", name: "Lahore" }, { id: "c2", name: "Karachi" }];
const application: VendorApplication = {
  id: "v1",
  name: "Gulberg Florist",
  slug: "gulberg-florist",
  city_id: "c1",
  city_name: "Lahore",
  contact_phone: "+92 300 1234567",
  description: "Bouquets",
  status: "pending",
  review_note: null,
  created_at: "2026-10-14T10:00:00Z",
  reviewed_at: null,
  bank_account_title: "Ayesha Khan",
  bank_name: "Meezan Bank",
  bank_iban: "PK36SCBL0000001123456702",
  documents: [
    { id: "d1", kind: "cnic_front", filename: "front.jpg", content_type: "image/jpeg", created_at: "2026-10-14T10:00:00Z", url: "https://signed.example/front" },
    { id: "d2", kind: "cnic_back", filename: "back.jpg", content_type: "image/jpeg", created_at: "2026-10-14T10:00:00Z", url: "https://signed.example/back" },
  ],
  missing_documents: [],
};

const refresh = vi.fn();

function signIn(role: "customer" | "vendor" = "customer") {
  useAuthStore.setState({
    user: { id: "u1", email: "a@example.com", role } as never,
    accessToken: "tok",
    isLoading: false,
    refresh,
  });
}

/** Answer GET /cities and GET /vendor/application; `mine` null means "not applied" (404). */
function serve(mine: VendorApplication | null) {
  vi.mocked(apiFetch).mockImplementation((path: string, options?: { method?: string }) => {
    if (path === "/cities") return Promise.resolve(CITIES);
    if (path === "/vendor/application" && options?.method === "POST") {
      return Promise.resolve({ ...application, name: "Rose Corner" });
    }
    if (path === "/vendor/application") {
      return mine ? Promise.resolve(mine) : Promise.reject(new ApiError(404, "Application not found"));
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

describe("SellApplication", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    refresh.mockReset();
  });

  it("asks signed-out visitors to sign in and come back", () => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: false });
    render(<SellApplication />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?callbackUrl=%2Fsell");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("explains each field that is wrong and sends nothing", async () => {
    signIn();
    serve(null);
    render(<SellApplication />);

    await userEvent.type(await screen.findByLabelText(/Shop name/), "x");
    await userEvent.type(screen.getByLabelText(/Contact phone/), "call me");
    await userEvent.click(screen.getByRole("button", { name: "Send application" }));

    expect(await screen.findByText("Enter your shop's name")).toBeInTheDocument();
    expect(screen.getByText("Choose the city your shop is in")).toBeInTheDocument();
    expect(screen.getByText(/Use digits only/)).toBeInTheDocument();
    expect(screen.getByText(/24-character Pakistani IBAN/)).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/vendor/application", expect.objectContaining({ method: "POST" }));
  });

  it("sends the application and then shows it as under review", async () => {
    signIn();
    serve(null);
    render(<SellApplication />);

    await userEvent.type(await screen.findByLabelText(/Shop name/), "Rose Corner");
    await userEvent.selectOptions(screen.getByLabelText(/City/), "c1");
    await userEvent.type(screen.getByLabelText(/Contact phone/), "+92 300 1234567");
    await userEvent.type(screen.getByLabelText(/Account title/), "Ayesha Khan");
    await userEvent.type(screen.getByLabelText(/^Bank/), "Meezan Bank");
    await userEvent.type(screen.getByLabelText(/IBAN/), "pk36 scbl 0000 0011 2345 6702");
    await userEvent.click(screen.getByRole("button", { name: "Send application" }));

    expect(await screen.findByText(/We.re reviewing Rose Corner/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/vendor/application", {
      method: "POST",
      token: "tok",
      body: {
        name: "Rose Corner",
        city_id: "c1",
        contact_phone: "+92 300 1234567",
        description: null,
        bank_account_title: "Ayesha Khan",
        bank_name: "Meezan Bank",
        bank_iban: "PK36SCBL0000001123456702",
      },
    });
  });

  it("shows the server's reason when the application is refused", async () => {
    signIn();
    serve(null);
    render(<SellApplication />);
    await userEvent.type(await screen.findByLabelText(/Shop name/), "Rose Corner");
    await userEvent.selectOptions(screen.getByLabelText(/City/), "c1");
    await userEvent.type(screen.getByLabelText(/Contact phone/), "+92 300 1234567");
    await userEvent.type(screen.getByLabelText(/Account title/), "Ayesha Khan");
    await userEvent.type(screen.getByLabelText(/^Bank/), "Meezan Bank");
    await userEvent.type(screen.getByLabelText(/IBAN/), "pk36 scbl 0000 0011 2345 6702");
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError(409, "Your application is already being reviewed"));

    await userEvent.click(screen.getByRole("button", { name: "Send application" }));

    expect(await screen.findByText("Your application is already being reviewed")).toBeInTheDocument();
  });

  it("shows a rejected application's reason with the form filled in to send again", async () => {
    signIn();
    serve({ ...application, status: "rejected", review_note: "No bakeries yet." });
    render(<SellApplication />);

    expect(await screen.findByText(/No bakeries yet\./)).toBeInTheDocument();
    expect(screen.getByLabelText(/Shop name/)).toHaveValue("Gulberg Florist");
    expect(screen.getByRole("button", { name: "Send again" })).toBeInTheDocument();
  });

  it("links an approved owner to the portal and refreshes a stale buyer role", async () => {
    signIn("customer");
    serve({ ...application, status: "approved" });
    render(<SellApplication />);

    expect(await screen.findByRole("link", { name: "Open the vendor portal" })).toHaveAttribute("href", "/vendor/dashboard");
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does not refresh the session when the role is already vendor", async () => {
    signIn("vendor");
    serve({ ...application, status: "approved" });
    render(<SellApplication />);

    await screen.findByRole("link", { name: "Open the vendor portal" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("asks for the CNIC after applying and uploads each file as it is picked", async () => {
    signIn();
    const waiting = { ...application, documents: [], missing_documents: ["cnic_front", "cnic_back"] as VendorApplication["missing_documents"] };
    serve(waiting);
    render(<SellApplication />);

    expect(await screen.findByText(/One more step/)).toBeInTheDocument();
    vi.mocked(apiFetch).mockResolvedValueOnce({ ...waiting, missing_documents: ["cnic_back"] });
    const file = new File(["img"], "front.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Upload CNIC (front)"), file);

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/vendor/application/documents",
        expect.objectContaining({ method: "POST", token: "tok", body: expect.any(FormData) as unknown }),
      ),
    );
    expect(await screen.findByText(/upload: CNIC \(back\)\./)).toBeInTheDocument();
  });

  it("shows an application with all documents as under review", async () => {
    signIn();
    serve(application);
    render(<SellApplication />);

    expect(await screen.findByText(/We.re reviewing Gulberg Florist/)).toBeInTheDocument();
    expect(screen.getByText("front.jpg")).toBeInTheDocument();
  });
});
