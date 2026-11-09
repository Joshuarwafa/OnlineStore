import { CircleCheck, CircleX, Database, DatabaseZap, ListRestart, LoaderCircle, Save, Server, Undo2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { StatusBanner } from "../../../shared/StatusBanner";
import {
  getConnections,
  listDatabases,
  saveConnections,
  testConnections,
  type ConnectionSettings,
  type ConnectionTestResult,
} from "../connections";

const empty: ConnectionSettings = { server: "", username: "", companyDatabase: "", commonDatabase: "", stagingDatabase: "" };

const databaseFields: { key: keyof ConnectionSettings; label: string; hint: string }[] = [
  { key: "companyDatabase", label: "Sage company database", hint: "The Sage Evolution company, e.g. Cold Chain Byo 2024" },
  { key: "commonDatabase", label: "Sage common database", hint: "Sage's shared database, usually SageCommon" },
  { key: "stagingDatabase", label: "Store database", hint: "The store's own database (create it in SQL Server first)" },
];

type Busy = "loading" | "testing" | "saving" | "listing" | null;

export function DatabaseSettings() {
  const [saved, setSaved] = useState<ConnectionSettings>(empty);
  const [form, setForm] = useState<ConnectionSettings>(empty);
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [busy, setBusy] = useState<Busy>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [test, setTest] = useState<ConnectionTestResult | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);

  const load = () => {
    setBusy("loading");
    setLoadError(null);
    getConnections()
      .then((s) => {
        const values = pick(s);
        setSaved(values);
        setForm(values);
        setPasswordSet(s.passwordSet);
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setBusy(null));
  };

  useEffect(load, []);

  const dirty = password !== "" || (Object.keys(empty) as (keyof ConnectionSettings)[]).some((k) => form[k] !== saved[k]);

  const update = (key: keyof ConnectionSettings, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setNotice(null);
    setTest(null);
  };

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onTest = () =>
    run("testing", async () => {
      setTest(await testConnections({ ...form, password }));
    });

  const onListDatabases = () =>
    run("listing", async () => {
      const names = await listDatabases({ server: form.server, username: form.username, password });
      setDatabases(names);
      setNotice(`Found ${names.length} database${names.length === 1 ? "" : "s"} on ${form.server}. Pick them from the lists below.`);
    });

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    run("saving", async () => {
      const result = await saveConnections({ ...form, password });
      const values = pick(result);
      setSaved(values);
      setForm(values);
      setPassword("");
      setPasswordSet(result.passwordSet);
      setNotice("Saved. SageAPI uses the new settings straight away.");
    });
  };

  const canSignIn = form.server.trim() !== "" && form.username.trim() !== "" && (password !== "" || passwordSet);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Database connections</h1>
          <p className="subtitle">Sage and the store database are on the same SQL Server and use the same SQL login.</p>
        </div>
      </header>

      <StatusBanner loading={busy === "loading"} error={loadError} onRetry={load} loadingText="Loading the saved settings…" />

      {!loadError && busy !== "loading" && (
        <form className="settings-form" onSubmit={onSave}>
          <section className="panel form-panel">
            <h2 className="card-title">
              <Server size={17} aria-hidden="true" />
              Server
            </h2>
            <div className="form-grid">
              <label className="field span-2">
                <span>SQL Server</span>
                <input
                  value={form.server}
                  onChange={(e) => update("server", e.target.value)}
                  placeholder="e.g. JOSHUA-HP\MSSQLSERVER22"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span>Username</span>
                <input
                  value={form.username}
                  onChange={(e) => update("username", e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setTest(null);
                    setNotice(null);
                  }}
                  placeholder={passwordSet ? "Saved — leave blank to keep it" : "Enter the password"}
                  autoComplete="new-password"
                />
              </label>
            </div>
          </section>

          <section className="panel form-panel">
            <div className="form-panel-head">
              <h2 className="card-title">
                <Database size={17} aria-hidden="true" />
                Databases
              </h2>
              <button type="button" className="button" onClick={onListDatabases} disabled={!canSignIn || busy !== null}>
                {busy === "listing" ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <ListRestart size={15} aria-hidden="true" />}
                Load databases from server
              </button>
            </div>
            <datalist id="server-databases">
              {databases.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <div className="form-grid">
              {databaseFields.map((f) => (
                <label key={f.key} className="field">
                  <span>{f.label}</span>
                  <input
                    list="server-databases"
                    value={form[f.key]}
                    onChange={(e) => update(f.key, e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <small className="muted">{f.hint}</small>
                </label>
              ))}
            </div>
          </section>

          {test && <TestResults result={test} />}

          {error && (
            <div className="banner error" role="alert">
              <span className="banner-text">
                <CircleX size={18} aria-hidden="true" />
                {error}
              </span>
            </div>
          )}

          <div className="form-actions">
            <span className="muted small">{notice ?? (dirty ? "You have unsaved changes." : "")}</span>
            <div className="page-actions">
              {dirty && (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setForm(saved);
                    setPassword("");
                    setTest(null);
                  }}
                  disabled={busy !== null}
                >
                  <Undo2 size={15} aria-hidden="true" />
                  Undo changes
                </button>
              )}
              <button type="button" className="button" onClick={onTest} disabled={!canSignIn || busy !== null}>
                {busy === "testing" ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <DatabaseZap size={15} aria-hidden="true" />}
                {busy === "testing" ? "Testing…" : "Test connection"}
              </button>
              <button type="submit" className="button primary" disabled={!dirty || busy !== null}>
                {busy === "saving" ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
                Save
              </button>
            </div>
          </div>
        </form>
      )}
    </>
  );
}

function TestResults({ result }: { result: ConnectionTestResult }) {
  return (
    <section className={`panel form-panel test-results ${result.ok ? "ok" : "failed"}`} aria-live="polite">
      <h2 className="card-title">
        {result.ok ? <CircleCheck size={17} aria-hidden="true" /> : <CircleX size={17} aria-hidden="true" />}
        {result.message}
      </h2>
      {result.serverVersion && <p className="muted small no-margin">{result.serverVersion}</p>}
      <ul className="check-results">
        {result.checks.map((c) => (
          <li key={c.name}>
            <span className={`check-icon ${c.ok ? "status-good" : "status-critical"}`} aria-hidden="true">
              {c.ok ? <CircleCheck size={16} /> : <CircleX size={16} />}
            </span>
            <span>
              <strong>{c.name}</strong>
              <span className="visually-hidden">{c.ok ? " passed" : " failed"}</span>
              <span className="check-detail">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const pick = (s: ConnectionSettings): ConnectionSettings => ({
  server: s.server ?? "",
  username: s.username ?? "",
  companyDatabase: s.companyDatabase ?? "",
  commonDatabase: s.commonDatabase ?? "",
  stagingDatabase: s.stagingDatabase ?? "",
});
