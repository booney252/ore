export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ wrong?: string }>;
}) {
  const { wrong } = await searchParams;
  return (
    <main className="narrow">
      <h1>Ore</h1>
      <p className="muted">Creative strategy engine</p>
      <form method="post" action="/api/login" className="card stack">
        <label>
          Password
          <input type="password" name="password" autoFocus required />
        </label>
        {wrong && <p className="error">That password didn't work.</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
