import { useId, useRef, useState } from "react";
import { ScrollText } from "lucide-react";
import { Button } from "./components";
import { CONSENT_SECTIONS, CONSENT_VERSION } from "./consent";

/**
 * Terms of use and Data Privacy notice shown before sign-in can proceed.
 *
 * The notice must actually be scrolled to the end before the agreement control
 * becomes available, so acceptance is a deliberate act rather than one click on
 * an unread wall of text.
 */
export default function ConsentNotice({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const checkboxId = useId();

  const trackScroll = (element: HTMLDivElement) => {
    const reachedEnd =
      element.scrollTop + element.clientHeight >= element.scrollHeight - 8;
    if (reachedEnd) setScrolledToEnd(true);
  };

  return (
    <div className="consent-notice">
      <span className="dialog-icon">
        <ScrollText />
      </span>
      <p className="eyebrow">Before you sign in</p>
      <h2 id="google-signin-title">Terms and Data Privacy</h2>
      <p className="consent-intro">
        Read the notice below, then confirm your agreement to continue. Signing
        in is only possible after you agree.
      </p>

      <div
        className="consent-scroll"
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label="Terms of use and Data Privacy notice"
        onScroll={(event) => trackScroll(event.currentTarget)}
      >
        {CONSENT_SECTIONS.map((section) => (
          <section key={section.heading}>
            <h3>{section.heading}</h3>
            <p>{section.body}</p>
          </section>
        ))}
        <p className="consent-version">Notice version {CONSENT_VERSION}</p>
      </div>

      {!scrolledToEnd && (
        <p className="consent-hint">
          Scroll to the end of the notice to enable the agreement.
        </p>
      )}

      <label className="consent-agree" htmlFor={checkboxId}>
        <input
          id={checkboxId}
          type="checkbox"
          checked={agreed}
          disabled={!scrolledToEnd}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        <span>
          I have read and agree to the Terms of Use and the Data Privacy notice,
          and I consent to the processing of my personal data as described.
        </span>
      </label>

      <div className="consent-actions">
        <Button variant="secondary" onClick={onDecline}>
          Cancel
        </Button>
        <Button disabled={!agreed} onClick={onAccept}>
          Agree and continue
        </Button>
      </div>
    </div>
  );
}
