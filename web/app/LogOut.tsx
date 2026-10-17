export default function LogOut() {
  return (
    <form method="post" action="/api/logout">
      <button type="submit" className="link-button">
        Log out
      </button>
    </form>
  );
}
