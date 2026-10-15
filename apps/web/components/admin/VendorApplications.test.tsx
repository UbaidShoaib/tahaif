import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VendorApplications } from "@/components/admin/VendorApplications";
import { apiFetch, ApiError } from "@/lib/api";
import type * as ApiModule from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof ApiModule>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});

const row = {
  id: "v1",
  name: "Gulberg Florist",
  slug: "gulberg-florist",
  city_id: "c1",
  city_name: "Lahore",
  contact_phone: "+92 300 1234567",
  description: "Hand-tied bouquets.",
  status: "pending",
  review_note: null,
  created_at: "2026-10-14T10:00:00Z",
  reviewed_at: null,
  bank_account_title: "Ayesha Khan",
  bank_name: "Meezan Bank",
  bank_iban: "PK36SCBL0000001123456702",
  documents: [
    { id: "d1", kind: "cnic_front", filename: "front.jpg", content_type: "image/jpeg", created_at: "2026-10-14T10:00:00Z", url: "https://signed.example/front" },
    { id: "d2", kind: "cnic_back", filename: "back.jpg", content_type: "image/jpeg", created_at: "2026-10-14T10:00:00Z", url: null },
  ],
  missing_documents: [] as string[],
  applicant_email: "ayesha@example.com",
  applicant_name: "Ayesha Khan",
};

describe("VendorApplications", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("shows who applied and for what", async () => {
    vi.mocked(apiFetch).mockResolvedValue([row]);
    render(<VendorApplications token="tok" />);

    expect(await screen.findByText("Gulberg Florist")).toBeInTheDocument();
    expect(screen.getByText(/Ayesha Khan · ayesha@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/Lahore · \+92 300 1234567/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/admin/vendor-applications?status=pending", { token: "tok" });
  });

  it("says so when nothing is waiting", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    render(<VendorApplications token="tok" />);

    expect(await screen.findByText("No shop applications are waiting.")).toBeInTheDocument();
  });

  it("approves and reloads the queue", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce([row]).mockResolvedValueOnce({}).mockResolvedValueOnce([]);
    render(<VendorApplications token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Approve shop" }));

    expect(await screen.findByText("No shop applications are waiting.")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/admin/vendor-applications/v1/approve", {
      method: "POST",
      token: "tok",
      body: undefined,
    });
  });

  it("asks for a reason before rejecting and sends it", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce([row]).mockResolvedValueOnce({}).mockResolvedValueOnce([]);
    render(<VendorApplications token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
    expect(apiFetch).toHaveBeenCalledTimes(1); // nothing sent until confirmed
    await userEvent.type(screen.getByLabelText(/Reason/), "No bakeries yet.");
    await userEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));

    expect(await screen.findByText("No shop applications are waiting.")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/admin/vendor-applications/v1/reject", {
      method: "POST",
      token: "tok",
      body: { note: "No bakeries yet." },
    });
  });

  it("keeps the application on screen when the decision fails", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce([row])
      .mockRejectedValueOnce(new ApiError(409, "Application is already approved"));
    render(<VendorApplications token="tok" />);

    await userEvent.click(await screen.findByRole("button", { name: "Approve shop" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Application is already approved");
    expect(screen.getByText("Gulberg Florist")).toBeInTheDocument();
  });

  it("shows payout details and opens documents through their signed links", async () => {
    vi.mocked(apiFetch).mockResolvedValue([row]);
    render(<VendorApplications token="tok" />);

    expect(await screen.findByText("PK36SCBL0000001123456702")).toBeInTheDocument();
    expect(screen.getByText("Meezan Bank")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /CNIC \(front\)/ })).toHaveAttribute("href", "https://signed.example/front");
    expect(screen.getByText(/CNIC \(back\) \(link unavailable\)/)).toBeInTheDocument();
  });

  it("keeps Approve locked until the CNIC is uploaded", async () => {
    vi.mocked(apiFetch).mockResolvedValue([{ ...row, documents: [], missing_documents: ["cnic_front", "cnic_back"] }]);
    render(<VendorApplications token="tok" />);

    expect(await screen.findByText(/Missing: CNIC \(front\), CNIC \(back\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve shop/ })).toBeDisabled();
  });
});
