export function PromoterLogoutButton() {
  return (
    <form action="/auth/logout" method="post">
      <button className="button secondary" type="submit">
        Logout
      </button>
    </form>
  );
}
