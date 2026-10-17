import Gem from "../Gem";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ wrong?: string }>;
}) {
  const { wrong } = await searchParams;
  return (
    <main className="login">
      <Gem kind="diamond" size={92} />
      <h1 className="gem-text">ORE</h1>
      <p className="lede">Find what's winning in paid social. Turn it into ads.</p>
      <form method="post" action="/api/login" className="card stack" data-gem="diamond">
        <label>
          <span className="label">Password</span>
          <input type="password" name="password" autoFocus required />
        </label>
        {wrong && <p className="error">That password didn't work.</p>}
        <button type="submit">Enter</button>
      </form>
    </main>
  );
}
