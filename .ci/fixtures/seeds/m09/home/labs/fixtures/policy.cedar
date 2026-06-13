// Control AC-6-legacy-admin: access changes must never grant the legacy-admin role.
// Cedar frames the verdict as authorization: principal / action / resource / context.
// forbid always wins over any permit, so this denial is non-overridable.
forbid(
  principal,
  action == Action::"grantRole",
  resource
)
when { resource.role == "legacy-admin" };
