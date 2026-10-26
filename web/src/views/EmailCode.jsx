import { useState } from "react";
import { confirmSignIn, signIn, signUp } from "aws-amplify/auth";

const CUSTOM = { authFlowType: "CUSTOM_WITHOUT_SRP" };

// One flow for everyone: email, then a 6-digit code we email (Cognito custom
// auth). A new email is signed up first (auto-confirmed; the code proves the
// address), then both new and returning carers get the same sign-in code.
export default function EmailCode() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email"); // email | code
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e) => {
    e?.preventDefault();
    const username = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(username)) return setError("Please enter a valid email address.");
    run(async () => {
      try {
        // Accounts are passwordless; Cognito still wants one, so it gets a long random one nobody uses.
        await signUp({ username, password: randomPassword(), options: { userAttributes: { email: username } } });
      } catch (err) {
        if (err.name !== "UsernameExistsException") throw err;
      }
      const { nextStep } = await signIn({ username, options: CUSTOM });
      if (nextStep.signInStep !== "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE") throw new Error(`Unexpected step: ${nextStep.signInStep}`);
      setStep("code");
      setCode("");
    });
  };

  const verify = (e) => {
    e.preventDefault();
    const answer = code.replace(/\D/g, "");
    if (answer.length !== 6) return setError("The code has 6 digits.");
    run(async () => {
      const { nextStep } = await confirmSignIn({ challengeResponse: answer });
      // Wrong code: Cognito asks again (same code, up to three tries).
      if (nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE") throw Object.assign(new Error(), { name: "CodeMismatchException" });
    });
  };

  if (step === "email") {
    return (
      <form className="paper form email-code" onSubmit={sendCode}>
        <label className="field">
          <span>Your email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy || !email.trim()}>
          {busy ? "Sending…" : "Email me a code"}
        </button>
        <p className="muted small">No password. We’ll email you a 6-digit code.</p>
      </form>
    );
  }

  return (
    <form className="paper form email-code" onSubmit={verify}>
      <h2 className="section-label">Check your email</h2>
      <p className="muted">
        We sent a 6-digit code to <strong>{email.trim()}</strong>. It works for 3 minutes.
      </p>
      <label className="field">
        <span>6-digit code</span>
        <input
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456"
          autoFocus
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || code.replace(/\D/g, "").length !== 6}>
        {busy ? "Checking…" : "Continue"}
      </button>
      <div className="email-code-links">
        <button type="button" className="link" disabled={busy} onClick={() => sendCode()}>
          Send a new code
        </button>
        <button type="button" className="link" disabled={busy} onClick={() => (setStep("email"), setError(""))}>
          Use a different email
        </button>
      </div>
    </form>
  );
}

// Meets Cognito's default policy (upper, lower, digit, symbol); never shown or reused.
function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
  return `Aa1!${body}`;
}

function friendly(err) {
  switch (err?.name) {
    case "CodeMismatchException":
      return "That code didn’t match. Check the email and try again.";
    case "NotAuthorizedException":
      return "Too many tries or the code expired. Send a new code.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many tries. Please wait a few minutes and try again.";
    default:
      return err?.message || "Something went wrong. Please try again.";
  }
}
