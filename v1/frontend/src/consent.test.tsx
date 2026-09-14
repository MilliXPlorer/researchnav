import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConsentNotice from "./ConsentNotice";
import {
  CONSENT_VERSION,
  hasAcceptedCurrentConsent,
  readStoredConsent,
  storeConsentAcceptance,
} from "./consent";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

/** The notice only enables agreement once it has actually been scrolled. */
function scrollNoticeToEnd() {
  const region = screen.getByRole("region", {
    name: "Terms of use and Data Privacy notice",
  });
  Object.defineProperty(region, "scrollHeight", {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(region, "clientHeight", {
    value: 400,
    configurable: true,
  });
  Object.defineProperty(region, "scrollTop", {
    value: 600,
    configurable: true,
  });
  fireEvent.scroll(region);
}

describe("consent storage", () => {
  it("reports no acceptance until one is stored", () => {
    expect(hasAcceptedCurrentConsent()).toBe(false);
    expect(readStoredConsent()).toBeNull();
  });

  it("stores and recognises an acceptance of the current version", () => {
    const record = storeConsentAcceptance("2026-05-02T00:00:00.000Z");
    expect(record.version).toBe(CONSENT_VERSION);
    expect(hasAcceptedCurrentConsent()).toBe(true);
    expect(readStoredConsent()?.acceptedAt).toBe("2026-05-02T00:00:00.000Z");
  });

  it("re-prompts when the stored acceptance is for an older version", () => {
    window.localStorage.setItem(
      "researchnav.consent",
      JSON.stringify({ version: "1999-01-01", acceptedAt: "x" }),
    );
    expect(hasAcceptedCurrentConsent()).toBe(false);
  });

  it("re-prompts rather than throwing on malformed stored data", () => {
    window.localStorage.setItem("researchnav.consent", "not json");
    expect(hasAcceptedCurrentConsent()).toBe(false);
    window.localStorage.setItem("researchnav.consent", JSON.stringify({}));
    expect(hasAcceptedCurrentConsent()).toBe(false);
  });
});

describe("ConsentNotice", () => {
  it("requires scrolling before the agreement can be checked", () => {
    render(<ConsentNotice onAccept={vi.fn()} onDecline={vi.fn()} />);

    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(
      screen.getByText(
        "Scroll to the end of the notice to enable the agreement.",
      ),
    ).toBeInTheDocument();

    scrollNoticeToEnd();
    expect(screen.getByRole("checkbox")).toBeEnabled();
  });

  it("keeps continuing disabled until the agreement is checked", () => {
    const onAccept = vi.fn();
    render(<ConsentNotice onAccept={onAccept} onDecline={vi.fn()} />);

    const submit = screen.getByRole("button", { name: "Agree and continue" });
    expect(submit).toBeDisabled();

    scrollNoticeToEnd();
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("states the Data Privacy Act basis and the advisory nature of similarity", () => {
    render(<ConsentNotice onAccept={vi.fn()} onDecline={vi.fn()} />);
    expect(screen.getByText(/Republic Act No\. 10173/)).toBeInTheDocument();
    expect(
      screen.getByText(/it is not a finding of plagiarism/),
    ).toBeInTheDocument();
  });

  it("can be declined without accepting", () => {
    const onDecline = vi.fn();
    render(<ConsentNotice onAccept={vi.fn()} onDecline={onDecline} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(hasAcceptedCurrentConsent()).toBe(false);
  });
});

describe("GoogleSignInDialog consent gate", () => {
  it("shows the notice first and only reveals sign-in after agreeing", async () => {
    const { default: GoogleSignInDialog } =
      await import("./GoogleSignInDialog");
    render(<GoogleSignInDialog onClose={vi.fn()} onAuthenticated={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Terms and Data Privacy" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Continue with Google" }),
    ).not.toBeInTheDocument();

    scrollNoticeToEnd();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Agree and continue" }));

    expect(
      screen.getByRole("heading", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(hasAcceptedCurrentConsent()).toBe(true);
  });

  it("skips the notice when the current version was already accepted", async () => {
    storeConsentAcceptance();
    const { default: GoogleSignInDialog } =
      await import("./GoogleSignInDialog");
    render(<GoogleSignInDialog onClose={vi.fn()} onAuthenticated={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Terms and Data Privacy" }),
    ).not.toBeInTheDocument();
  });
});
