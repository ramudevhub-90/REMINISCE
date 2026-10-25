import { useState } from "react";
import { autoSignIn, confirmSignIn, confirmSignUp, resendSignUpCode, signIn, signUp } from "aws-amplify/auth";

const OTP = { authFlowType: "USER_AUTH", preferredChallenge: "EMAIL_OTP" };

// One flow for everyone: email, then a 6-digit code. A new email creates the
// account and gets a verification code; a returning carer gets a sign-in code.
// Either way, entering the code signs them in (the app listens for that).
export default function EmailCode() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("email"); // email | signin-code | signup-code
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
      // Try to create the account first: Cognito hides whether an email is
      // registered on sign-in, so a new email would get a silent fake challenge.
      try {
        await signUp({ username, options: { userAttributes: { email: username }, autoSignIn: OTP } });
        setStep("signup-code");
      } catch (err) {
        if (err.name !== "UsernameExistsException") throw err;
        try {
          const { nextStep } = await signIn({ username, options: OTP });
          if (nextStep.signInStep !== "CONFIRM_SIGN_IN_WITH_EMAIL_CODE") throw new Error(`Unexpected step: ${nextStep.signInStep}`);
          setStep("signin-code");
        } catch (signInErr) {
          // Started signing up before but never entered the code: send it again.
          if (signInErr.name !== "UserNotConfirmedException") throw signInErr;
          await resendSignUpCode({ username });
          setStep("signup-code");
        }
      }
      setCode("");
    });
  };

  const verify = (e) => {
    e.preventDefault();
    const confirmationCode = code.replace(/\D/g, "");
    if (confirmationCode.length !== 6) return setError("The code has 6 digits.");
    run(async () => {
      if (step === "signin-code") {
        await confirmSignIn({ challengeResponse: confirmationCode });
      } else {
        await confirmSignUp({ username: email.trim().toLowerCase(), confirmationCode });
        await autoSignIn();
      }
    });
  };

  if (step === "email") {
    return (
      <form className="paper form email-code" onSubmit={sendCode}>
        <h2 className="section-label">Sign in or create an account</h2>
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
        <p className="muted small">No password needed. We’ll email you a 6-digit code each time you sign in.</p>
      </form>
    );
  }

  return (
    <form className="paper form email-code" onSubmit={verify}>
      <h2 className="section-label">Check your email</h2>
      <p className="muted">
        We sent a 6-digit code to <strong>{email.trim()}</strong>
        {step === "signup-code" ? " to set up your account." : "."}
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

function friendly(err) {
  switch (err?.name) {
    case "CodeMismatchException":
      return "That code didn’t match. Check the email and try again.";
    case "ExpiredCodeException":
      return "That code has expired. Send a new one.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many tries. Please wait a few minutes and try again.";
    case "NotAuthorizedException":
      return "That code didn’t work. Send a new one and try again.";
    default:
      return err?.message || "Something went wrong. Please try again.";
  }
}
