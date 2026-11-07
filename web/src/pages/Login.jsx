import { useState } from "react";
import { AuthShell, Button, Input, Alert } from "@kasumi/ui";
import { api } from "@/api.js";
import { BRAND } from "@/brand.js";
import { COPY } from "@/copy.js";

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    api("/auth/login", { method: "POST", body: { email, password } }).then(
      (user) => onSignedIn(user),
      (err) => { setError(err.status === 401 ? COPY.AUTH.FAILED : err.message); setBusy(false); },
    );
  };

  return (
    <AuthShell appName={BRAND.NAME} tagline={BRAND.TAGLINE} icon={BRAND.ICON}
      highlights={COPY.AUTH.HIGHLIGHTS} assurance={COPY.AUTH.ASSURANCE}>
      <form onSubmit={submit} className="flex flex-col gap-stack" noValidate>
        <div>
          <h1 className="text-headline text-fg">{COPY.AUTH.TITLE}</h1>
          <p className="text-body text-fg-muted">{COPY.AUTH.SUBTITLE}</p>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label={COPY.AUTH.EMAIL} type="email" autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} required autoFocus />
        <Input label={COPY.AUTH.PASSWORD} type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" loading={busy} disabled={!email || !password}>
          {busy ? COPY.AUTH.BUSY : COPY.AUTH.SUBMIT}
        </Button>
        <p className="text-caption text-fg-muted">{COPY.AUTH.DEMO}</p>
      </form>
    </AuthShell>
  );
}
