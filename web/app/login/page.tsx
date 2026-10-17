export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ wrong?: string }>;
}) {
  const { wrong } = await searchParams;
  return (
    <main className="login">
      <div className="login-light" aria-hidden="true" />
      <h1 className="login-word">ORE</h1>
      <p className="login-line">Find what's winning in paid social. Take it apart. Make your own.</p>
      <form method="post" action="/api/login" className="login-form">
        <label className="sr-only" htmlFor="pw">Password</label>
        <input id="pw" type="password" name="password" placeholder="Password" autoFocus required />
        <button type="submit" aria-label="Enter">→</button>
      </form>
      {wrong && <p className="error">That password didn't work.</p>}
    </main>
  );
}
