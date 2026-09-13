export type UserManagementFilters = {
  search: string;
  role: string;
  access_status: string;
};

type FilterableUser = {
  id: string;
  email: string;
  role: string;
  access_status: string;
};

export function filterUserRows<T extends FilterableUser>(
  users: T[],
  filters: UserManagementFilters,
  userName: (user: T) => string,
) {
  const search = filters.search.trim().toLocaleLowerCase();

  return users.filter((user) => {
    const searchable = [userName(user), user.email, user.id]
      .join(" ")
      .toLocaleLowerCase();

    return (
      (!search || searchable.includes(search)) &&
      (!filters.role || user.role === filters.role) &&
      (!filters.access_status || user.access_status === filters.access_status)
    );
  });
}
